/**
 * Custom d3-force functions for layered DAG layout.
 *
 * Two forces create equilibrium:
 *   1. Within-layer repulsion — spreads nodes apart inside each layer
 *   2. Cross-layer springs   — pulls connected nodes toward x-y alignment
 *
 * Both forces act ONLY on vx/vy. The z-axis is locked to layer planes via fz
 * in GraphView, so these forces never touch z.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Within-Layer Repulsion (inverse-linear, weight-scaled)
//
//   F_rep(i,j) = k_rep * w_i * w_j / max(|Δ|, ε)  ·  Δ̂
//
//   • Only pairs in the SAME layer
//   • Inverse-linear (1/d) falloff — softer than Coulomb
//   • Heavier nodes (higher word frequency) push harder
// ─────────────────────────────────────────────────────────────────────────────
export function forceWithinLayerRepulsion(strength = 200, maxDistance = 500) {
  let nodes;
  let _strength = strength;
  let _maxDistance = maxDistance;
  const EPSILON = 1.0; // minimum distance clamp

  // Pre-built index: layer → [node, node, …]
  let layerIndex = new Map();
  // Global max weight for normalization (so w_i * w_j stays in [0, 1])
  let maxWeight = 1;

  function rebuildIndex() {
    layerIndex = new Map();
    maxWeight = 1;
    for (const node of nodes) {
      const layer = node.layer;
      if (!layerIndex.has(layer)) layerIndex.set(layer, []);
      layerIndex.get(layer).push(node);
      if ((node.weight || 1) > maxWeight) maxWeight = node.weight;
    }
  }

  function force(alpha) {
    for (const [, layerNodes] of layerIndex) {
      const n = layerNodes.length;
      for (let i = 0; i < n; i++) {
        const a = layerNodes[i];
        for (let j = i + 1; j < n; j++) {
          const b = layerNodes[j];

          // 2D displacement in the layer plane
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy);

          // Clamp to avoid singularity
          if (dist < EPSILON) {
            // Give a random nudge so overlapping nodes separate
            dx = (Math.random() - 0.5) * 2;
            dy = (Math.random() - 0.5) * 2;
            dist = Math.sqrt(dx * dx + dy * dy);
          }
          const distEff = Math.max(dist, EPSILON);

          // Skip if beyond max influence range
          if (distEff > _maxDistance) continue;

          // Normalize weights to [0, 1] so the product stays bounded
          const wa = (a.weight || 1) / maxWeight;
          const wb = (b.weight || 1) / maxWeight;

          // Inverse-linear repulsion: F = k * wa * wb / d
          // wa*wb ∈ [0,1] keeps magnitude predictable
          const magnitude = (_strength * wa * wb) / distEff * alpha;

          // Unit vector from b → a
          const ux = dx / dist;
          const uy = dy / dist;

          // Apply equal-and-opposite forces via velocity
          a.vx += ux * magnitude;
          a.vy += uy * magnitude;
          b.vx -= ux * magnitude;
          b.vy -= uy * magnitude;
        }
      }
    }
  }

  force.initialize = function (_nodes) {
    nodes = _nodes;
    rebuildIndex();
  };

  force.strength = function (s) {
    if (s === undefined) return _strength;
    _strength = s;
    return force;
  };

  force.maxDistance = function (d) {
    if (d === undefined) return _maxDistance;
    _maxDistance = d;
    return force;
  };

  return force;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cross-Layer Spring Force (Hooke's law with per-link rest length)
//
//   F_spring(i,j) = -k_spring * value * (|Δ_xy| - r0_ij) * Δ̂_xy
//
//   • Acts along edges that connect nodes across different layers
//   • Only the x-y displacement matters (z is locked to layer planes)
//   • Each link carries its own rest length (scaled by layer gap) and
//     a random magnitude multiplier (value)
//   • r0_ij comes from link.restLength; falls back to global _restLength
// ─────────────────────────────────────────────────────────────────────────────
export function forceCrossLayerSpring(links, strength = 0.08, restLength = 15) {
  let nodes;
  let _links = links;
  let _strength = strength;
  let _restLength = restLength;

  // Resolved link references (source/target as node objects)
  let resolvedLinks = [];

  function resolveLinks() {
    if (!nodes || !_links) { resolvedLinks = []; return; }
    const nodeById = new Map();
    for (const n of nodes) nodeById.set(n.id, n);

    resolvedLinks = [];
    for (const link of _links) {
      const src = typeof link.source === 'object' ? link.source : nodeById.get(link.source);
      const tgt = typeof link.target === 'object' ? link.target : nodeById.get(link.target);
      if (src && tgt) {
        resolvedLinks.push({
          source: src,
          target: tgt,
          value: link.value || 1,
          // Per-link rest length (from layer-gap scaling); fall back to global
          restLength: link.restLength || _restLength,
        });
      }
    }
  }

  function force(alpha) {
    for (const { source, target, value, restLength: r0 } of resolvedLinks) {
      // x-y displacement only (ignore z / layer separation)
      const dx = source.x - target.x;
      const dy = source.y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // When nodes are nearly coincident, skip
      if (dist < 0.01) continue;

      // Hooke's law with per-link rest length and magnitude
      const displacement = dist - r0;
      const magnitude = _strength * value * displacement * alpha;

      // Unit vector from target → source
      const ux = dx / dist;
      const uy = dy / dist;

      // Apply spring: pull source toward target, pull target toward source
      source.vx -= ux * magnitude;
      source.vy -= uy * magnitude;
      target.vx += ux * magnitude;
      target.vy += uy * magnitude;
    }
  }

  force.initialize = function (_nodes) {
    nodes = _nodes;
    resolveLinks();
  };

  force.links = function (l) {
    if (l === undefined) return _links;
    _links = l;
    resolveLinks();
    return force;
  };

  force.strength = function (s) {
    if (s === undefined) return _strength;
    _strength = s;
    return force;
  };

  force.restLength = function (r) {
    if (r === undefined) return _restLength;
    _restLength = r;
    return force;
  };

  return force;
}