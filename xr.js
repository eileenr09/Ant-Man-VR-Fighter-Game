/**
 * xr.js — WebXR session setup, XRFrame pose loop, controller wiring,
 *          floor-raycast teleportation reticle, and chamber audio
 *
 * Exposes:
 *   ANT.xrDolly         — Object3D player rig (camera + controllers attached)
 *   ANT.xrControllers   — [right, left] controller Objects
 *   ANT.updateXR(dt)    — per-frame XR update (called from main loop)
 *   ANT.playChamberAudio() — play descending eerie tones
 */

(function () {
  'use strict';

  const ANT      = window.ANT;
  const scene    = ANT.scene;
  const camera   = ANT.camera;
  const renderer = ANT.renderer;

  /* ── Enable WebXR on the renderer ── */
  renderer.xr.enabled = true;

  /* ── XR Dolly — parent rig that holds camera + controllers ── */
  // Moving the dolly teleports the player; camera tracks head in room-scale.
  const dolly = new THREE.Group();
  dolly.position.set(0, 0, 2); // start just inside the surface area
  scene.add(dolly);

  // Re-parent camera from scene root into the dolly
  scene.remove(camera);
  dolly.add(camera);

  ANT.xrDolly = dolly;

  /* ── XR Controllers ── */
  // Index 0 = right (dominant): trigger → attack, grip → grab food
  // Index 1 = left:             thumbstick → aim teleport + press → teleport
  const ctrl = [
    renderer.xr.getController(0),
    renderer.xr.getController(1),
  ];
  const grip = [
    renderer.xr.getControllerGrip(0),
    renderer.xr.getControllerGrip(1),
  ];

  ctrl.forEach(c => dolly.add(c));
  grip.forEach(g => dolly.add(g));

  ANT.xrControllers = ctrl;

  /* ── Controller ray visualiser ── */
  const rayGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const rayMat = new THREE.LineBasicMaterial({
    color: 0x88ccff, transparent: true, opacity: 0.45,
  });
  let _leftRay = null;
  ctrl.forEach((c, i) => {
    const line = new THREE.Line(rayGeo.clone(), rayMat.clone());
    line.scale.z = 4;
    c.add(line);
    if (i === 1) _leftRay = line; // track left controller ray to hide during arc aiming
  });

  /* ── Teleport reticle (ring on floor) ── */
  const reticleGeo = new THREE.RingGeometry(0.18, 0.26, 28);
  reticleGeo.rotateX(-Math.PI / 2);
  const reticle = new THREE.Mesh(
    reticleGeo,
    new THREE.MeshBasicMaterial({ color: 0x00ccff, side: THREE.DoubleSide, transparent: true, opacity: 0.78 })
  );
  reticle.visible = false;
  scene.add(reticle);

  /* ── Teleport arc line (parabolic trajectory visualiser) ── */
  const ARC_STEPS    = 30;
  const arcPositions = new Float32Array(ARC_STEPS * 3);
  const arcGeo       = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
  const arcLine = new THREE.Line(
    arcGeo,
    new THREE.LineBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.8, linewidth: 2 })
  );
  arcLine.frustumCulled = false;
  arcLine.visible = false;
  scene.add(arcLine);

  const _tpRaycaster = new THREE.Raycaster();
  const _tempMatrix  = new THREE.Matrix4();
  const _camWP       = new THREE.Vector3();

  /* Pre-allocated scratch vectors for arc computation — avoids per-frame GC */
  const _arcV0 = new THREE.Vector3();
  const _arcP  = new THREE.Vector3();
  const _arcQ  = new THREE.Vector3();
  const _arcSD = new THREE.Vector3();

  let _teleportTarget  = null;
  let _teleportAiming  = false;
  let _snapCooldown    = false;

  /* ── Right trigger → attack ── */
  ctrl[0].addEventListener('selectstart', () => {
    if (typeof ANT.doAttack === 'function') ANT.doAttack();
  });

  /* ── Right grip → grab nearest food crumb ── */
  let _grabbedFb   = null;

  ctrl[0].addEventListener('squeezestart', () => {
    if (!ANT.foodBodies || ANT.foodBodies.length === 0) return;

    let best = null, bestD = 0.45;
    ANT.foodBodies.forEach(fb => {
      const d = ctrl[0].position.distanceTo(fb.mesh.position);
      if (d < bestD) { bestD = d; best = fb; }
    });

    if (!best) return;

    // Freeze body (mass = 0 → kinematic)
    best.body.mass = 0;
    best.body.updateMassProperties();
    best.body.velocity.set(0, 0, 0);
    best.body.angularVelocity.set(0, 0, 0);

    _grabbedFb     = best;
    ANT.grabbedFood = best;
  });

  ctrl[0].addEventListener('squeezeend', () => {
    if (!_grabbedFb) return;

    // Restore mass → dynamic; inherit controller throw velocity
    _grabbedFb.body.mass = 0.1;
    _grabbedFb.body.updateMassProperties();

    const vel = ctrl[0].userData.velocity;
    if (vel) {
      _grabbedFb.body.velocity.set(vel.x * 5, vel.y * 5, vel.z * 5);
    }

    _grabbedFb     = null;
    ANT.grabbedFood = null;
  });

  /* ── Chamber audio (Web Audio API) ── */
  const _audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  ANT.playChamberAudio = function () {
    const notes = [220, 185, 155, 130, 110];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        const osc  = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.type              = 'sine';
        osc.frequency.value   = freq;
        gain.gain.setValueAtTime(0.16, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 1.8);
        osc.start(_audioCtx.currentTime);
        osc.stop(_audioCtx.currentTime + 1.8);
      }, i * 550);
    });
  };

  /* ── Parabolic teleport arc helper ── */
  // Simulates a ballistic trajectory from the left controller, raycasts each
  // segment against all registered floor meshes, and returns the first hit point.
  // Updates arcLine geometry in place so the caller just needs to toggle visibility.
  function _computeTeleportArc() {
    ctrl[1].getWorldPosition(_arcP);
    _tempMatrix.identity().extractRotation(ctrl[1].matrixWorld);
    _arcV0.set(0, 0, -1).applyMatrix4(_tempMatrix).multiplyScalar(6);

    const floors  = ANT.teleportFloors || (ANT.teleportFloor ? [ANT.teleportFloor] : []);
    const DT      = 0.08;
    const GRAVITY = 12;
    let   hitPt   = null;
    let   nPts    = 0;

    for (let i = 0; i < ARC_STEPS - 1; i++) {
      arcPositions[i * 3]     = _arcP.x;
      arcPositions[i * 3 + 1] = _arcP.y;
      arcPositions[i * 3 + 2] = _arcP.z;
      nPts = i + 1;

      _arcQ.set(
        _arcP.x + _arcV0.x * DT,
        _arcP.y + _arcV0.y * DT,
        _arcP.z + _arcV0.z * DT
      );
      _arcSD.subVectors(_arcQ, _arcP);
      const segLen = _arcSD.length();
      if (segLen < 0.0001) break;
      _arcSD.divideScalar(segLen);

      _tpRaycaster.set(_arcP, _arcSD);
      _tpRaycaster.far = segLen + 0.05;
      const hits = _tpRaycaster.intersectObjects(floors, false);

      if (hits.length > 0) {
        hitPt = hits[0].point.clone();
        arcPositions[nPts * 3]     = hitPt.x;
        arcPositions[nPts * 3 + 1] = hitPt.y;
        arcPositions[nPts * 3 + 2] = hitPt.z;
        nPts++;
        break;
      }

      _arcP.copy(_arcQ);
      _arcV0.y -= GRAVITY * DT;
      if (_arcP.y < -22) break;
    }

    arcGeo.setDrawRange(0, nPts);
    arcGeo.attributes.position.needsUpdate = true;
    return hitPt;
  }

  /* ── Per-frame XR update — called from main loop ── */
  ANT.updateXR = function (dt) {
    const session = renderer.xr.getSession();

    if (session) {
      /* Left thumbstick — parabolic arc teleport aim + commit */
      session.inputSources.forEach(src => {
        if (!src.gamepad || src.handedness !== 'left') return;

        const axes   = src.gamepad.axes; // [0]=touchpad X, [1]=touchpad Y, [2]=stick X, [3]=stick Y
        const stickX = axes[2] !== undefined ? axes[2] : (axes[0] || 0);
        const stickY = axes[3] !== undefined ? axes[3] : (axes[1] || 0);
        const mag    = Math.sqrt(stickX * stickX + stickY * stickY);

        if (mag > 0.5) {
          _teleportAiming = true;
          if (_leftRay) _leftRay.visible = false;

          _teleportTarget = _computeTeleportArc();
          arcLine.visible = true;
          if (_teleportTarget) {
            reticle.position.set(_teleportTarget.x, _teleportTarget.y + 0.02, _teleportTarget.z);
            reticle.visible = true;
          } else {
            reticle.visible = false;
          }

        } else if (_teleportAiming && mag < 0.25) {
          // Thumbstick returned to centre — execute teleport
          _teleportAiming = false;
          reticle.visible = false;
          arcLine.visible = false;
          if (_leftRay) _leftRay.visible = true;

          if (_teleportTarget) {
            // Move dolly so player ends up at target (compensate for camera XZ offset within dolly)
            camera.getWorldPosition(_camWP);
            dolly.position.x += _teleportTarget.x - _camWP.x;
            dolly.position.z += _teleportTarget.z - _camWP.z;
            dolly.position.y  = _teleportTarget.y; // floor Y from raycast hit
            _teleportTarget = null;
          }
        }
      });

      /* Right thumbstick — snap rotation (30° per flick, debounced) */
      session.inputSources.forEach(src => {
        if (!src.gamepad || src.handedness !== 'right') return;
        const axes   = src.gamepad.axes;
        const stickX = axes[2] !== undefined ? axes[2] : (axes[0] || 0);

        if (!_snapCooldown && Math.abs(stickX) > 0.6) {
          dolly.rotation.y += stickX > 0 ? -Math.PI / 6 : Math.PI / 6;
          _snapCooldown = true;
        }
        if (Math.abs(stickX) < 0.3) _snapCooldown = false;
      });
    }

    /* Sync grabbed crumb to right controller world position */
    if (_grabbedFb) {
      const wp = new THREE.Vector3();
      ctrl[0].getWorldPosition(wp);
      _grabbedFb.body.position.set(wp.x, wp.y, wp.z);
      _grabbedFb.mesh.position.copy(wp);
    }

    /* Track controller velocity for throw physics */
    ctrl.forEach(c => {
      if (!c.userData.prevPos) c.userData.prevPos = new THREE.Vector3();
      if (!c.userData.velocity) c.userData.velocity = new THREE.Vector3();
      c.userData.velocity
        .subVectors(c.position, c.userData.prevPos)
        .divideScalar(Math.max(dt, 0.001));
      c.userData.prevPos.copy(c.position);
    });
  };

  /* ── VR entry button ── */
  const vrBtn   = document.getElementById('vr-btn');
  const noXrMsg = document.getElementById('no-xr-msg');

  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-vr').then(supported => {
      if (!supported) {
        if (vrBtn)   vrBtn.style.display   = 'none';
        if (noXrMsg) noXrMsg.style.display = 'block';
      }
    }).catch(() => {
      if (vrBtn)   vrBtn.style.display   = 'none';
      if (noXrMsg) noXrMsg.style.display = 'block';
    });

    if (vrBtn) {
      vrBtn.addEventListener('click', async () => {
        try {
          const session = await navigator.xr.requestSession('immersive-vr', {
            requiredFeatures: ['local-floor'],
            optionalFeatures: ['bounded-floor', 'hand-tracking'],
          });
          renderer.xr.setSession(session);
          vrBtn.textContent = '◈ EXIT VR';
          // Resume audio (browsers gate AudioContext on user gesture)
          if (_audioCtx.state === 'suspended') _audioCtx.resume();

          session.addEventListener('end', () => {
            vrBtn.textContent = '◈ ENTER VR';
            arcLine.visible   = false;
            reticle.visible   = false;
            _teleportAiming   = false;
            if (_leftRay) _leftRay.visible = true;
          });
        } catch (err) {
          console.warn('XR session failed:', err);
          if (noXrMsg) {
            noXrMsg.textContent  = 'VR failed: ' + err.message;
            noXrMsg.style.display = 'block';
          }
        }
      });
    }
  } else {
    if (vrBtn)   vrBtn.style.display   = 'none';
    if (noXrMsg) {
      noXrMsg.textContent  = 'Desktop mode — WebXR not supported in this browser';
      noXrMsg.style.display = 'block';
    }
  }

})();
