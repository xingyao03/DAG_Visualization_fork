import { useState, useCallback, useMemo } from 'react';
import GraphView from './components/GraphView';
import ControlPanel from './components/ControlPanel';
import NodeInfo from './components/NodeInfo';
import { useForceConfig } from './hooks/useForceConfig';
import { generateSampleData, parseGraphData, fetchGraphData } from './data/sampleData';

/**
 * App Component
 *
 * Root of the 3D Layered DAG Visualization application.
 * Manages graph data state, force configuration, and data loading.
 */
export default function App() {
  const [graphData, setGraphData] = useState(() => generateSampleData());
  const [selectedNode, setSelectedNode] = useState(null);
  const [error, setError] = useState(null);
  const [selectedLayer, setSelectedLayer] = useState('all');
  const [resetViewTrigger, setResetViewTrigger] = useState(0);

  const { config, updateConfig } = useForceConfig();

  // Load the built-in sample data
  const handleLoadSample = useCallback(() => {
    setError(null);
    const data = generateSampleData();
    setGraphData(data);
    setSelectedNode(null);
    setSelectedLayer('all');
  }, []);

  // Load data from an API endpoint
  const handleLoadFromAPI = useCallback(async (url) => {
    setError(null);
    try {
      const data = await fetchGraphData(url);
      setGraphData(data);
      setSelectedNode(null);
      setSelectedLayer('all');
    } catch (err) {
      setError(`Failed to fetch: ${err.message}`);
      console.error(err);
    }
  }, []);

  // Load data from an uploaded JSON file
  const handleFileUpload = useCallback((file) => {
    setError(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        const data = parseGraphData(json);
        setGraphData(data);
        setSelectedNode(null);
        setSelectedLayer('all');
      } catch (err) {
        setError(`Invalid JSON: ${err.message}`);
        console.error(err);
      }
    };

    reader.readAsText(file);
  }, []);

  const handleResetView = useCallback(() => {
    setResetViewTrigger((prev) => prev + 1);
  }, []);

  const availableLayers = useMemo(() => {
    if (!graphData?.nodes) return [];

    const values = graphData.nodes
      .map((node) => node.layer)
      .filter((layer) => layer !== undefined && layer !== null);

    return [...new Set(values)].sort((a, b) => Number(a) - Number(b));
  }, [graphData]);

  return (
    <div className="app-container">
      {/* 3D Graph Viewport */}
      <div className="graph-container">
      <GraphView
        graphData={graphData}
        config={config}
        onNodeSelect={setSelectedNode}
        selectedNode={selectedNode}
        selectedLayer={selectedLayer}
        resetViewTrigger={resetViewTrigger}
      />

        {/* Selected node info overlay */}
        <NodeInfo node={selectedNode} />

        {/* Error banner */}
        {error && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 340,
              background: '#451a22',
              color: '#fca5a5',
              padding: '10px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              border: '1px solid #7f1d1d',
              zIndex: 20,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Side Panel */}
      <ControlPanel
        config={config}
        updateConfig={updateConfig}
        onLoadSample={handleLoadSample}
        onLoadFromAPI={handleLoadFromAPI}
        onFileUpload={handleFileUpload}
        onResetView={handleResetView}
        selectedLayer={selectedLayer}
        onSelectLayer={setSelectedLayer}
        availableLayers={availableLayers}
      />
    </div>
  );
}