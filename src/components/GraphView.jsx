import { useEffect, useRef } from 'react';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';

import { forceWithinLayerRepulsion } from '../utils/forces';
import { getLayerColor } from '../data/sampleData';
import { createHologramNode } from './HologramNode';

/** Warp a PlaneGeometry's Z vertices using IDW from nearby nodes' _zDisplacement. */
function warpPlaneIDW(geometry, layerNodes, epsilon) {
  const posAttr = geometry.getAttribute('position');
  for (let v = 0; v < posAttr.count; v++) {
    const vx = posAttr.getX(v);
    const vy = posAttr.getY(v);
    let weightSum = 0;
    let displacementSum = 0;
    for (const node of layerNodes) {
      const dx = vx - (node.x || 0);
      const dy = vy - (node.y || 0);
      const w = 1 / (dx * dx + dy * dy + epsilon);
      weightSum += w;
      displacementSum += w * (node._zDisplacement || 0);
    }
    posAttr.setZ(v, displacementSum / weightSum);
  }
  posAttr.needsUpdate = true;
}

/**
 * GraphView Component
 *
 * Renders the 3D force-directed layered DAG using 3d-force-graph.
 * Applies custom forces for layer anchoring and within-layer repulsion.
 * Supports node selection, dragging, and real-time force parameter updates.
 */
