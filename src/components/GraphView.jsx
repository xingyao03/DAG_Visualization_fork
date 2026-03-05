import { useEffect, useRef, useMemo } from 'react';
import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';

import { forceWithinLayerRepulsion } from '../utils/forces';
import { getLayerColor } from '../data/sampleData';

/**
 * GraphView Component
 *
 * Renders the 3D force-directed layered DAG using 3d-force-graph.
 * Applies custom forces for layer anchoring and within-layer repulsion.
 * Supports node selection, dragging, and real-time force parameter updates.
 */
export default function GraphView({
  graphData,
  config,
  onNodeSelect,
  selectedLayer = 'all',
  resetViewTrigger,
}) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const layerPlanesRef = useRef(null);
  const repulsionRef = useRef(null);
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
      .nodeRelSize(0.3)
      .nodeVal((node) => {
        const base = 100;
        const w = node.weight || 10;
        return base + w * w;
      })
      .nodeColor((node) => node.color || '#3b82f6')
      .nodeOpacity(0.85)
      .nodeThreeObjectExtend(true)
      .nodeThreeObject((node) => {
        const cfg = configRef.current;
        const showLabel = cfg.showLabels;
        const showField = cfg.showForceField;
        if (!showLabel && !showField) return false;

        const group = new THREE.Group();
        const approxRadius = 0.3 * Math.cbrt(100 + Math.pow(node.weight || 10, 2));

        if (showLabel) {
          const sprite = new SpriteText(node.label || node.id);
          sprite.color = '#e2e8f0';
          sprite.textHeight = Math.max(2.5, approxRadius * 0.6);
          sprite.position.y = approxRadius + 3;
          sprite.fontFace = 'DM Sans, sans-serif';
          sprite.backgroundColor = 'rgba(15, 23, 42, 0.7)';
          sprite.padding = 1.5;
          sprite.borderRadius = 3;
          group.add(sprite);
        }

        if (showField) {
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
        node.fx = undefined;
        node.fy = undefined;

        if (node.layer !== undefined) {
          const targetZ = node.layer * layerSpacing;
          node.z = targetZ;
          node.fz = targetZ;
        }
      })
      .onNodeDragEnd((node) => {
        node._homeX = node.x;
        node._homeY = node.y;
        node.fx = node.x;
        node.fy = node.y;
        node.fz = node.layer !== undefined ? node.layer * layerSpacing : node.z;

        const sameLayer = filteredGraphData.nodes.filter(
          (n) => n !== node && n.layer === node.layer
        );

        const duration = 300;
        const start = performance.now();
        const snapshots = sameLayer.map((n) => ({
          node: n,
          startX: n.fx ?? n.x,
          startY: n.fy ?? n.y,
        }));

        function animate(now) {
          const t = Math.min(1, (now - start) / duration);
          const ease = 1 - Math.pow(1 - t, 3);

          for (const s of snapshots) {
            s.node.fx = s.startX + ((s.node._homeX ?? s.node.x) - s.startX) * ease;
            s.node.fy = s.startY + ((s.node._homeY ?? s.node.y) - s.startY) * ease;
          }

          if (t < 1) requestAnimationFrame(animate);
        }

        requestAnimationFrame(animate);
      })
      .onBackgroundClick(() => {
        if (onNodeSelect) onNodeSelect(null);
      });

    graph.d3Force('charge', null);
    graph.d3Force('link', null);
    graph.d3Force('center', null);

    const repulsion = forceWithinLayerRepulsion(
      config.repulsionStrength,
      config.repulsionMaxDistance
    );
    graph.d3Force('withinLayerRepulsion', repulsion);
    repulsionRef.current = repulsion;

    for (const node of filteredGraphData.nodes) {
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

    graph.graphData(filteredGraphData);

    const layerPlanesGroup = new THREE.Group();
    const uniqueLayers = [
      ...new Set(
        filteredGraphData.nodes
          .map((n) => n.layer)
          .filter((layer) => layer !== undefined && layer !== null)
      ),
    ].sort((a, b) => a - b);

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

    const midZ =
      uniqueLayers.length > 0
        ? ((uniqueLayers[0] + uniqueLayers[uniqueLayers.length - 1]) * layerSpacing) / 2
        : 0;

    setTimeout(() => {
      graph.cameraPosition({ x: 0, y: 80, z: midZ + 700 }, { x: 0, y: 0, z: midZ }, 0);
    }, 100);

    graphRef.current = graph;

    return () => {
      graph._destructor && graph._destructor();
    };
  }, [filteredGraphData, config.repulsionStrength, config.repulsionMaxDistance, config.showLayerPlanes, config.showLinks, onNodeSelect]);

  // Update forces when config changes
  useEffect(() => {
    configRef.current = config;

    const graph = graphRef.current;
    if (!graph) return;

    if (repulsionRef.current) {
      repulsionRef.current.strength(config.repulsionStrength);
      repulsionRef.current.maxDistance(config.repulsionMaxDistance);
    }

    graph.linkVisibility(() => config.showLinks);

    if (layerPlanesRef.current) {
      layerPlanesRef.current.visible = config.showLayerPlanes;
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