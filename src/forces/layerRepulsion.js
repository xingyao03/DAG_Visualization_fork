/**
 * Custom d3 force: within-layer repulsion on X/Y only.
 *
 * Applies Coulomb-like pairwise repulsion between nodes that share the
 * same layer value. Nodes in different layers are unaffected.
 *
 * @param {number} strength - Repulsion strength (negative = repulsive)
 */
export function forceLayerRepulsion(strength = -300) {
  let nodes;
  let layerGroups; // Map<layer, Node[]>

  function force(alpha) {
    for (const group of layerGroups.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist2 = dx * dx + dy * dy;
          if (dist2 < 1) dist2 = 1;
          const dist = Math.sqrt(dist2);
          const f = (strength * alpha) / dist;
          const fx = (dx / dist) * f;
          const fy = (dy / dist) * f;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }
    }
  }

  force.initialize = function (_nodes) {
    nodes = _nodes;
    layerGroups = new Map();
    for (const node of nodes) {
      const layer = node.layer ?? 0;
      if (!layerGroups.has(layer)) layerGroups.set(layer, []);
      layerGroups.get(layer).push(node);
    }
  };

  force.strength = function (s) {
    if (s === undefined) return strength;
    strength = s;
    return force;
  };

  return force;
}
