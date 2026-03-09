import { useState, useCallback } from 'react';

/**
 * Hook to manage force simulation and visual configuration settings.
 */
export function useForceConfig() {
  const [config, setConfig] = useState({
    // Within-layer repulsion (inverse-linear, weight-scaled)
    repulsionStrength: 100,
    repulsionMaxDistance: 200,

    // Cross-layer spring (Hooke's law with positive rest length)
    springStrength: 0.05,
    springRestLength: 5,

    // Simulation damping (d3-force velocityDecay: 0 = no friction, 1 = frozen)
    damping: 0.4,

    // Visual toggles
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
