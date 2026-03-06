import { useEffect, useRef } from 'react';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';

import { forceWithinLayerRepulsion } from '../utils/forces';
import { getLayerColor } from '../data/sampleData';
import { createHologramNode } from './HologramNode';

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
  const repulsionRef = useRef(null);
  const configRef = useRef(config);

  // Initialize the graph
  useEffect(() => {
    if (!containerRef.current) return;

    const layerSpacing = 120;
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
      // --- Edge rendering ---
      .linkColor((link) => {
        const sourceNode = typeof link.source === 'object' ? link.source : null;
        if (sourceNode) {
          return getLayerColor(sourceNode.layer || 0);
        }
        return '#334155';
      })
      .linkVisibility(() => config.showLinks)
      .linkOpacity(0.4)
      .linkWidth((link) => Math.max(0.5, (link.value || 1) / 30))
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
        // Allow free movement on X/Y but lock Z to layer
        node.fx = undefined;
        node.fy = undefined;
        if (node.layer !== undefined) {
          const targetZ = node.layer * layerSpacing;
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
        node.fz = node.layer !== undefined ? node.layer * layerSpacing : node.z;

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

    // Position nodes on their layer's Z plane and pin BEFORE setting graph data
    // (prevents simulation ticks from running on unpinned nodes)
    for (const node of graphData.nodes) {
      if (node.layer !== undefined) {
        node.z = node.layer * layerSpacing;
        node.fz = node.z;
      }
      if (node.x === undefined) node.x = (Math.random() - 0.5) * 200;
      if (node.y === undefined) node.y = (Math.random() - 0.5) * 200;
      node._homeX = node.x;
      node._homeY = node.y;
      node.fx = node.x;
      node.fy = node.y;
    }

    // Set graph data (simulation starts with already-pinned nodes)
    graph.graphData(graphData);

    // Add semi-transparent layer plane meshes
    const layerPlanesGroup = new THREE.Group();
    const uniqueLayers = [...new Set(graphData.nodes.map(n => n.layer))].sort((a, b) => a - b);
    for (const layerIdx of uniqueLayers) {
      const geometry = new THREE.BoxGeometry(400, 400, 2);
      const material = new THREE.MeshBasicMaterial({
        color: getLayerColor(layerIdx),
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = layerIdx * layerSpacing;
      layerPlanesGroup.add(mesh);
    }
    layerPlanesGroup.visible = config.showLayerPlanes;
    graph.scene().add(layerPlanesGroup);
    layerPlanesRef.current = layerPlanesGroup;

    // Position camera to see all layers
    const midZ = ((uniqueLayers.length - 1) * layerSpacing) / 2;
    setTimeout(() => {
      graph.cameraPosition({ x: 0, y: 80, z: midZ + 700 }, { x: 0, y: 0, z: midZ }, 0);
    }, 100);

    graphRef.current = graph;

    // Cleanup
    return () => {
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

    // Update link visibility
    graph.linkVisibility(() => config.showLinks);

    // Toggle layer plane visibility
    if (layerPlanesRef.current) {
      layerPlanesRef.current.visible = config.showLayerPlanes;
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
