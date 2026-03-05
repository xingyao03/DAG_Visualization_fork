import { useState } from 'react';

/**
 * ControlPanel Component
 *
 * Provides sliders and controls for tuning force simulation parameters,
 * data source selection, and API endpoint input.
 */
export default function ControlPanel({
  config,
  updateConfig,
  onLoadSample,
  onLoadFromAPI,
  onFileUpload,
  onResetView,
  availableLayers = [],
  selectedLayer = 'all',
  onSelectLayer,
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`control-panel${collapsed ? ' collapsed' : ''}`}>
      {/* Header */}
      <div className="panel-header">
        {!collapsed && <h1>DAG Explorer</h1>}
        {!collapsed && <span className="badge">3D</span>}
        <button
          className="panel-toggle"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {collapsed ? '‹' : '›'}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Data Source */}
          <div className="panel-section">
            <h2>Data Source</h2>
            <div className="btn-group">
              <button className="btn btn-primary" onClick={onLoadSample}>
                Load Sample
              </button>
              <label className="btn" style={{ cursor: 'pointer' }}>
                Upload JSON
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && onFileUpload) onFileUpload(file);
                  }}
                />
              </label>
            </div>

            {/* API Endpoint */}
            <div className="api-input-group">
              <input
                type="text"
                placeholder="https://api.example.com/graph"
                id="api-url-input"
              />
              <button
                className="btn"
                onClick={() => {
                  const url = document.getElementById('api-url-input')?.value;
                  if (url && onLoadFromAPI) onLoadFromAPI(url);
                }}
              >
                Fetch
              </button>
            </div>
          </div>

          {/* View Controls */}
          <div className="panel-section">
            <h2>View Controls</h2>

            <div className="control-group">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (onResetView) onResetView();
                }}
              >
                Reset View
              </button>
            </div>

            <div className="control-group">
              <label htmlFor="layer-select">View Layer</label>
              <select
                id="layer-select"
                className="layer-select"
                value={selectedLayer}
                onChange={(e) => {
                  if (onSelectLayer) onSelectLayer(e.target.value);
                }}
              >
                <option value="all">All Layers</option>
                {availableLayers.map((layer) => (
                  <option key={layer} value={layer}>
                    {typeof layer === 'number' ? `Layer ${layer}` : layer}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Visual Settings */}
          <div className="panel-section">
            <h2>Visual</h2>
            <div className="toggle-control">
              <label>
                <input
                  type="checkbox"
                  checked={config.showLinks}
                  onChange={(e) => updateConfig('showLinks', e.target.checked)}
                />
                <span>Show Bonds</span>
              </label>
            </div>
            <div className="toggle-control">
              <label>
                <input
                  type="checkbox"
                  checked={config.showLayerPlanes}
                  onChange={(e) => updateConfig('showLayerPlanes', e.target.checked)}
                />
                <span>Show Layers</span>
              </label>
            </div>
            <div className="toggle-control">
              <label>
                <input
                  type="checkbox"
                  checked={config.showForceField}
                  onChange={(e) => updateConfig('showForceField', e.target.checked)}
                />
                <span>Show Force Field</span>
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}