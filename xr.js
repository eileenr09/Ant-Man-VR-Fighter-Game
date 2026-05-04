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
