/**
 * hud.js — All HUD / DOM updates
 *
 * Exposes:
 *   ANT.HUD.updatePlayerHp(hp)
 *   ANT.HUD.setWeapon(weapon, ammo)
 *   ANT.HUD.updateAmmo(ammo)
 *   ANT.HUD.showMsg(text, durationMs)   — 0 = persistent
 *   ANT.HUD.flashCrosshair()
 *   ANT.HUD.flashZone(zoneName)
 *   ANT.HUD.updateQueenHp(pct)         — 0-1
 *   ANT.HUD.tick(dt)                    — called every frame
 */

(function () {
  'use strict';

  const ANT = window.ANT;

  /* ─────────────── Element refs ─────────────── */

  const E = {
    php:          document.getElementById('php'),
    kills:        document.getElementById('kills'),
    zone:         document.getElementById('zone'),
    pbarFill:     document.getElementById('pbar-fill'),
    weaponIcon:   document.getElementById('weapon-icon'),
    weaponName:   document.getElementById('weapon-name'),
    ammo:         document.getElementById('ammo'),
    msg:          document.getElementById('msg'),
    zoneLbl:      document.getElementById('zone-label'),
    crosshair:    document.getElementById('crosshair'),
    queenHpFill:  document.getElementById('queen-hp-fill'),
    killFeed:     document.getElementById('kill-feed'),
  };

  /* ─────────────── HUD namespace ─────────────── */

  ANT.HUD = {};

  /* ── Player health ── */
  ANT.HUD.updatePlayerHp = function (hp) {
    const pct = hp / 100;
    E.php.textContent        = Math.round(hp);
    E.pbarFill.style.width   = pct * 100 + '%';
    E.pbarFill.style.background =
      pct > 0.5 ? '#44ff44' : pct > 0.25 ? '#ffff00' : '#ff4444';
  };

  /* ── Weapon slot ── */
  ANT.HUD.setWeapon = function (weapon, ammo) {
    E.weaponIcon.textContent = weapon.icon;
    E.weaponName.textContent = weapon.name;
    ANT.HUD.updateAmmo(ammo);
  };

  ANT.HUD.updateAmmo = function (ammo) {
    E.ammo.textContent = ammo === -1 ? '∞  Ammo' : `Ammo: ${ammo}`;
  };

  /* ── Message overlay ── */
  let _msgTimer = null;

  ANT.HUD.showMsg = function (text, durationMs) {
    E.msg.innerHTML = text.replace(/\n/g, '<br>');
    E.msg.style.display = 'block';

    if (_msgTimer) clearTimeout(_msgTimer);
    if (durationMs > 0) {
      _msgTimer = setTimeout(() => { E.msg.style.display = 'none'; }, durationMs);
    }
  };

  /* ── Crosshair flash ── */
  ANT.HUD.flashCrosshair = function () {
    E.crosshair.style.opacity = '0.15';
    setTimeout(() => { E.crosshair.style.opacity = '1'; }, 110);
  };

  /* ── Zone transition label ── */
  ANT.HUD.flashZone = function (zoneName) {
    E.zoneLbl.textContent  = zoneName.toUpperCase();
    E.zoneLbl.style.opacity = '1';
    setTimeout(() => { E.zoneLbl.style.opacity = '0'; }, 2200);
  };

  /* ── Queen HP (0-1) ── */
  ANT.HUD.updateQueenHp = function (pct) {
    E.queenHpFill.style.width = Math.max(0, pct * 100) + '%';
  };

  /* ── Per-frame tick (pickup proximity hint) ── */
  const _playerPos = new THREE.Vector3();

  ANT.HUD.tick = function () {
    if (!ANT.pickups) return;
    _playerPos.copy(ANT.camera.position);
    const near = ANT.pickups.some(p => p.active && _playerPos.distanceTo(p.pos) < 2.8);
    E.crosshair.style.color = near ? '#00ffcc' : '';
    if (near) {
      E.crosshair.title = 'Press E to pick up weapon';
    }
  };

  /* ─────────────── Startup splash ─────────────── */

  ANT.HUD.showMsg(
    '🐜  ANT COLONY: VR RAID  🐜\n\n' +
    'Click to lock mouse & start\n\n' +
    'WASD = Move  |  Mouse = Look\n' +
    'Click = Attack  |  E = Pick up\n' +
    'Space = Jump\n\n' +
    'Descend the tunnels.\nDestroy the Queen.',
    5500
  );

})();
