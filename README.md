# Ant Colony VR

A browser-based VR ant colony experience. Descend through organic dirt tunnels, grab food crumbs, and destroy the Queen.
Built with Three.js r128 + Cannon.js physics + WebXR.

---

## How to Run

WebXR requires HTTPS or localhost. You cannot open `vr.html` directly as a file.

```bash
# Option A — Python (no install needed)
python -m http.server 8080
# open: http://localhost:8080/vr.html

# Option B — Node
npx serve .
# open: http://localhost:3000/vr.html
```

### VR headset (Quest, etc.)

WebXR over a network requires HTTPS. Use a tunnel:

```bash
# serve locally first, then in a second terminal:
npx ngrok http 8080
# open the https://....ngrok.io/vr.html URL in your headset browser
```

The "◈ ENTER VR" button appears if `navigator.xr` reports `immersive-vr` as supported.
On desktop without a headset the button hides itself and the game runs in mouse + keyboard mode.

---

## Controls

### Desktop

| Input | Action |
|---|---|
| Click | Lock mouse / Attack |
| W A S D | Move |
| Mouse | Look |
| E | Pick up weapon |
| Space | Jump |

### VR (controllers)

| Input | Action |
|---|---|
| Right trigger | Attack |
| Right grip (hold) | Grab nearest food crumb |
| Right grip (release) | Drop / throw crumb |
| Left thumbstick (tilt) | Aim teleport — cyan ring reticle appears on floor |
| Left thumbstick (release) | Teleport to reticle |

---

## Weapons

| Weapon | Damage | Range | Ammo | Swing time |
|---|---|---|---|---|
| Magnifying Glass | 15 | 3.5 m | ∞ | 0.55 s |
| Bug Spray | 8 | 6 m | 30 | 0.18 s |
| Boot | 28 | 2 m | ∞ | 0.85 s |
| Flamethrower | 12 | 5 m | 20 | 0.14 s |
| Tweezers | 42 | 1.8 m | ∞ | 1.05 s |

---

## File Structure

```
vr.html        Entry point — loads all modules, VR button, HUD markup
world.js       Scene, lighting, tunnels, Queen's Chamber, glow blobs, dirt bumps
ants.js        buildAnt() geometry, HP bars, AI (wander / smell-seek / trail-follow / seek)
weapons.js     Weapon definitions, pickup orbs, pistol hand model, attack raycaster
player.js      Desktop movement, gravity/jump, zone detection (XR-aware)
hud.js         All DOM/HUD updates
physics.js     Cannon.js world, food-crumb rigid bodies, grab/drop mass toggle
xr.js          WebXR session, XR dolly rig, controller wiring, teleportation, chamber audio
main.js        setAnimationLoop game loop — calls all update functions + renderer.render
index.html     Original standalone desktop-only version (unmodified)
README.md
```

---

## Module Details

### vr.html
- Loads Three.js r128 and Cannon.js from CDN, then all 7 modules in dependency order
- Contains every DOM element ID that `hud.js`, `player.js`, and `ants.js` reference (`php`, `pbar-fill`, `weapon-icon`, `queen-hp-fill`, `zone`, `kills`, etc.)
- "◈ ENTER VR" button; replaced by a desktop-mode notice when WebXR is unavailable

### world.js
- Surface ground plane, boulders, three entry tunnels (A / B / C), Queen's Chamber at `y = -12`
- `ANT.teleportFloor` — the ground plane mesh exposed for XR floor raycasting
- **Glow blobs** — 12 `MeshBasicMaterial` spheres (radius 0.14) each paired with a `PointLight`, placed along all three tunnels and inside the Queen's Chamber
- **Dirt bumps** — 50 surface + 30 tunnel-floor flattened `SphereGeometry` lumps (`scale.y ≈ 0.25`) for organic ground texture
- Fog (`THREE.Fog`), ambient + directional + point lights, egg decorations, `ANT.queenLight` pulsing red

### ants.js
- **`ANT.buildAnt(isQueen)`** — returns a 14-part `THREE.Group`:
  - Parts: head, thorax, petiole, abdomen, mandible-L, mandible-R, 6 legs (3 pairs), antenna-L, antenna-R
  - Queen additions: crown cone, two semi-transparent wings, glow sphere
  - Each leg mesh stores `userData.legPhase` (tripod-gait offsets: 0, π, 2π/3, π+2π/3, 4π/3, π+4π/3)
