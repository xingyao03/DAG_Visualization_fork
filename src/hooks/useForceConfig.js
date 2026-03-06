import { useState, useCallback } from 'react';

/**
 * Hook to manage visual configuration settings.
 */
export function useForceConfig() {
  const [config, setConfig] = useState({
    repulsionStrength: -30,
    repulsionMaxDistance: 150,
    showLabels: true,
    showLinks: false,
    showLayerPlanes: true,
    showForceField: false,
  });

  const updateConfig = useCallback((key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  return { config, updateConfig };
}
