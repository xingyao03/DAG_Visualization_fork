import { useState, useCallback } from 'react';

/**
 * Hook to manage force simulation and visual configuration settings.
 */
export function useForceConfig() {
  const [config, setConfig] = useState({
    // Within-layer repulsion (inverse-linear, weight-normalized)
    // 200: aggressive push — unconnected nodes fly to periphery
    repulsionStrength: 200,
    // 500: very wide range so outliers keep getting pushed even far away
    repulsionMaxDistance: 500,

    // Cross-layer spring (Hooke's law with per-link rest length)
    // 0.08: strong pull — connected nodes resist the repulsion and hold together
    springStrength: 0.08,
    // 15: tight rest length (clusters are compact)
    springRestLength: 15,

    // Simulation damping (d3-force velocityDecay: 0 = no friction, 1 = frozen)
    // 0.30: low friction — lets the system push outliers all the way out
    damping: 0.30,

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