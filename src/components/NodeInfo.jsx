/**
 * NodeInfo Component
 *
 * Displays metadata about the currently selected node
 * as a floating panel over the graph.
 */
export default function NodeInfo({ node }) {
  if (!node) return null;

  return (
    <div className="node-info">
      <h3>{node.label || node.id}</h3>
      <div className="meta-row">
        <span className="meta-key">Layer</span>
        <span className="meta-value">{node.layerLabel || `Layer ${node.layer}`}</span>
      </div>
      <div className="meta-row">
        <span className="meta-key">Frequency</span>
        <span className="meta-value">{node.weight || '—'}</span>
      </div>
    </div>
  );
}
