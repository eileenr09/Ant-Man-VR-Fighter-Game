/**
 * world.js — Scene, lighting, and static geometry
 *
 * Exposes:
 *   window.ANT = {} — shared game namespace
 *   ANT.scene, ANT.camera, ANT.renderer
 *   ANT.QUEEN_CHAMBER = { x, y, z }
 */

(function () {
  'use strict';

  /* ── Shared namespace ── */
  const ANT = (window.ANT = {});

  /* ── Renderer ── */
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  ANT.renderer = renderer;

  /* ── Scene ── */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a0a00);
  scene.fog = new THREE.Fog(0x1a0a00, 8, 38);
  ANT.scene = scene;

  /* ── Camera ── */
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 1.7, 2);
  ANT.camera = camera;

  /* ── Resize ── */
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  renderer.setSize(window.innerWidth, window.innerHeight);

  /* ─────────────── Lighting ─────────────── */

  scene.add(new THREE.AmbientLight(0x331100, 0.7));

  const sun = new THREE.DirectionalLight(0xffaa44, 1.2);
  sun.position.set(5, 12, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  /* ─────────────── Materials ─────────────── */

  const MAT = {
    dirt:     new THREE.MeshLambertMaterial({ color: 0x6b3a1f }),
    darkDirt: new THREE.MeshLambertMaterial({ color: 0x3d1f0a }),
    wall:     new THREE.MeshLambertMaterial({ color: 0x4a2510 }),
    floor:    new THREE.MeshLambertMaterial({ color: 0x5c2e12 }),
    stone:    new THREE.MeshLambertMaterial({ color: 0x7a6a55 }),
  };
  ANT.MAT = MAT;

  /* ─────────────── Helper: box ─────────────── */

  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  /* ─────────────── Surface ─────────────── */

  // Boulders / cover objects
  const boulderData = [
    [3.5, 0, -6, 1.0],
    [-4,  0, -3, 0.7],
    [6,   0,  3, 0.9],
    [-2,  0,  5, 0.6],
    [9,   0, -2, 1.2],
    [-7,  0,  2, 0.5],
  ];
  boulderData.forEach(([bx, , bz, r]) => {
    const g = new THREE.SphereGeometry(r, 7, 5);
    const m = new THREE.Mesh(g, MAT.stone);
    m.position.set(bx, r * 0.9, bz);
    m.castShadow = true;
    scene.add(m);
  });

  /* ─────────────── Tunnel system ─────────────── */
  // Three entry tunnels; each descends 4 sections.
  // Tunnel B (centre) leads to the Queen's Chamber.

  const TUNNEL_CONFIGS = [
    { x: -8, z: -4, id: 'A' },
    { x:  0, z: -5, id: 'B' },
    { x:  8, z: -4, id: 'C' },
  ];

  const SECTIONS = 4;

  TUNNEL_CONFIGS.forEach(({ x, z }) => {
    for (let i = 0; i < SECTIONS; i++) {
      const sy = -i * 2.2;
      const sz = z - i * 2.6 - 1.6;

      // Floor slab — registered for VR teleportation
      ANT.teleportFloors.push(box(3, 0.3, 3, MAT.darkDirt, x, sy - 0.15, sz));
      // Ceiling slab
      box(3, 0.3, 3, MAT.darkDirt, x, sy + 2.05, sz);
      // Left wall
      box(0.3, 2.2, 3, MAT.wall, x - 1.5, sy + 0.9, sz);
      // Right wall
      box(0.3, 2.2, 3, MAT.wall, x + 1.5, sy + 0.9, sz);
      // Back wall (entry cap)
      if (i === 0) box(3, 2.5, 0.3, MAT.wall, x, sy + 1.05, z - 0.15);

      // Tunnel glow light every other section
      if (i % 2 === 0) {
        const lp = new THREE.PointLight(0xff6600, 0.9, 7);
        lp.position.set(x, sy + 1.5, sz);
        scene.add(lp);
      }
    }
  });

  /* ─────────────── Queen's Chamber ─────────────── */

  const QC = { x: 0, y: -12, z: -18 };
  ANT.QUEEN_CHAMBER = QC;

  // Floor + ceiling
  ANT.teleportFloors.push(box(14, 0.3, 14, MAT.darkDirt, QC.x, QC.y - 0.15, QC.z));
  box(14, 0.3, 14, MAT.darkDirt, QC.x, QC.y + 4.15, QC.z);

  // Four walls
  box(0.3, 4.5, 14, MAT.wall, QC.x - 7,  QC.y + 2, QC.z);
  box(0.3, 4.5, 14, MAT.wall, QC.x + 7,  QC.y + 2, QC.z);
  box(14,  4.5, 0.3, MAT.wall, QC.x, QC.y + 2, QC.z - 7);
  box(14,  4.5, 0.3, MAT.wall, QC.x, QC.y + 2, QC.z + 7);

  // Eerie red chamber light
  const queenLight = new THREE.PointLight(0xff0044, 2.5, 22);
  queenLight.position.set(QC.x, QC.y + 3.5, QC.z);
  scene.add(queenLight);

  // Pulsing light animation stored for main loop
  ANT.queenLight = queenLight;

  /* ─────────────── Eggs / decoration in chamber ─────────────── */

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const r = 3.5;
    const eg = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 5),
      new THREE.MeshLambertMaterial({ color: 0xffeedd })
    );
    eg.position.set(
      QC.x + Math.cos(angle) * r,
      QC.y + 0.22,
      QC.z + Math.sin(angle) * r
    );
    scene.add(eg);
  }


  /* ─────────────── Glow Blobs ─────────────── */
  // Bioluminescent orbs scattered through tunnels and chamber
  const glowBlobData = [
    // Surface
    [  0,  1.5,   0,  0x00ff88, 0.6],
    [ -8,  1.5,  -3,  0xffaa00, 0.5],
    [  8,  1.5,  -3,  0x00ccff, 0.5],
    // Tunnel A (left)
    [ -8, -1.5,  -7,  0xff8800, 0.7],
    [ -8, -4.5, -11,  0x00ffcc, 0.6],
    // Tunnel B (centre — leads to queen)
    [  0, -2.5,  -9,  0xff4444, 0.8],
    [  0, -6.5, -13,  0xff0044, 1.0],
    // Tunnel C (right)
    [  8, -1.5,  -7,  0x8844ff, 0.7],
    [  8, -4.5, -11,  0x00ff88, 0.6],
    // Queen's Chamber
    [  3, QC.y + 1.5, QC.z + 3, 0xff0022, 1.2],
    [ -3, QC.y + 1.5, QC.z - 3, 0xff2200, 1.0],
    [  0, QC.y + 3.5, QC.z,     0xff0055, 1.5],
  ];

  glowBlobData.forEach(([gx, gy, gz, color, intensity]) => {
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color })
    );
    blob.position.set(gx, gy, gz);
    scene.add(blob);

    const blobLight = new THREE.PointLight(color, intensity, 5.5);
    blobLight.position.set(gx, gy, gz);
    scene.add(blobLight);
  });

  /* ─────────────── Dirt Bumps ─────────────── */
  // Small flattened lumps pressed into the surface and tunnel floors
  const bumpMat = new THREE.MeshLambertMaterial({ color: 0x3a1a06 });

  // Surface bumps
  for (let i = 0; i < 50; i++) {
    const bx = (Math.random() - 0.5) * 28;
    const bz = (Math.random() - 0.5) * 18 - 2;
    const br = 0.06 + Math.random() * 0.22;
    const bump = new THREE.Mesh(new THREE.SphereGeometry(br, 5, 4), bumpMat);
    bump.position.set(bx, br * 0.28, bz);
    bump.scale.set(1 + Math.random() * 0.9, 0.22 + Math.random() * 0.3, 1 + Math.random() * 0.9);
    scene.add(bump);
  }

  // Tunnel floor bumps (each tunnel x-centre, along z descent)
  [{ tx: -8, tz: -8 }, { tx: 0, tz: -9 }, { tx: 8, tz: -8 }].forEach(({ tx, tz }) => {
    for (let i = 0; i < 10; i++) {
      const br = 0.04 + Math.random() * 0.1;
      const bump = new THREE.Mesh(new THREE.SphereGeometry(br, 4, 3), bumpMat);
      bump.position.set(
        tx + (Math.random() - 0.5) * 2.2,
        (Math.random() - 0.5) * 1.4 - 2,
        tz - Math.random() * 7
      );
      bump.scale.set(1.2, 0.28, 1.2);
      scene.add(bump);
    }
  });

})();
