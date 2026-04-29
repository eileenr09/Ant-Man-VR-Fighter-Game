/**
 * physics.js — Cannon.js physics world + food-crumb rigid bodies
 *
 * Exposes:
 *   ANT.physicsWorld  — CANNON.World instance
 *   ANT.foodBodies    — [{mesh, body}] synced pairs
 *   ANT.grabbedFood   — currently held crumb (set by xr.js)
 *   ANT.updatePhysics(dt)
 */

(function () {
  'use strict';

  if (typeof CANNON === 'undefined') {
    console.warn('physics.js: CANNON not loaded — skipping physics');
    ANT.updatePhysics = function () {};
    ANT.foodBodies    = [];
    return;
  }

  const ANT   = window.ANT;
  const scene = ANT.scene;

  /* ── Physics world ── */
  const world = new CANNON.World();
  world.gravity.set(0, -9.8, 0);
  world.broadphase     = new CANNON.NaiveBroadphase();
  world.solver.iterations = 8;

  // Static floor plane
  const floorBody = new CANNON.Body({ mass: 0 });
  floorBody.addShape(new CANNON.Plane());
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floorBody);

  ANT.physicsWorld = world;
  ANT.foodBodies   = [];
  ANT.grabbedFood  = null;

  /* ── Food-crumb spawn positions [x, y, z] ── */
  const CRUMB_SPAWNS = [
    [  2, 0.5, -1 ],
    [ -3, 0.5, -2 ],
    [  0, 0.5,  1 ],
    [  5, 0.5,  2 ],
    [ -6, 0.5, -1 ],
    [  1, 0.5,  3 ],
    [ -2, 0.5,  0 ],
  ];

  const crumbMat = new THREE.MeshLambertMaterial({ color: 0xcc9944 });

  CRUMB_SPAWNS.forEach(([x, y, z]) => {
    /* Three.js mesh */
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), crumbMat);
    mesh.castShadow  = true;
    mesh.position.set(x, y, z);
    scene.add(mesh);

    /* Cannon rigid body */
    const body = new CANNON.Body({
      mass:            0.1,
      linearDamping:   0.45,
      angularDamping:  0.65,
    });
    body.addShape(new CANNON.Sphere(0.08));
    body.position.set(x, y, z);
    world.addBody(body);

    ANT.foodBodies.push({ mesh, body });
  });

  /* ── Step physics and sync meshes ── */
  const FIXED_DT = 1 / 60;

  ANT.updatePhysics = function (dt) {
    world.step(FIXED_DT, dt, 3);

    ANT.foodBodies.forEach(fb => {
      // Skip if this crumb is being held by the XR controller
      if (ANT.grabbedFood === fb) return;

      fb.mesh.position.set(
        fb.body.position.x,
        fb.body.position.y,
        fb.body.position.z
      );
      fb.mesh.quaternion.set(
        fb.body.quaternion.x,
        fb.body.quaternion.y,
        fb.body.quaternion.z,
        fb.body.quaternion.w
      );
    });
  };

})();
