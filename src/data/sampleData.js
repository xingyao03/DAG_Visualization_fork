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
  // Values are intentionally spread across a wide range to create a clear
  // word-cloud effect: dominant words (100-170) vs niche words (5-30).
  const wordData = {
    // Dominant throughout
    'AI':           [120, 140, 158, 155, 170],
    'data':         [110, 105, 108, 100,  95],
    'model':        [ 90,  95, 108, 115, 120],

    // Rising stars — small early, huge by May
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
          // Metadata for inspection
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

  return {
    nodes,
    links: [],
    layers: timeSlices,
  };
}

/**
 * Parse user-provided JSON data into the graph format.
 * Expected format:
 * {
 *   "nodes": [{ "id": "...", "label": "...", "layer": 0, "weight": 50, ... }],
 *   "links": [{ "source": "node1", "target": "node2", "value": 10 }],
 *   "layers": [{ "label": "Layer 0", "index": 0 }, ...]
 * }
 */
export function parseGraphData(jsonData) {
  const { nodes, links, layers } = jsonData;

  // Validate and assign colors if missing
  const processedNodes = nodes.map((node) => ({
    ...node,
    color: node.color || getLayerColor(node.layer || 0),
    weight: node.weight || 1,
    label: node.label || node.id,
    metadata: node.metadata || {},
  }));

  const processedLinks = links.map((link) => ({
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
 * @param {string} url - The API endpoint URL
 * @returns {Promise<{ nodes: Array, links: Array, layers: Array }>}
 */
export async function fetchGraphData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return parseGraphData(data);
}
