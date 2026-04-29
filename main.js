/**
 * main.js — Game loop, orchestrates all modules
 *
 * Uses renderer.setAnimationLoop (required for WebXR) instead of
 * requestAnimationFrame so the loop automatically integrates with the
 * XRFrame when a VR session is active.
 *
 * Load order: world → ants → weapons → player → hud → physics → xr → main
 */

(function () {
  'use strict';

  const ANT      = window.ANT;
  const scene    = ANT.scene;
  const camera   = ANT.camera;
  const renderer = ANT.renderer;

  const clock = new THREE.Clock();

  /* ─────────────── Pickup bob / spin ─────────────── */

  function animatePickups(elapsed) {
    if (!ANT.pickups) return;
    ANT.pickups.forEach(p => {
      if (!p.active) return;
      p.mesh.position.y  = p.pos.y + Math.sin(elapsed * 2 + p.pos.x) * 0.07;
      p.mesh.rotation.y += 0.016;
      if (p.sprite) {
        p.sprite.position.y = p.pos.y + Math.sin(elapsed * 2 + p.pos.x) * 0.07 + 0.38;
      }
    });
  }

  /* ─────────────── Queen HUD sync ─────────────── */

  function syncQueenHud() {
    if (!ANT.queen || !ANT.queen.alive) return;
    ANT.HUD.updateQueenHp(ANT.queen.hp / ANT.queen.maxHp);
  }

  /* ─────────────── Main animation loop ─────────────── */
  // setAnimationLoop hands control to the XR runtime when a session is active;
  // the callback receives the XRFrame timestamp automatically.

  renderer.setAnimationLoop(function () {
    const dt      = Math.min(clock.getDelta(), 0.05); // cap at 50 ms
    const elapsed = clock.elapsedTime;

    /* Player movement, gravity, zone detection */
    ANT.player.update(dt);

    /* Ant AI — wander / smell-seek / trail-follow / seek */
    ANT.updateAnts(dt);

    /* Weapon hand recoil + muzzle flash */
    if (ANT.updatePistol) ANT.updatePistol(dt);

    /* WebXR controller handling, teleport, grab-sync */
    if (ANT.updateXR) ANT.updateXR(dt);

    /* Cannon physics step + mesh sync */
    if (ANT.updatePhysics) ANT.updatePhysics(dt);

    /* Pickup item animations */
    animatePickups(elapsed);

    /* Queen HP bar */
    syncQueenHud();

    /* Pickup proximity crosshair hint */
    ANT.HUD.tick();

    /* Render */
    renderer.render(scene, camera);
  });

})();
