import { useEffect, useRef, useMemo } from 'react';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';

import { forceWithinLayerRepulsion, forceCrossLayerSpring } from '../utils/forces';
import { getLayerColor } from '../data/sampleData';
import { createHologramNode } from './HologramNode';

/**
 * GraphView Component
 *
 * Renders the 3D force-directed layered DAG using 3d-force-graph.
 * Applies two custom forces:
 *   1. Within-layer repulsion  — spreads same-layer nodes apart
 *   2. Cross-layer springs     — pulls connected nodes toward x-y alignment
 * Z positions are locked to layer planes; only x-y are free.
 */
export default function GraphView({
  graphData,
  config,
  onNodeSelect,
  selectedNode,
  selectedLayer = 'all',
  resetViewTrigger,
}) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const layerPlanesRef = useRef(null);
  const linksRef = useRef(null);
  const repulsionRef = useRef(null);
  const springRef = useRef(null);
  const configRef = useRef(config);

  const layerSpacing = 120;

  const filteredGraphData = useMemo(() => {
    if (!graphData?.nodes || !graphData?.links) {
      return { nodes: [], links: [] };
    }

    if (selectedLayer === 'all') {
      return graphData;
    }

    const filteredNodes = graphData.nodes.filter(
      (node) => String(node.layer) === String(selectedLayer)
    );

    const visibleNodeIds = new Set(filteredNodes.map((node) => node.id));

    const filteredLinks = graphData.links.filter((link) => {
      const sourceId =
        typeof link.source === 'object' ? link.source.id : link.source;
      const targetId =
        typeof link.target === 'object' ? link.target.id : link.target;

      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    });

    return {
      nodes: filteredNodes,
      links: filteredLinks,
    };
  }, [graphData, selectedLayer]);

  // Initialize the graph
  useEffect(() => {
    if (!containerRef.current) return;

    
    const graph = ForceGraph3D()(containerRef.current)
      .backgroundColor('#0a0e17')
      .showNavInfo(false)
      // --- Node rendering (fully custom hologram) ---
      .nodeThreeObjectExtend(false)
      .nodeThreeObject((node) => {
        const cfg = configRef.current;
        const isSelected = selectedNode && selectedNode.id === node.id;
        const group = createHologramNode(node);
      
        const s = 0.5 + (node.weight || 10) / 50;
        const outerRadius = 8.5 * s;

        if (cfg.showLabels) {
          const sprite = new SpriteText(node.label || node.id);
          sprite.color = '#e2e8f0';
          sprite.textHeight = Math.max(2.5, outerRadius * 0.25);
          sprite.position.y = outerRadius + 3;
          sprite.fontFace = 'DM Sans, sans-serif';
          sprite.backgroundColor = isSelected
            ? 'rgba(15, 23, 42, 0.9)'
            : 'rgba(15, 23, 42, 0.7)';
          sprite.padding = isSelected ? 2.5 : 1.5;
          sprite.borderRadius = 3;
          group.add(sprite);
        }

        if (cfg.showForceField) {
          const fieldRadius = cfg.repulsionMaxDistance;
          const geometry = new THREE.CircleGeometry(fieldRadius, 48);
          const material = new THREE.MeshBasicMaterial({
            color: node.color || '#3b82f6',
            transparent: true,
            opacity: isSelected ? 0.1 : 0.05,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          group.add(new THREE.Mesh(geometry, material));
        }
      
        if (isSelected) {
          const ringGeometry = new THREE.SphereGeometry(outerRadius * 1.35, 24, 24);
          const ringMaterial = new THREE.MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 0.18,
            wireframe: true,
          });
          const ring = new THREE.Mesh(ringGeometry, ringMaterial);
          group.add(ring);
        }
      
        return group;
      })
      // --- Interaction ---
      .onNodeClick((node) => {
        if (onNodeSelect) onNodeSelect(node);

        const distance = 200;
        const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
        graph.cameraPosition(
          {
            x: node.x * distRatio,
            y: node.y * distRatio + 30,
            z: node.z * distRatio + 40,
          },
          { x: node.x, y: node.y, z: node.z },
          900
        );
      })
      .onNodeDrag((node) => {
        // During drag: pin x/y to mouse position, keep z strictly on layer
        if (node._layerZ !== undefined) {
          node.z = node._layerZ;
          node.fz = node._layerZ;
          node.vz = 0;
        }
      })
      .onNodeDragEnd((node) => {
        // Release x/y pins so the simulation can take over again
        node.fx = undefined;
        node.fy = undefined;
        // Keep z strictly locked
        if (node._layerZ !== undefined) {
          node.z = node._layerZ;
          node.fz = node._layerZ;
          node.vz = 0;
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
      filteredGraphData.links,
      config.springStrength,
      config.springRestLength
    );
    graph.d3Force('crossLayerSpring', spring);
    springRef.current = spring;

    // ── Set simulation damping (velocityDecay) ──
    graph.d3VelocityDecay(config.damping);

    // ── Build layer groupings ──
    const nodesByLayer = {};
    for (const node of filteredGraphData.nodes) {
      if (!(node.layer in nodesByLayer)) nodesByLayer[node.layer] = [];
      nodesByLayer[node.layer].push(node);
    }

    // ── Position nodes: random x/y (FREE), z strictly locked to layer ──
    for (const node of filteredGraphData.nodes) {
      const exactZ = (node.layer !== undefined ? node.layer : 0) * layerSpacing;

      // Z is STRICTLY pinned to layer plane — no displacement
      node.z = exactZ;
      node.fz = exactZ;
      node.vz = 0;
      node._layerZ = exactZ; // stash for hard reset each tick

      // x/y are FREE — the simulation will move them via repulsion + springs
      if (node.x === undefined) node.x = (Math.random() - 0.5) * 200;
      if (node.y === undefined) node.y = (Math.random() - 0.5) * 200;
      // Do NOT set fx/fy — leave them free for the force simulation
    }

    // ── Build link pairs from actual graph links for visual lines ──
    // We need node references resolved by id for drawing lines.
    // At this point nodes have positions but graphData hasn't been fed to the
    // graph yet (which would mutate link.source/target to objects), so we
    // resolve manually from our own node array.
    const nodeById = new Map();
    for (const node of filteredGraphData.nodes) nodeById.set(node.id, node);

    const linkPairs = []; // flat array: [srcNode, tgtNode, srcNode, tgtNode, …]
    for (const link of filteredGraphData.links) {
      const src = typeof link.source === 'object' ? link.source : nodeById.get(link.source);
      const tgt = typeof link.target === 'object' ? link.target : nodeById.get(link.target);
      if (src && tgt) {
        linkPairs.push(src, tgt);
      }
    }
    const totalSegments = linkPairs.length / 2;

    // ── Feed data to the graph (simulation begins) ──
    graph.graphData(filteredGraphData);

    // ── Add flat layer plane meshes ──
    const layerPlanesGroup = new THREE.Group();
    const layerMeta = [];
    const uniqueLayers = [...new Set(filteredGraphData.nodes.map((n) => n.layer))].sort((a, b) => a - b);
    for (const layerIdx of uniqueLayers) {
      const geometry = new THREE.PlaneGeometry(400, 400);
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
      layerMeta.push({ geometry, nodes: nodesByLayer[layerIdx] || [] });
    }

    layerPlanesGroup.visible = config.showLayerPlanes;
    graph.scene().add(layerPlanesGroup);
    layerPlanesRef.current = { group: layerPlanesGroup, layers: layerMeta };

    // ── Build THREE.LineSegments for actual spring links ──
    const positions = new Float32Array(totalSegments * 6); // 2 vertices × 3 components
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
      // HARD Z-LOCK: force every node back to its exact layer z every tick.
      // This is belt-and-suspenders on top of fz — it catches any floating
      // point drift or vz leakage from the d3-force integration step.
      for (const node of filteredGraphData.nodes) {
        if (node._layerZ !== undefined) {
          node.z = node._layerZ;
          node.vz = 0;
        }
      }

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
    });

    // ── Position camera to see all layers ──
    const midZ = ((uniqueLayers.length - 1) * layerSpacing) / 2;
    setTimeout(() => {
      graph.cameraPosition({ x: 0, y: 80, z: midZ + 700 }, { x: 0, y: 0, z: midZ }, 0);
    }, 100);

    graphRef.current = graph;

    return () => {
      if (linksRef.current) {
        linksRef.current.lineGeometry.dispose();
        linksRef.current.lineMaterial.dispose();
        linksRef.current = null;
      }
      graph._destructor && graph._destructor();
    };
  }, [filteredGraphData, onNodeSelect]);
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

    if (layerPlanesRef.current) {
      layerPlanesRef.current.group.visible = config.showLayerPlanes;
    }

    graph.nodeThreeObject(graph.nodeThreeObject());
    graph.d3ReheatSimulation();
  }, [config]);

  // Reset view button behavior
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const nodes = filteredGraphData.nodes || [];
    const layers = [
      ...new Set(
        nodes
          .map((node) => node.layer)
          .filter((layer) => layer !== undefined && layer !== null)
      ),
    ].sort((a, b) => a - b);

    const midZ =
      layers.length > 0
        ? ((layers[0] + layers[layers.length - 1]) * layerSpacing) / 2
        : 0;

    graph.cameraPosition({ x: 0, y: 80, z: midZ + 700 }, { x: 0, y: 0, z: midZ }, 800);
  }, [resetViewTrigger, filteredGraphData]);

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