/**
 * ants.js — Ant meshes, HP bars, AI behaviour, pheromone trails, and spawning
 *
 * Exposes:
 *   ANT.buildAnt(isQueen)   → THREE.Group with 14-part geometry + userData.legs[]
 *   ANT.ants                — live ant array
 *   ANT.queen               — queen ant object
 *   ANT.pheromones          — [{x,z,strength,age}] pheromone trail markers
 *   ANT.updateAntBar(ant)
 *   ANT.killAnt(ant)
 *   ANT.spawnAnt(x,y,z,isQueen) → ant object
 *   ANT.updateAnts(dt)
 */

(function () {
  'use strict';

  const ANT   = window.ANT;
  const scene = ANT.scene;

  /* ─────────────── buildAnt — 14-part geometry ─────────────── */
  // Parts:
  //  1  Head        2  Thorax      3  Petiole    4  Abdomen
  //  5  Mandible-L  6  Mandible-R
  //  7-12  Legs (3 pairs × L+R), stored in userData.legs with phase offsets
  // 13  Antenna-L  14  Antenna-R

  ANT.buildAnt = function buildAnt(isQueen) {
    const group = new THREE.Group();
    const S = isQueen ? 2.2 : 1.0; // uniform scale factor

    const bodyMat = new THREE.MeshLambertMaterial({
      color: isQueen ? 0x990000 : 0x220800,
    });

    // 1. Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18 * S, 8, 6), bodyMat);
    head.position.z = 0.22 * S;
    head.castShadow = true;
    group.add(head);

    // 2. Thorax
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.14 * S, 8, 6), bodyMat);
    thorax.castShadow = true;
    group.add(thorax);

    // 3. Petiole (narrow connector between thorax and abdomen)
    const petiole = new THREE.Mesh(new THREE.SphereGeometry(0.07 * S, 6, 4), bodyMat);
    petiole.position.z = -0.16 * S;
    group.add(petiole);

    // 4. Abdomen
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.21 * S, 8, 6), bodyMat);
    abdomen.position.z = -0.32 * S;
    abdomen.castShadow = true;
    group.add(abdomen);

    // 5. Mandible L
    const mandGeo = new THREE.CylinderGeometry(0.012 * S, 0.007 * S, 0.13 * S, 4);
    const mandL = new THREE.Mesh(mandGeo, bodyMat);
    mandL.position.set(-0.10 * S, 0.02 * S, 0.31 * S);
    mandL.rotation.set(0.2, -0.3, 0.55);
    group.add(mandL);

    // 6. Mandible R
    const mandR = mandL.clone();
    mandR.position.x = 0.10 * S;
    mandR.rotation.set(0.2, 0.3, -0.55);
    group.add(mandR);

    // 7-12. Legs — 3 pairs (front/mid/rear), each L and R
    // Tripod gait phases: front-L + mid-R + rear-L move together, then swap
    const legZOffsets   = [0.10 * S, 0.0, -0.10 * S];
    const legPhases     = [0, Math.PI, Math.PI * 2/3, Math.PI + Math.PI * 2/3, Math.PI * 4/3, Math.PI + Math.PI * 4/3];
    const legs = [];

    legZOffsets.forEach((lz, pairIdx) => {
      [-1, 1].forEach((side, sideIdx) => {
        const phaseIdx = pairIdx * 2 + sideIdx;
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018 * S, 0.011 * S, 0.26 * S, 4),
          bodyMat
        );
        leg.position.set(side * 0.28 * S, -0.06 * S, lz);
        leg.rotation.z = side * 0.68;
        leg.rotation.x = 0.28;
        leg.userData.legPhase = legPhases[phaseIdx];
        leg.castShadow = true;
        legs.push(leg);
        group.add(leg);
      });
    });
    group.userData.legs = legs;

    // 13. Antenna L
    const antGeo = new THREE.CylinderGeometry(0.010 * S, 0.005 * S, 0.24 * S, 4);
    const antL = new THREE.Mesh(antGeo, bodyMat);
    antL.position.set(-0.10 * S, 0.11 * S, 0.29 * S);
    antL.rotation.set(-0.45, 0, 0.38);
    group.add(antL);

    // 14. Antenna R
    const antR = antL.clone();
    antR.position.x = 0.10 * S;
    antR.rotation.set(-0.45, 0, -0.38);
    group.add(antR);

    // Queen extras (crown + wings — bonus decorative parts)
    if (isQueen) {
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.38 * S, 0.45 * S, 5),
        new THREE.MeshBasicMaterial({ color: 0xffdd00 })
      );
      crown.position.set(0, 0.58 * S, -0.55 * S);
      group.add(crown);

      [-1, 1].forEach(side => {
        const wing = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9 * S, 0.45 * S),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
        );
        wing.position.set(side * 0.78 * S, 0.42 * S, 0);
        wing.rotation.z = side * 0.5;
        group.add(wing);
      });

      // Glow sphere
      group.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.7 * S, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff0044, transparent: true, opacity: 0.07 })
      ));
    }

    return group;
  };

  /* ─────────────── HP bar (canvas sprite) ─────────────── */

  function makeHpBar(isQueen) {
    const bc  = document.createElement('canvas');
    bc.width  = 64;
    bc.height = 12;
    const ctx = bc.getContext('2d');
    ctx.fillStyle = '#0f0';
    ctx.fillRect(0, 0, 64, 12);

    const tex    = new THREE.CanvasTexture(bc);
    const mat    = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(isQueen ? 1.7 : 0.72, isQueen ? 0.24 : 0.13, 1);
    sprite.position.set(0, isQueen ? 1.6 : 0.72, 0);

    return { sprite, canvas: bc, ctx, tex };
  }

  /* ─────────────── Update HP bar ─────────────── */

  ANT.updateAntBar = function (ant) {
    const pct = Math.max(0, ant.hp / ant.maxHp);
    const { ctx } = ant.hpBar;
    ctx.clearRect(0, 0, 64, 12);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 64, 12);
    ctx.fillStyle = pct > 0.5 ? '#0f0' : pct > 0.25 ? '#ff0' : '#f00';
    ctx.fillRect(0, 0, 64 * pct, 12);
    ant.hpBar.tex.needsUpdate = true;
  };

  /* ─────────────── Spawn ant ─────────────── */

  ANT.ants = [];
  ANT.pheromones = [];

  ANT.spawnAnt = function (x, y, z, isQueen) {
    const mesh   = ANT.buildAnt(isQueen);
    const hpBar  = makeHpBar(isQueen);
    mesh.add(hpBar.sprite);
    mesh.position.set(x, y, z);
    scene.add(mesh);

    const ant = {
      mesh,
      hpBar,
      isQueen,
      maxHp:       isQueen ? 300 : 15,
      hp:          isQueen ? 300 : 15,
      alive:       true,
      pos:         new THREE.Vector3(x, y, z),
      speed:       isQueen ? 1.2 : 2.6,
      dmg:         isQueen ? 12 : 5,
      attackCd:    0,
      bobT:        Math.random() * 6.28,
      // AI state
      state:       'wander',          // 'wander' | 'smell' | 'seek'
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 1 + Math.random() * 2,
      _smellTarget: null,
    };

    ANT.ants.push(ant);
    return ant;
  };

  /* ─────────────── Kill ant ─────────────── */

  ANT.killAnt = function (ant) {
    ant.alive = false;
    scene.remove(ant.mesh);
    ANT.kills = (ANT.kills || 0) + 1;

    const killsEl = document.getElementById('kills');
    if (killsEl) killsEl.textContent = ANT.kills;

    const feed = document.getElementById('kill-feed');
    if (!feed) return;

    if (ant.isQueen) {
      feed.textContent = '👑 QUEEN SLAIN!';
      ANT.gameWon = true;
      const qf = document.getElementById('queen-hp-fill');
      if (qf) qf.style.width = '0%';
      ANT.HUD.showMsg('🏆 VICTORY!\nThe Queen Ant is dead!\nYou have destroyed the colony.', 0);
    } else {
      feed.textContent = `Ant squashed! (${ANT.kills} total)`;
      setTimeout(() => {
        if (feed.textContent.includes('squashed')) feed.textContent = '';
      }, 2200);
    }
  };

  /* ─────────────── Pheromone trail helpers ─────────────── */

  let _phTimer = 0;

  function depositPheromones(dt) {
    _phTimer += dt;
    if (_phTimer < 0.5) return;
    _phTimer = 0;

    // Seeking ants leave a trail; wander ants follow it
    ANT.ants.forEach(ant => {
      if (!ant.alive || ant.state !== 'seek' || ant.isQueen) return;
      ANT.pheromones.push({ x: ant.pos.x, z: ant.pos.z, strength: 1.0, age: 0 });
    });

    // Age and cull expired markers
    for (let i = ANT.pheromones.length - 1; i >= 0; i--) {
      const ph = ANT.pheromones[i];
      ph.age += 0.5;
      ph.strength = Math.max(0, 1 - ph.age / 10);
      if (ph.strength < 0.01) ANT.pheromones.splice(i, 1);
    }

    // Cap to avoid memory growth
    if (ANT.pheromones.length > 400) ANT.pheromones.splice(0, ANT.pheromones.length - 400);
  }

  /* ─────────────── AI update ─────────────── */

  const _toPlayer  = new THREE.Vector3();
  const _smellDir  = new THREE.Vector3();
  const _trailDir  = new THREE.Vector3();

  ANT.updateAnts = function (dt) {
    if (ANT.gameOver || ANT.gameWon) return;

    const playerPos = ANT.camera.position;

    depositPheromones(dt);

    ANT.ants.forEach(ant => {
      if (!ant.alive) return;

      /* ── Bob / oscillation timer ── */
      ant.bobT += dt * 3.5;

      /* ── Per-leg sinusoidal animation ── */
      if (ant.mesh.userData.legs) {
        ant.mesh.userData.legs.forEach(leg => {
          leg.rotation.x = 0.28 + Math.sin(ant.bobT * 6 + leg.userData.legPhase) * 0.38;
        });
      }
      ant.mesh.position.y = ant.pos.y + Math.sin(ant.bobT) * 0.035;

      /* ── Determine AI state ── */
      _toPlayer.copy(playerPos).sub(ant.pos);
      _toPlayer.y = 0;
      const distToPlayer = _toPlayer.length();
      const detectRange  = ant.isQueen ? 14 : 9;

      if (distToPlayer < detectRange) {
        ant.state = 'seek';
      } else {
        // Check for food smell (weapon pickups + physics crumbs)
        let bestSmellDist = 8;
        ant._smellTarget = null;

        if (ANT.pickups) {
          ANT.pickups.forEach(p => {
            if (!p.active) return;
            const d = ant.pos.distanceTo(p.pos);
            if (d < bestSmellDist) { bestSmellDist = d; ant._smellTarget = p.pos; }
          });
        }
        if (ANT.foodBodies) {
          ANT.foodBodies.forEach(fb => {
            const d = ant.pos.distanceTo(fb.mesh.position);
            if (d < bestSmellDist) { bestSmellDist = d; ant._smellTarget = fb.mesh.position; }
          });
        }

        ant.state = ant._smellTarget ? 'smell' : 'wander';
      }

      /* ── Execute AI state ── */

      if (ant.state === 'seek') {
        // Move toward player
        if (distToPlayer > 0.05) {
          const step = (ant.speed * dt) / distToPlayer;
          ant.pos.x += _toPlayer.x * step;
          ant.pos.z += _toPlayer.z * step;
        }
        ant.mesh.position.x = ant.pos.x;
        ant.mesh.position.z = ant.pos.z;
        ant.mesh.lookAt(playerPos.x, ant.pos.y, playerPos.z);

      } else if (ant.state === 'smell') {
        // Smell-seek: move toward nearest food source
        _smellDir.copy(ant._smellTarget).sub(ant.pos);
        _smellDir.y = 0;
        const fd = _smellDir.length();
        if (fd > 0.3) {
          _smellDir.normalize();
          ant.pos.x += _smellDir.x * ant.speed * dt * 0.55;
          ant.pos.z += _smellDir.z * ant.speed * dt * 0.55;
          ant.wanderAngle = Math.atan2(_smellDir.z, _smellDir.x);
        }
        ant.mesh.position.x = ant.pos.x;
        ant.mesh.position.z = ant.pos.z;
        ant.mesh.lookAt(ant._smellTarget.x, ant.pos.y, ant._smellTarget.z);

      } else {
        // Wander + trail-follow
        // Trail-follow: find strongest nearby pheromone and nudge toward it
        let bestPh = null, bestPhStr = 0.15;
        ANT.pheromones.forEach(ph => {
          const dx = ph.x - ant.pos.x, dz = ph.z - ant.pos.z;
          const pd = Math.sqrt(dx * dx + dz * dz);
          if (pd < 5 && ph.strength > bestPhStr) { bestPhStr = ph.strength; bestPh = ph; }
        });

        if (bestPh) {
          // Trail-follow: steer toward pheromone marker
          _trailDir.set(bestPh.x - ant.pos.x, 0, bestPh.z - ant.pos.z).normalize();
          ant.pos.x += _trailDir.x * ant.speed * dt * 0.45;
          ant.pos.z += _trailDir.z * ant.speed * dt * 0.45;
          ant.wanderAngle = Math.atan2(_trailDir.z, _trailDir.x);
        } else {
          // Pure wander: slowly drift with direction changes
          ant.wanderTimer -= dt;
          if (ant.wanderTimer <= 0) {
            ant.wanderAngle += (Math.random() - 0.5) * Math.PI * 0.9;
            ant.wanderTimer = 1.5 + Math.random() * 2.5;
          }
          ant.pos.x += Math.cos(ant.wanderAngle) * ant.speed * dt * 0.32;
          ant.pos.z += Math.sin(ant.wanderAngle) * ant.speed * dt * 0.32;
        }

        ant.mesh.position.x = ant.pos.x;
        ant.mesh.position.z = ant.pos.z;
        ant.mesh.lookAt(
          ant.pos.x + Math.cos(ant.wanderAngle),
          ant.pos.y,
          ant.pos.z + Math.sin(ant.wanderAngle)
        );
      }

      /* ── Attack player when close ── */
      const attackRange = ant.isQueen ? 2.8 : 1.8;
      const dist3D = playerPos.distanceTo(ant.pos);
      if (dist3D < attackRange) {
        ant.attackCd -= dt;
        if (ant.attackCd <= 0) {
          ant.attackCd = ant.isQueen ? 0.75 : 1.2;
          ANT.player.takeDamage(ant.dmg);
        }
      }
    });

    /* ── Surface respawn ── */
    const surfaceAlive = ANT.ants.filter(a => a.alive && !a.isQueen && a.pos.y > -1).length;
    if (surfaceAlive < 8 && Math.random() < dt * 0.4) {
      const sx = (Math.random() - 0.5) * 18;
      const sz = (Math.random() - 0.5) * 10 - 2;
      ANT.spawnAnt(sx, 0.22, sz, false);
    }
  };

  /* ─────────────── Initial spawn ─────────────── */

  // 8 surface ants
  for (let i = 0; i < 8; i++) {
    ANT.spawnAnt(
      (Math.random() - 0.5) * 20,
      0.22,
      (Math.random() - 0.5) * 12 - 3,
      false
    );
  }

  // 10 tunnel ants (spread across A/B/C)
  for (let i = 0; i < 10; i++) {
    const bases = [-8, 0, 8];
    const tx = bases[i % 3] + (Math.random() - 0.5) * 2.2;
    ANT.spawnAnt(tx, -Math.random() * 7 - 1, -Math.random() * 9 - 5, false);
  }

  // Queen
  const QC    = ANT.QUEEN_CHAMBER;
  ANT.queen   = ANT.spawnAnt(QC.x, QC.y + 0.7, QC.z, true);

})();
