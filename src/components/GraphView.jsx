import { useEffect, useRef } from 'react';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';

import { forceLayerRepulsion } from '../forces/layerRepulsion';
import { getLayerColor } from '../data/sampleData';
import { createHologramNode } from './HologramNode';

/**
 * GraphView Component
 *
 * Renders the 3D layered DAG with continuous force simulation:
 * - Within-layer repulsion spreads nodes evenly on X/Y
 * - Cross-layer spring forces pull connected nodes closer on X/Y
 * - Z is locked to each node's layer plane
 */
export default function GraphView({ graphData, config, onNodeSelect }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const layerPlanesRef = useRef(null);
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

        return group;
      })
      // --- Link visuals ---
      .linkWidth((link) => Math.sqrt(link.value || 1) * 1.5)
      .linkOpacity(0.4)
      .linkColor(() => 'rgba(100, 160, 255, 0.3)')
      .linkVisibility(() => configRef.current.showLinks)
      // --- Interaction ---
      .onNodeClick((node) => {
        if (onNodeSelect) onNodeSelect(node);

        const distance = 200;
        const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
        graph.cameraPosition(
          { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
          node,
          1000
        );
      })
      .onNodeDrag((node) => {
        // Pin to cursor on X/Y during drag, lock Z
        node.fx = node.x;
        node.fy = node.y;
        node.fz = (node.layer ?? 0) * layerSpacing;
      })
      .onNodeDragEnd((node) => {
        // Release to simulation
        node.fx = undefined;
        node.fy = undefined;
        node.fz = (node.layer ?? 0) * layerSpacing;
        graph.d3ReheatSimulation();
      })
      .onBackgroundClick(() => {
        if (onNodeSelect) onNodeSelect(null);
      });

    // Simulation tuning
    graph.d3AlphaDecay(0.005);
    graph.d3VelocityDecay(0.3);

    // Disable default charge and center forces (we use custom layer repulsion)
    graph.d3Force('charge', null);
    graph.d3Force('center', null);

    // Register within-layer repulsion
    graph.d3Force('layerRepulsion', forceLayerRepulsion(config.repulsionStrength));

    // Lock Z every tick so nodes never drift off their layer plane
    graph.d3Force('lockZ', () => {
      for (const node of graphData.nodes) {
        node.vz = 0;
        node.z = (node.layer ?? 0) * layerSpacing;
      }
    });

    // Initialize node positions: random X/Y, Z locked to layer
    for (const node of graphData.nodes) {
      const baseZ = (node.layer ?? 0) * layerSpacing;
      node.z = baseZ;
      node.fz = baseZ;
      if (node.x === undefined) node.x = (Math.random() - 0.5) * 200;
      if (node.y === undefined) node.y = (Math.random() - 0.5) * 200;
      // Do NOT set fx/fy — let simulation move nodes freely
    }

    // Set graph data (starts simulation)
    graph.graphData(graphData);

    // Configure the link (spring) force created by 3d-force-graph
    const linkForce = graph.d3Force('link');
    if (linkForce) {
      linkForce
        .distance(config.springDistance)
        .strength((link) => (link.value || 0.5) * config.springStrength);
    }

    // Add flat layer plane meshes
    const layerPlanesGroup = new THREE.Group();
    const uniqueLayers = [...new Set(graphData.nodes.map((n) => n.layer))].sort((a, b) => a - b);
    for (const layerIdx of uniqueLayers) {
      const geometry = new THREE.PlaneGeometry(400, 400, 1, 1);
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
    layerPlanesRef.current = { group: layerPlanesGroup };

    // Position camera to see all layers
    const midZ = ((uniqueLayers.length - 1) * layerSpacing) / 2;
    setTimeout(() => {
      graph.cameraPosition({ x: 0, y: 80, z: midZ + 700 }, { x: 0, y: 0, z: midZ }, 0);
    }, 100);

    graphRef.current = graph;

    return () => {
      graph._destructor && graph._destructor();
    };
  }, [graphData]);

  // Update forces and visuals when config changes
  useEffect(() => {
    configRef.current = config;

    const graph = graphRef.current;
    if (!graph) return;

    // Update repulsion strength
    const repForce = graph.d3Force('layerRepulsion');
    if (repForce) repForce.strength(config.repulsionStrength);

    // Update spring force parameters
    const linkForce = graph.d3Force('link');
    if (linkForce) {
      linkForce
        .distance(config.springDistance)
        .strength((link) => (link.value || 0.5) * config.springStrength);
    }

    // Toggle layer plane visibility
    if (layerPlanesRef.current) {
      layerPlanesRef.current.group.visible = config.showLayerPlanes;
    }

    // Refresh node objects for visual toggle changes
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
