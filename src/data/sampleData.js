/**
 * Sample Data Generator
 * 
 * Generates layered DAG data representing time-sliced word frequencies.
 * Each time slice is a layer; nodes are words with frequency-based weights.
 * Edges connect the same word across adjacent time slices.
 */

// Layer color palette
export const LAYER_COLORS = [
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#10b981', // emerald
  '#f43f5e', // rose
  '#6366f1', // indigo
  '#ec4899', // pink
];

export function getLayerColor(layerIndex) {
  return LAYER_COLORS[layerIndex % LAYER_COLORS.length];
}

/**
 * Generate a sample time-sliced word frequency DAG.
 * 
 * @returns {{ nodes: Array, links: Array, layers: Array }}
 */
export function generateSampleData() {
  const timeSlices = [
    { label: 'Jan 2025', index: 0 },
    { label: 'Feb 2025', index: 1 },
    { label: 'Mar 2025', index: 2 },
    { label: 'Apr 2025', index: 3 },
    { label: 'May 2025', index: 4 },
  ];

  // Words with their frequencies per time slice.
  const wordData = {
    // Dominant throughout
    'AI':           [120, 140, 158, 155, 170],
    'data':         [110, 105, 108, 100,  95],
    'model':        [ 90,  95, 108, 115, 120],

    // Rising stars
    'agent':        [  8,  22,  50,  95, 145],
    'transformer':  [ 30,  52,  80, 108, 125],
    'safety':       [ 12,  28,  58,  85, 110],
    'reasoning':    [ 18,  32,  55,  80, 100],
    'alignment':    [  8,  18,  32,  55,  80],

    // Moderate & stable
    'learning':     [ 70,  72,  68,  72,  70],
    'training':     [ 60,  62,  65,  60,  58],
    'neural':       [ 55,  58,  60,  58,  55],
    'cloud':        [ 65,  60,  55,  50,  45],

    // Small / niche
    'network':      [ 40,  38,  35,  32,  30],
    'inference':    [ 18,  25,  32,  42,  50],
    'multimodal':   [ 10,  20,  38,  52,  65],
    'GPU':          [ 28,  32,  35,  30,  28],
    'deployment':   [ 22,  28,  30,  35,  38],
    'attention':    [ 20,  30,  45,  50,  58],
    'edge':         [  6,  10,  18,  28,  38],
    'machine':      [ 48,  45,  40,  35,  30],
  };

  const nodes = [];
  const links = [];

  // Create nodes for each word in each time slice
  for (const [word, frequencies] of Object.entries(wordData)) {
    for (let t = 0; t < timeSlices.length; t++) {
      const freq = frequencies[t];
      if (freq > 0) {
        nodes.push({
          id: `${word}_${t}`,
          label: word,
          layer: t,
          layerLabel: timeSlices[t].label,
          weight: freq,
          color: getLayerColor(t),
          metadata: {
            word,
            timeSlice: timeSlices[t].label,
            frequency: freq,
            trend: t > 0 ? (freq - frequencies[t - 1]) : 0,
          },
        });
      }
    }

  }

  // ── Randomized spring connections across ANY forward layers ──
  // Connections can skip layers. Rest length scales with layer gap so
  // distant links are more relaxed, producing visible long-range threads.
  const BASE_REST_LENGTH = 15;

  // Group node ids by layer
  const idsByLayer = {};
  for (const node of nodes) {
    if (!idsByLayer[node.layer]) idsByLayer[node.layer] = [];
    idsByLayer[node.layer].push(node.id);
  }
  const layerIndices = Object.keys(idsByLayer).map(Number).sort((a, b) => a - b);

  // Fisher-Yates shuffle on a copy
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  for (let li = 0; li < layerIndices.length - 1; li++) {
    const currIds = idsByLayer[layerIndices[li]];

    // Collect ALL forward layers as potential targets
    const forwardLayers = layerIndices.slice(li + 1);

    for (const srcId of currIds) {
      // 35% chance this node has zero forward connections (scattered outlier)
      if (Math.random() < 0.35) continue;

      // Pick 1–2 connections total, spread across any forward layer
      const numConns = 1 + Math.floor(Math.random() * 2);

      for (let c = 0; c < numConns; c++) {
        // Pick a random forward layer (weighted toward closer layers)
        // Use exponential decay: closer layers are more likely
        const weights = forwardLayers.map((_, idx) => Math.exp(-0.7 * idx));
        const totalWeight = weights.reduce((s, w) => s + w, 0);
        let roll = Math.random() * totalWeight;
        let chosenLayerIdx = 0;
        for (let w = 0; w < weights.length; w++) {
          roll -= weights[w];
          if (roll <= 0) { chosenLayerIdx = w; break; }
        }
        const targetLayer = forwardLayers[chosenLayerIdx];
        const targetIds = idsByLayer[targetLayer];

        // Pick a random target node in that layer
        const tgtId = shuffled(targetIds)[0];

        // Layer gap determines rest length: farther layers → longer rest
        const layerGap = targetLayer - layerIndices[li];

        links.push({
          source: srcId,
          target: tgtId,
          value: 0.3 + Math.random() * 0.7,
          // Per-link rest length scales with layer distance
          restLength: BASE_REST_LENGTH * layerGap,
        });
      }
    }
  }

  return {
    nodes,
    links,
    layers: timeSlices,
  };
}

/**
 * Parse user-provided JSON data into the graph format.
 */
export function parseGraphData(jsonData) {
  const { nodes, links = [], layers } = jsonData;

  const processedNodes = nodes.map((node) => ({
    ...node,
    color: node.color || getLayerColor(node.layer || 0),
    weight: node.weight || 1,
    label: node.label || node.id,
    metadata: node.metadata || {},
  }));

  const processedLinks = (links || []).map((link) => ({
    ...link,
    value: link.value || 1,
  }));

  return {
    nodes: processedNodes,
    links: processedLinks,
    layers: layers || [],
  };
}

/**
 * Fetch graph data from an API endpoint.
 */
export async function fetchGraphData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return parseGraphData(data);
}