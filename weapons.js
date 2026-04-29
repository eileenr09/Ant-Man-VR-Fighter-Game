/**
 * weapons.js — Weapon definitions and pickup system
 *
 * Exposes:
 *   ANT.WEAPONS      — array of weapon definitions
 *   ANT.pickups      — array of live pickup objects
 *   ANT.curWeapon    — currently held weapon (or null)
 *   ANT.ammo         — current ammo count (-1 = infinite)
 *   ANT.attackCooldown
 *   ANT.tryPickup()  — attempt to grab nearest weapon
 *   ANT.doAttack()   — fire/swing current weapon
 */

(function () {
  'use strict';

  const ANT = window.ANT;
  const scene = ANT.scene;
  const camera = ANT.camera;

  /* ─────────────── Weapon definitions ─────────────── */

  ANT.WEAPONS = [
    {
      name:      'Magnifying Glass',
      icon:      '🔍',
      dmg:       15,
      range:     3.5,
      color:     0xffee00,
      ammo:      Infinity,
      swingTime: 0.55,
      desc:      'Focused sunlight. Steady damage at medium range.',
    },
    {
      name:      'Bug Spray',
      icon:      '💨',
      dmg:       8,
      range:     6,
      color:     0x00ffcc,
      ammo:      30,
      swingTime: 0.18,
      desc:      'Fast-firing chemical spray. Limited canister.',
    },
    {
      name:      'Boot',
      icon:      '👢',
      dmg:       28,
      range:     2,
      color:     0x884422,
      ammo:      Infinity,
      swingTime: 0.85,
      desc:      'Maximum stomp damage. Very short range.',
    },
    {
      name:      'Flamethrower',
      icon:      '🔥',
      dmg:       12,
      range:     5,
      color:     0xff4400,
      ammo:      20,
      swingTime: 0.14,
      desc:      'Burns them fast. Fuel runs out quick.',
    },
    {
      name:      'Tweezers',
      icon:      '🩺',
      dmg:       42,
      range:     1.8,
      color:     0xbbbbbb,
      ammo:      Infinity,
      swingTime: 1.05,
      desc:      'Highest single-hit damage. Must be close.',
    },
  ];

  /* ─────────────── Pickup spawn positions ─────────────── */
  // [x, y, z, weaponIndex]

  const SPAWN_POSITIONS = [
    // Surface weapons
    [-3,   0,   -2,   0],   // Magnifying Glass
    [ 2,   0,   -3,   1],   // Bug Spray
    [ 5,   0,    1,   2],   // Boot
    [-6,   0,    0,   3],   // Flamethrower
    [ 0,   0,    2,   4],   // Tweezers
    // Deep tunnel weapons (respawn aids)
    [-8,  -8.5, -14,  3],   // Boot deep
    [ 0,  -4.5,  -8,  1],   // Bug Spray mid-tunnel
    [ 7,  -6,   -12,  0],   // Magnifying Glass deep
  ];

  /* ─────────────── Build pickup meshes ─────────────── */

  ANT.pickups = [];

  SPAWN_POSITIONS.forEach(([x, y, z, wi]) => {
    const weapon = ANT.WEAPONS[wi];

    // Glowing orb mesh
    const geo = new THREE.SphereGeometry(0.18, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: weapon.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.3, z);
    scene.add(mesh);

    // Tiny label sprite (canvas texture)
    const lc = document.createElement('canvas');
    lc.width = 48; lc.height = 48;
    const ctx = lc.getContext('2d');
    ctx.font = '32px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(weapon.icon, 24, 26);
    const lt = new THREE.CanvasTexture(lc);
    const ls = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, depthTest: false }));
    ls.scale.set(0.45, 0.45, 1);
    ls.position.set(x, y + 0.7, z);
    scene.add(ls);

    ANT.pickups.push({
      pos:    new THREE.Vector3(x, y + 0.3, z),
      weapon,
      mesh,
      sprite: ls,
      active: true,
    });
  });

  /* ─────────────── Player weapon state ─────────────── */

  ANT.curWeapon     = null;
  ANT.ammo          = 0;
  ANT.attackCooldown = 0;

  /* ─────────────── Pickup ─────────────── */

  ANT.tryPickup = function () {
    let closest = null;
    let closestDist = 2.8;

    ANT.pickups.forEach(p => {
      if (!p.active) return;
      const d = camera.position.distanceTo(p.pos);
      if (d < closestDist) { closestDist = d; closest = p; }
    });

    if (!closest) return;

    closest.active = false;
    scene.remove(closest.mesh);
    scene.remove(closest.sprite);

    ANT.curWeapon = closest.weapon;
    ANT.ammo      = closest.weapon.ammo === Infinity ? -1 : closest.weapon.ammo;

    ANT.HUD.setWeapon(closest.weapon, ANT.ammo);
    ANT.HUD.showMsg(`Picked up: ${closest.weapon.name}!\n${closest.weapon.desc}`, 1800);
  };

  /* ─────────────── Pistol / hand mesh ─────────────── */

  // Build a pistol model attached to the camera (always visible in bottom-right)
  const pistolGroup = new THREE.Group();

  // Grip
  const gripGeo = new THREE.BoxGeometry(0.06, 0.14, 0.05);
  const gunMat  = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const grip    = new THREE.Mesh(gripGeo, gunMat);
  pistolGroup.add(grip);

  // Barrel
  const barrelGeo = new THREE.BoxGeometry(0.04, 0.05, 0.22);
  const barrel    = new THREE.Mesh(barrelGeo, gunMat);
  barrel.position.set(0, 0.045, -0.1);
  pistolGroup.add(barrel);

  // Slide / top
  const slideGeo = new THREE.BoxGeometry(0.055, 0.04, 0.18);
  const slideMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const slide    = new THREE.Mesh(slideGeo, slideMat);
  slide.position.set(0, 0.075, -0.08);
  pistolGroup.add(slide);

  // Trigger guard
  const tgGeo = new THREE.BoxGeometry(0.015, 0.05, 0.04);
  const tg    = new THREE.Mesh(tgGeo, gunMat);
  tg.position.set(0, -0.02, 0.015);
  pistolGroup.add(tg);

  // Muzzle flash (hidden until firing)
  const flashGeo = new THREE.SphereGeometry(0.045, 6, 4);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0 });
  const flash    = new THREE.Mesh(flashGeo, flashMat);
  flash.position.set(0, 0.045, -0.24);
  pistolGroup.add(flash);

  // Position: bottom-right of camera frustum
  pistolGroup.position.set(0.18, -0.16, -0.35);
  pistolGroup.rotation.y = 0.12;

  camera.add(pistolGroup);
  // Camera must be in the scene for its children to render
  if (!ANT.scene.children.includes(camera)) ANT.scene.add(camera);

  let pistolRecoilT = 0;
  let flashT        = 0;

  // Animate recoil + flash each frame — called from main loop
  ANT.updatePistol = function (dt) {
    if (pistolRecoilT > 0) {
      pistolRecoilT -= dt;
      const k = Math.max(0, pistolRecoilT / 0.18);
      pistolGroup.position.z = -0.35 + k * 0.07;
      pistolGroup.rotation.x = -k * 0.25;
    } else {
      pistolGroup.position.z = -0.35;
      pistolGroup.rotation.x = 0;
    }

    if (flashT > 0) {
      flashT -= dt;
      flashMat.opacity = Math.max(0, flashT / 0.08);
      flash.scale.setScalar(0.8 + Math.random() * 0.4);
    } else {
      flashMat.opacity = 0;
    }
  };

  /* ─────────────── Raycaster for attack ─────────────── */

  const raycaster = new THREE.Raycaster();

  ANT.doAttack = function () {
    if (ANT.gameOver || ANT.gameWon) return;

    if (!ANT.curWeapon) {
      ANT.HUD.showMsg('Pick up a weapon first!\n(Press E near a glowing orb)', 1600);
      return;
    }
    if (ANT.attackCooldown > 0) return;

    const w = ANT.curWeapon;

    // Consume ammo
    if (w.ammo !== Infinity) {
      if (ANT.ammo <= 0) {
        ANT.HUD.showMsg('OUT OF AMMO!', 1000);
        return;
      }
      ANT.ammo--;
      ANT.HUD.updateAmmo(ANT.ammo);
    }

    ANT.attackCooldown = w.swingTime;
    ANT.HUD.flashCrosshair();

    // Pistol fire effect
    pistolRecoilT = 0.18;
    flashT        = 0.08;

    // Cast ray from screen centre
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);

    const targets = ANT.ants
      .filter(a => a.alive)
      .map(a => a.mesh);

    if (targets.length === 0) return;

    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) return;

    // Identify which ant was hit
    const hitObject = hits[0].object;
    let hitAnt = null;

    for (const ant of ANT.ants) {
      if (!ant.alive) continue;
      if (isDescendant(ant.mesh, hitObject)) { hitAnt = ant; break; }
    }

    if (!hitAnt) return;

    const dist = camera.position.distanceTo(hitAnt.pos);
    if (dist > w.range + 1.0) return; // too far

    hitAnt.hp -= w.dmg;
    ANT.updateAntBar(hitAnt);

    if (hitAnt.hp <= 0) ANT.killAnt(hitAnt);
  };

  /* ─────────────── Utilities ─────────────── */

  function isDescendant(parent, child) {
    if (parent === child) return true;
    for (const c of parent.children) {
      if (isDescendant(c, child)) return true;
    }
    return false;
  }

})();
