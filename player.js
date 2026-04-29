/**
 * player.js — First-person movement, pointer-lock, physics, damage
 *
 * Exposes:
 *   ANT.player.update(dt)
 *   ANT.player.takeDamage(amount)
 *   ANT.playerHp  — current HP (0-100)
 *   ANT.gameOver  — bool
 *   ANT.gameWon   — bool
 *   ANT.kills     — kill count
 */

(function () {
  'use strict';

  const ANT    = window.ANT;
  const camera = ANT.camera;
  const canvas = document.getElementById('c');

  /* ─────────────── State ─────────────── */

  ANT.playerHp = 100;
  ANT.gameOver = false;
  ANT.gameWon  = false;
  ANT.kills    = 0;

  const keys  = {};
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  let yVel     = 0;
  let onGround = true;
  let hitFlash = 0;

  const GRAVITY  = -9.8;
  const JUMP_VEL = 4.5;
  const SPEED    = 5.5;

  /* ─────────────── Keyboard ─────────────── */

  window.addEventListener('keydown', e => {
    keys[e.code] = true;

    if (e.code === 'KeyE') ANT.tryPickup();

    if ((e.code === 'Space') && onGround && !ANT.gameOver) {
      yVel     = JUMP_VEL;
      onGround = false;
    }
  });

  window.addEventListener('keyup', e => {
    keys[e.code] = false;
  });

  /* ─────────────── Mouse / pointer lock ─────────────── */

  canvas.addEventListener('click', () => {
    if (!document.pointerLockElement) {
      canvas.requestPointerLock();
      return;
    }
    ANT.doAttack();
  });

  document.addEventListener('mousemove', e => {
    if (!document.pointerLockElement) return;
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= e.movementX * 0.002;
    euler.x -= e.movementY * 0.002;
    euler.x  = Math.max(-1.2, Math.min(1.2, euler.x));
    camera.quaternion.setFromEuler(euler);
  });

  /* ─────────────── Floor height map ─────────────── */
  // Returns the Y of the floor at world position (px, pz).
  // The three tunnels slope downward; tunnel B reaches -12.

  function floorAt(px, pz) {
    // Check tunnel B (centre)
    if (px > -2 && px < 2 && pz < -5 && pz > -23) {
      const progress = Math.max(0, Math.min(1, (-pz - 5) / 17));
      return -progress * 12;
    }
    // Check tunnel A (left)
    if (px > -10 && px < -6 && pz < -4 && pz > -16) {
      const progress = Math.max(0, Math.min(1, (-pz - 4) / 12));
      return -progress * 9;
    }
    // Check tunnel C (right)
    if (px > 6 && px < 10 && pz < -4 && pz > -16) {
      const progress = Math.max(0, Math.min(1, (-pz - 4) / 12));
      return -progress * 9;
    }
    return 0; // Surface
  }

  /* ─────────────── Damage ─────────────── */

  ANT.player = {};

  ANT.player.takeDamage = function (amount) {
    if (ANT.gameOver || ANT.gameWon) return;
    ANT.playerHp = Math.max(0, ANT.playerHp - amount);

    // Update HUD
    ANT.HUD.updatePlayerHp(ANT.playerHp);
    hitFlash = 0.18;

    if (ANT.playerHp <= 0) {
      ANT.gameOver = true;
      ANT.HUD.showMsg(
        '💀 YOU DIED\nThe ants have overrun you...\n\nRefresh the page to try again.',
        0
      );
    }
  };

  /* ─────────────── Movement update ─────────────── */

  const _moveDir   = new THREE.Vector3();
  const _worldPos  = new THREE.Vector3(); // reused for getWorldPosition

  ANT.player.update = function (dt) {
    if (ANT.gameOver || ANT.gameWon) return;

    // In XR mode the headset drives camera; skip desktop physics/movement
    const inXR = ANT.renderer.xr && ANT.renderer.xr.isPresenting;

    if (!inXR) {
      /* ── Horizontal movement ── */
      _moveDir.set(0, 0, 0);
      if (keys['KeyW'] || keys['ArrowUp'])    _moveDir.z -= 1;
      if (keys['KeyS'] || keys['ArrowDown'])  _moveDir.z += 1;
      if (keys['KeyA'] || keys['ArrowLeft'])  _moveDir.x -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) _moveDir.x += 1;

      if (_moveDir.lengthSq() > 0) {
        _moveDir.normalize().multiplyScalar(SPEED * dt);
        _moveDir.applyQuaternion(camera.quaternion);
        _moveDir.y = 0;
        camera.position.addScaledVector(_moveDir, 1);
      }

      /* ── Gravity + jump ── */
      yVel += GRAVITY * dt;
      camera.position.y += yVel * dt;

      const fy = floorAt(camera.position.x, camera.position.z);
      if (camera.position.y < fy + 1.7) {
        camera.position.y = fy + 1.7;
        yVel     = 0;
        onGround = true;
      }

      /* ── World bounds ── */
      camera.position.x = Math.max(-14, Math.min(14, camera.position.x));
      camera.position.z = Math.max(-24, Math.min(9,  camera.position.z));
    }

    /* ── Cooldown ── */
    ANT.attackCooldown = Math.max(0, ANT.attackCooldown - dt);

    /* ── Zone detection — use world position so XR dolly offset is included ── */
    camera.getWorldPosition(_worldPos);
    // In XR, floor-level Y comes from the dolly; camera Y inside dolly is ~head height
    const py = ANT.xrDolly ? ANT.xrDolly.position.y : _worldPos.y;
    const pz = ANT.xrDolly ? ANT.xrDolly.position.z : _worldPos.z;

    let zn = 'Surface';
    if (py < -1)  zn = 'Upper Tunnels';
    if (py < -5)  zn = 'Deep Tunnels';
    if (py < -10) zn = "Queen's Chamber";

    if (zn !== ANT._lastZone) {
      ANT._lastZone = zn;
      const zoneEl = document.getElementById('zone');
      if (zoneEl) zoneEl.textContent = zn;
      ANT.HUD.flashZone(zn);

      if (zn === "Queen's Chamber") {
        const qw = document.getElementById('queen-hp-wrap');
        if (qw) qw.style.display = 'block';
        ANT.HUD.showMsg("⚠️  QUEEN'S CHAMBER ⚠️\nFace the Queen!\nShe is stronger and faster.", 2800);
        // Trigger chamber audio if XR is active
        if (typeof ANT.playChamberAudio === 'function') ANT.playChamberAudio();
      }
    }

    /* ── Damage flash ── */
    if (hitFlash > 0) {
      hitFlash = Math.max(0, hitFlash - dt);
      ANT.renderer.setClearColor(new THREE.Color(0.9, 0.05, 0.05), hitFlash * 3);
    } else {
      ANT.renderer.setClearColor(0x1a0a00, 1);
    }

    /* ── Queen chamber light pulse ── */
    if (ANT.queenLight) {
      const t = performance.now() * 0.001;
      ANT.queenLight.intensity = 2.0 + Math.sin(t * 2.5) * 0.7;
    }
  };

})();