- **Sinusoidal leg animation** — per-frame `leg.rotation.x = 0.28 + Math.sin(bobT·6 + legPhase) * 0.38`
- **AI states** — each ant independently runs one of:
  - `wander` — drifts with slow random heading changes (1.5–4 s between turns)
  - `smell` — steers toward the nearest weapon pickup or physics crumb within 8 units
  - `trail-follow` — inside `wander`, steers toward the strongest nearby pheromone marker
  - `seek` — moves directly at the player when within detection range (9 m workers / 14 m queen)
- **Pheromone trail** — `ANT.pheromones[]` array of `{x, z, strength, age}` markers; seeking ants deposit one every 0.5 s; markers decay to zero over 10 s and are culled; capped at 400 entries

### player.js
- Zone detection calls `camera.getWorldPosition()` and reads `ANT.xrDolly.position.y` when present, so it works correctly whether the camera is at scene root (desktop) or parented inside the XR dolly (VR)
- Keyboard movement and gravity are skipped when `renderer.xr.isPresenting` — VR locomotion is handled by the XR dolly in `xr.js`
- Calls `ANT.playChamberAudio()` on entering the Queen's Chamber zone

### physics.js
- Creates a `CANNON.World` with `gravity (0, -9.8, 0)`, a static floor plane body, and `NaiveBroadphase`
- Spawns 7 food-crumb pairs: each is a `CANNON.Body` (sphere shape, mass 0.1, linear/angular damping) synced to a `THREE.Mesh`
- `ANT.updatePhysics(dt)` steps the world at 60 Hz fixed timestep and copies body position/quaternion to each mesh, skipping any crumb currently held (`ANT.grabbedFood`)
- `ANT.foodBodies` array is shared with `xr.js` for grab detection and with `ants.js` for smell-seek targeting

### xr.js
- `renderer.xr.enabled = true`; camera re-parented from scene root into `ANT.xrDolly` (a `THREE.Group`)
- `renderer.xr.getController(0/1)` and `getControllerGrip(0/1)` added to dolly; each controller gets a line ray visualiser
- **Right trigger** (`selectstart`) → `ANT.doAttack()`
- **Right grip** (`squeezestart`) → finds nearest crumb within 0.45 m, sets `body.mass = 0` (kinematic hold); (`squeezeend`) → restores `mass = 0.1`, applies throw velocity from tracked controller delta
- **Left thumbstick** (axes 2 / 3, mag > 0.5) → raycasts from left controller onto `ANT.teleportFloor`; shows cyan ring reticle at hit point; when thumbstick returns to centre → moves dolly to target XZ, sets dolly Y to floor level
- **`ANT.playChamberAudio()`** — plays 5 descending sine tones (220 → 110 Hz, 550 ms apart, 1.8 s each) via `AudioContext`
- VR session opened with `requiredFeatures: ['local-floor']`, `optionalFeatures: ['bounded-floor', 'hand-tracking']`

### main.js
- `renderer.setAnimationLoop(fn)` replaces `requestAnimationFrame` — this is the mandatory WebXR render loop hook; Three.js passes the XRFrame to the renderer automatically each tick
- Per-frame call order: `player.update` → `updateAnts` → `updatePistol` → `updateXR` → `updatePhysics` → `animatePickups` → `syncQueenHud` → `HUD.tick` → `renderer.render`

---

## Browser / Device Support

| Environment | Status |
|---|---|
| Chrome 90+ desktop | Mouse + keyboard mode |
| Firefox 88+ desktop | Mouse + keyboard mode |
| Meta Quest Browser | Full VR (immersive-vr) |
| Chrome on Android + cardboard | May work with WebXR polyfill |
| Safari | Desktop only — no WebXR |
| Mobile without headset | Not recommended |

---

## Extending

### Add a weapon
In `weapons.js`, push to `ANT.WEAPONS` and add a spawn entry to `SPAWN_POSITIONS`:
```js
ANT.WEAPONS.push({ name: 'Rolled Newspaper', icon: '📰', dmg: 20, range: 2.5, color: 0xddcc88, ammo: Infinity, swingTime: 0.7, desc: 'Old reliable.' });
```

### Add an enemy type
```js
const a = ANT.spawnAnt(x, y, z, false);
a.maxHp = 60;
a.hp    = 60;
a.speed = 3.5;
a.dmg   = 10;
ANT.updateAntBar(a);
```

### Add a glow blob
In `world.js` inside the `glowBlobData` array:
```js
[x, y, z, 0x00ffcc, 0.8]   // [position, hex color, light intensity]
```

### Extend the tunnel system
In `world.js`, add another entry to `TUNNEL_CONFIGS` with an `x`, `z`, and `id`. The loop builds floor slabs, walls, ceiling, and glow lights automatically for `SECTIONS` depth levels.

---

MIT License