export default function GraphView({ graphData, config, onNodeSelect }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const layerPlanesRef = useRef(null);
  const linksRef = useRef(null);
  const repulsionRef = useRef(null);
  const configRef = useRef(config);

  // Initialize the graph
  useEffect(() => {
    if (!containerRef.current) return;

    const layerSpacing = 200;
    const graph = ForceGraph3D()(containerRef.current)
      .backgroundColor('#0a0e17')
      .showNavInfo(false)
      // --- Node rendering (fully custom hologram) ---
      .nodeThreeObjectExtend(false)
      .nodeThreeObject((node) => {
        const cfg = configRef.current;
        const group = createHologramNode(node);

        // Scale factor matching HologramNode.js (widest trail = 8.5 * s)
        const s = 0.5 + (node.weight || 10) / 50;
        const outerRadius = 8.5 * s;

        if (cfg.showLabels) {
          const sprite = new SpriteText(node.label || node.id);
          sprite.color = '#e2e8f0';
          sprite.textHeight = Math.max(2.5, outerRadius * 0.25);
          sprite.position.y = outerRadius + 3;
          sprite.fontFace = 'DM Sans, sans-serif';
          sprite.backgroundColor = 'rgba(15, 23, 42, 0.7)';
          sprite.padding = 1.5;
          sprite.borderRadius = 3;
          group.add(sprite);
        }

        if (cfg.showForceField) {
          const fieldRadius = cfg.repulsionMaxDistance;
          const geometry = new THREE.CircleGeometry(fieldRadius, 48);
          const material = new THREE.MeshBasicMaterial({
            color: node.color || '#3b82f6',
            transparent: true,
            opacity: 0.05,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          group.add(new THREE.Mesh(geometry, material));
        }

        return group;
      })
      // --- Interaction ---
      .onNodeClick((node) => {
        if (onNodeSelect) onNodeSelect(node);

        // Focus camera on clicked node
        const distance = 200;
        const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
        graph.cameraPosition(
          { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
          node,
          1000
        );
      })
      .onNodeDrag((node) => {
        // Allow free movement on X/Y but lock Z to layer + displacement
        node.fx = undefined;
        node.fy = undefined;
        if (node.layer !== undefined) {
          const targetZ = node.layer * layerSpacing + (node._zDisplacement || 0);
          node.z = targetZ;
          node.fz = targetZ;
        }
      })
      .onNodeDragEnd((node) => {
        // Re-pin the dragged node at its new position and update home
        node._homeX = node.x;
        node._homeY = node.y;
        node.fx = node.x;
        node.fy = node.y;
        node.fz = node.layer !== undefined
          ? node.layer * layerSpacing + (node._zDisplacement || 0)
          : node.z;

        // Spring-back animation: displaced same-layer nodes ease back to home
        const sameLayer = graphData.nodes.filter(
          n => n !== node && n.layer === node.layer
        );
        const duration = 300;
        const start = performance.now();
        // Capture current displaced positions
        const snapshots = sameLayer.map(n => ({ node: n, startX: n.fx, startY: n.fy }));
        function animate(now) {
          const t = Math.min(1, (now - start) / duration);
          const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
          for (const s of snapshots) {
            s.node.fx = s.startX + (s.node._homeX - s.startX) * ease;
            s.node.fy = s.startY + (s.node._homeY - s.startY) * ease;
          }
          if (t < 1) requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
      })
      .onBackgroundClick(() => {
        if (onNodeSelect) onNodeSelect(null);
      });

    // Disable default d3 forces, add custom within-layer repulsion
    graph.d3Force('charge', null);
    graph.d3Force('link', null);
    graph.d3Force('center', null);

    const repulsion = forceWithinLayerRepulsion(config.repulsionStrength, config.repulsionMaxDistance);
    graph.d3Force('withinLayerRepulsion', repulsion);
    repulsionRef.current = repulsion;

    // Build layer groupings for links and planes
    const nodesByLayer = {};
    for (const node of graphData.nodes) {
      if (!nodesByLayer[node.layer]) nodesByLayer[node.layer] = [];
      nodesByLayer[node.layer].push(node);
    }
    const sortedLayers = Object.keys(nodesByLayer).map(Number).sort((a, b) => a - b);

    // Build fully connected layer link pairs
    const linkPairs = [];
    const linkForces = []; // one entry per link (pair of nodes)
    for (let i = 0; i < sortedLayers.length - 1; i++) {
      const curr = nodesByLayer[sortedLayers[i]];
      const next = nodesByLayer[sortedLayers[i + 1]];
      for (const src of curr) {
        for (const tgt of next) {
          linkPairs.push(src, tgt);
          linkForces.push({
            magnitude: Math.random(),
            direction: Math.random() < 0.5 ? 1 : -1,
          });
        }
      }
    }

    // Compute net Z-force per node from link forces
    const zForceMap = new Map();
    for (const node of graphData.nodes) {
      zForceMap.set(node.id, 0);
    }
    for (let i = 0; i < linkForces.length; i++) {
      const src = linkPairs[i * 2];
      const tgt = linkPairs[i * 2 + 1];
      const f = linkForces[i].direction * linkForces[i].magnitude;
      zForceMap.set(src.id, zForceMap.get(src.id) + f);
      zForceMap.set(tgt.id, zForceMap.get(tgt.id) - f);
    }

    // Normalize forces so max displacement = layerSpacing / 2
    const maxDisplacement = layerSpacing / 2;
    let maxAbsForce = 0;
    for (const force of zForceMap.values()) {
      maxAbsForce = Math.max(maxAbsForce, Math.abs(force));
    }
    const scaleFactor = maxAbsForce > 0 ? maxDisplacement / maxAbsForce : 0;

    // Position nodes on their layer's Z plane + force displacement, then pin
    for (const node of graphData.nodes) {
      const baseZ = (node.layer !== undefined ? node.layer : 0) * layerSpacing;
      const displacement = (zForceMap.get(node.id) || 0) * scaleFactor;
      node._zDisplacement = displacement;
      node.z = baseZ + displacement;
      node.fz = node.z;

      if (node.x === undefined) node.x = (Math.random() - 0.5) * 200;
      if (node.y === undefined) node.y = (Math.random() - 0.5) * 200;
      node._homeX = node.x;
      node._homeY = node.y;
      node.fx = node.x;
      node.fy = node.y;
    }

    // Set graph data (simulation starts with already-pinned nodes)
    graph.graphData(graphData);

    // Add deformed layer plane meshes (Perspective Wall)
    const layerPlanesGroup = new THREE.Group();
    const layerMeta = [];
    const uniqueLayers = [...new Set(graphData.nodes.map(n => n.layer))].sort((a, b) => a - b);
    const planeSegments = 32;
    for (const layerIdx of uniqueLayers) {
      const geometry = new THREE.PlaneGeometry(400, 400, planeSegments, planeSegments);
      const material = new THREE.MeshBasicMaterial({
        color: getLayerColor(layerIdx),
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      // Warp vertices using IDW from same-layer node Z-displacements
      const layerNodes = nodesByLayer[layerIdx] || [];
      if (layerNodes.length > 0) {
        warpPlaneIDW(geometry, layerNodes, 100);
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = layerIdx * layerSpacing;
      layerPlanesGroup.add(mesh);
      layerMeta.push({ geometry, nodes: layerNodes });
    }
    layerPlanesGroup.visible = config.showLayerPlanes;
    graph.scene().add(layerPlanesGroup);
    layerPlanesRef.current = { group: layerPlanesGroup, layers: layerMeta };

    // Build THREE.LineSegments for fully connected links
    const totalSegments = linkForces.length;
    const positions = new Float32Array(totalSegments * 6); // 2 vertices × 3 components per segment
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      color: '#94a3b8',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });

    const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);

    // Initial position fill
    const posAttr = lineGeometry.getAttribute('position');
    for (let i = 0; i < linkPairs.length; i++) {
      const n = linkPairs[i];
      posAttr.setXYZ(i, n.x, n.y, n.z);
    }
    posAttr.needsUpdate = true;

    lineSegments.visible = config.showLinks;
    graph.scene().add(lineSegments);
    linksRef.current = { lineSegments, lineGeometry, lineMaterial, linkPairs };

    // Update line positions and layer plane deformation each tick
    graph.onEngineTick(() => {
      if (linksRef.current) {
        const attr = linksRef.current.lineGeometry.getAttribute('position');
        const pairs = linksRef.current.linkPairs;
        for (let i = 0; i < pairs.length; i++) {
          const n = pairs[i];
          attr.setXYZ(i, n.x, n.y, n.z);
        }
        attr.needsUpdate = true;
      }

      // Re-warp layer planes to follow node movement
      if (layerPlanesRef.current?.layers) {
        for (const { geometry, nodes } of layerPlanesRef.current.layers) {
          if (nodes.length > 0) {
            warpPlaneIDW(geometry, nodes, 100);
          }
        }
      }
    });

    // Position camera to see all layers
    const midZ = ((uniqueLayers.length - 1) * layerSpacing) / 2;
    setTimeout(() => {
      graph.cameraPosition({ x: 0, y: 80, z: midZ + 700 }, { x: 0, y: 0, z: midZ }, 0);
    }, 100);

    graphRef.current = graph;

    // Cleanup
    return () => {
      if (linksRef.current) {
        linksRef.current.lineGeometry.dispose();
        linksRef.current.lineMaterial.dispose();
        linksRef.current = null;
      }
      graph._destructor && graph._destructor();
    };
  }, [graphData]); // Re-initialize when data changes

  // Update forces when config changes (without re-creating the graph)
  useEffect(() => {
    configRef.current = config;

    const graph = graphRef.current;
    if (!graph) return;

    // Update repulsion force parameters
    if (repulsionRef.current) {
      repulsionRef.current.strength(config.repulsionStrength);
      repulsionRef.current.maxDistance(config.repulsionMaxDistance);
    }

    // Toggle link visibility
    if (linksRef.current) {
      linksRef.current.lineSegments.visible = config.showLinks;
    }

    // Toggle layer plane visibility
    if (layerPlanesRef.current) {
      layerPlanesRef.current.group.visible = config.showLayerPlanes;
    }

    // Refresh node Three.js objects when visual toggles change
    graph.nodeThreeObject(graph.nodeThreeObject());

    graph.d3ReheatSimulation();
  }, [config]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (graphRef.current && containerRef.current) {
        graphRef.current.width(containerRef.current.clientWidth);
        graphRef.current.height(containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
