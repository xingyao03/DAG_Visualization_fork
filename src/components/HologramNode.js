import * as THREE from 'three';

/**
 * Creates a realistic plasma-core node scaled by weight.
 * Features: emissive plasma core, asteroid belt particles, orbital trails, and outer halo.
 * Uses node.color to tint the palette; larger weight → bigger node.
 *
 * @param {object} node - Graph node with weight and color properties
 * @returns {THREE.Group}
 */
export function createHologramNode(node) {
  const group = new THREE.Group();
  const w = node.weight || 10;
  // Scale factor: weight 10 → ~0.7x, weight 170 → ~3.9x
  const s = 0.5 + (w / 50);
  const color = new THREE.Color(node.color || '#3b82f6');

  // 1. Plasma Core (emissive glowing center)
  const coreGeometry = new THREE.SphereGeometry(3 * s, 32, 32);
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: color.clone().offsetHSL(0, 0, 0.3),
    emissive: color,
    emissiveIntensity: 2,
    roughness: 0.8,
  });
  group.add(new THREE.Mesh(coreGeometry, coreMaterial));

  // 2. Asteroid Belt (particle ring)
  const particleCount = 400;
  const particlesGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = (6 + Math.random() * 1.5) * s;
    const yScatter = (Math.random() - 0.5) * 0.8 * s;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = yScatter;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particlesMaterial = new THREE.PointsMaterial({
    color: color.clone().offsetHSL(0.05, -0.2, 0.1),
    size: 0.15 * s,
    transparent: true,
    opacity: 0.8,
  });
  const asteroidBelt = new THREE.Points(particlesGeometry, particlesMaterial);
  asteroidBelt.rotation.x = Math.PI / 8;
  asteroidBelt.rotation.y = Math.PI / 6;
  group.add(asteroidBelt);

  // 3. High-Energy Orbital Trails
  const trailMaterial = new THREE.MeshBasicMaterial({
    color: color.clone().offsetHSL(0, -0.3, 0.4),
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
  });

  const trail1Geo = new THREE.TorusGeometry(8 * s, 0.05 * s, 8, 64);
  const trail1 = new THREE.Mesh(trail1Geo, trailMaterial);
  trail1.rotation.x = Math.PI / 3;
  trail1.rotation.y = Math.PI / 4;
  group.add(trail1);

  const trail2Geo = new THREE.TorusGeometry(8.5 * s, 0.03 * s, 8, 64);
  const trail2 = new THREE.Mesh(trail2Geo, trailMaterial);
  trail2.rotation.x = -Math.PI / 4;
  trail2.rotation.y = Math.PI / 8;
  group.add(trail2);

  // 4. Outer Atmosphere / Halo
  const haloGeometry = new THREE.SphereGeometry(4.5 * s, 32, 32);
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(haloGeometry, haloMaterial));

  return group;
}
