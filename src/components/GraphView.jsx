import { useEffect, useRef } from 'react';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';

import { forceWithinLayerRepulsion, forceCrossLayerSpring } from '../utils/forces';
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
 * Applies two custom forces:
 *   1. Within-layer repulsion  — spreads same-layer nodes apart
 *   2. Cross-layer springs     — pulls connected nodes toward x-y alignment
 * Z positions are locked to layer planes; only x-y are free.
 */
export default function GraphView({ graphData, config, onNodeSelect }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const layerPlanesRef = useRef(null);
  const linksRef = useRef(null);
  const repulsionRef = useRef(null);
  const springRef = useRef(null);
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

        const distance = 200;
        const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
        graph.cameraPosition(
          { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
          node,
          1000
        );
      })
      .onNodeDrag((node) => {
        // During drag: pin x/y to mouse position, keep z locked to layer
        if (node.layer !== undefined) {
          const targetZ = node.layer * layerSpacing + (node._zDisplacement || 0);
          node.z = targetZ;
          node.fz = targetZ;
        }
      })
      .onNodeDragEnd((node) => {
        // Release x/y pins so the simulation can take over again
        node.fx = undefined;
        node.fy = undefined;
        // Keep z locked
        if (node.layer !== undefined) {
          node.fz = node.layer * layerSpacing + (node._zDisplacement || 0);
        }
        graph.d3ReheatSimulation();
      })
      .onBackgroundClick(() => {
        if (onNodeSelect) onNodeSelect(null);
      });

    // ── Disable all default d3 forces ──
    graph.d3Force('charge', null);
    graph.d3Force('link', null);
    graph.d3Force('center', null);

    // ── Custom Force 1: Within-layer repulsion ──
    const repulsion = forceWithinLayerRepulsion(
      config.repulsionStrength,
      config.repulsionMaxDistance
    );
    graph.d3Force('withinLayerRepulsion', repulsion);
    repulsionRef.current = repulsion;

    // ── Custom Force 2: Cross-layer springs ──
    const spring = forceCrossLayerSpring(
      graphData.links,
      config.springStrength,
      config.springRestLength
    );
    graph.d3Force('crossLayerSpring', spring);
    springRef.current = spring;

    // ── Set simulation damping (velocityDecay) ──
    graph.d3VelocityDecay(config.damping);

    // ── Build layer groupings ──
    const nodesByLayer = {};
    for (const node of graphData.nodes) {
      if (!nodesByLayer[node.layer]) nodesByLayer[node.layer] = [];
      nodesByLayer[node.layer].push(node);
    }
    const sortedLayers = Object.keys(nodesByLayer).map(Number).sort((a, b) => a - b);

    // ── Compute Z-displacement from link forces (visual depth variation) ──
    // Build fully-connected pairs for Z displacement and visual link lines
    const linkPairs = [];
    const linkForces = [];
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

    const zForceMap = new Map();
    for (const node of graphData.nodes) zForceMap.set(node.id, 0);
    for (let i = 0; i < linkForces.length; i++) {
      const src = linkPairs[i * 2];
      const tgt = linkPairs[i * 2 + 1];
      const f = linkForces[i].direction * linkForces[i].magnitude;
      zForceMap.set(src.id, zForceMap.get(src.id) + f);
      zForceMap.set(tgt.id, zForceMap.get(tgt.id) - f);
    }

    const maxDisplacement = layerSpacing / 2;
    let maxAbsForce = 0;
    for (const force of zForceMap.values()) {
      maxAbsForce = Math.max(maxAbsForce, Math.abs(force));
    }
    const scaleFactor = maxAbsForce > 0 ? maxDisplacement / maxAbsForce : 0;

    // ── Position nodes: random x/y (FREE), z locked to layer ──
    for (const node of graphData.nodes) {
      const baseZ = (node.layer !== undefined ? node.layer : 0) * layerSpacing;
      const displacement = (zForceMap.get(node.id) || 0) * scaleFactor;
      node._zDisplacement = displacement;

      // Z is pinned to layer plane (forces only act on x/y)
      node.z = baseZ + displacement;
      node.fz = node.z;

      // x/y are FREE — the simulation will move them via repulsion + springs
      if (node.x === undefined) node.x = (Math.random() - 0.5) * 200;
      if (node.y === undefined) node.y = (Math.random() - 0.5) * 200;
      // Do NOT set fx/fy — leave them free for the force simulation
    }

    // ── Feed data to the graph (simulation begins) ──
    graph.graphData(graphData);

    // ── Add deformed layer plane meshes (Perspective Wall) ──
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

    // ── Build THREE.LineSegments for visual links ──
    const totalSegments = linkForces.length;
    const positions = new Float32Array(totalSegments * 6);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      color: '#94a3b8',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });

    const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);

    const posAttr = lineGeometry.getAttribute('position');
    for (let i = 0; i < linkPairs.length; i++) {
      const n = linkPairs[i];
      posAttr.setXYZ(i, n.x, n.y, n.z);
    }
    posAttr.needsUpdate = true;

    lineSegments.visible = config.showLinks;
    graph.scene().add(lineSegments);
    linksRef.current = { lineSegments, lineGeometry, lineMaterial, linkPairs };

    // ── Update visuals each tick ──
    graph.onEngineTick(() => {
      // Update link line positions
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

    // ── Position camera to see all layers ──
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

  // ── Update forces when config changes (without re-creating the graph) ──
  useEffect(() => {
    configRef.current = config;

    const graph = graphRef.current;
    if (!graph) return;

    // Update repulsion parameters
    if (repulsionRef.current) {
      repulsionRef.current.strength(config.repulsionStrength);
      repulsionRef.current.maxDistance(config.repulsionMaxDistance);
    }

    // Update spring parameters
    if (springRef.current) {
      springRef.current.strength(config.springStrength);
      springRef.current.restLength(config.springRestLength);
    }

    // Update simulation damping
    graph.d3VelocityDecay(config.damping);

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