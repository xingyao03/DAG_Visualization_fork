import { useState, useCallback } from 'react';

/**
 * Hook to manage visual configuration settings.
 */
export function useForceConfig() {
  const [config, setConfig] = useState({
    showLabels: true,
    showLinks: true,
    showLayerPlanes: true,
    repulsionStrength: -300,
    springStrength: 0.02,
    springDistance: 150,
  });

  const updateConfig = useCallback((key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  return { config, updateConfig };
}
