// ============================================================
//  IMPORTS
// ============================================================

import * as THREE from 'three';
import { skier, animateSkier } from './skier.js';
import {
    createTerrain, updateTerrain, setSnowTexture, makeSnowTexture,
    CHUNK_LENGTH, CHUNK_WIDTH
} from './terrain.js';
import { populateChunk, clearChunk, checkCollisions } from './obstacles.js';


// ============================================================
//  CONSTANTS
// ============================================================

const SPEED_INITIAL  = 14;
const SPEED_RAMP     = 0.4;
const LATERAL_SPEED  = 6;
const LATERAL_LIMIT  = 12;
const LEAN_ANGLE     = 0.18;
const LEAN_SPEED     = 6;
const SAFE_CHUNKS    = 2;

// Full day/night cycle duration in seconds (3 minutes)
const CYCLE_DURATION = 180;


// ============================================================
//  GAME STATE
// ============================================================

let score     = 0;
let elapsed   = 0;
let gameSpeed = SPEED_INITIAL;
let gameState = 'playing';
let lastTime  = performance.now();

const keys = { left: false, right: false };


// ============================================================
//  RENDERER, SCENE, CAMERA
// ============================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 280);

const camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.1,
    600
);
camera.position.set(0, 3, -5);
camera.lookAt(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);


// ============================================================
//  LIGHTS (dynamic -- updated every frame by the cycle)
// ============================================================

const ambientLight = new THREE.AmbientLight(0x8899bb, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.castShadow = true;

// Larger shadow map for sharper shadows
sunLight.shadow.mapSize.width  = 4096;
sunLight.shadow.mapSize.height = 4096;

// Wider frustum so shadows render further from the skier
sunLight.shadow.camera.near   = 1;
sunLight.shadow.camera.far    = 400;
sunLight.shadow.camera.left   = -70;
sunLight.shadow.camera.right  = 70;
sunLight.shadow.camera.top    = 100;
sunLight.shadow.camera.bottom = -60;

// The sun looks at this target, which follows the skier.
// This keeps the shadow frustum centered on the action
// and prevents shadows from popping in.
const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
sunLight.target = sunTarget;

scene.add(sunLight);

// Pool of PointLights reused each frame. Instead of attaching a light
// to every lit fence (expensive), we keep just 6 lights and move them
// to whichever fences are closest to the skier. The emissive lantern
// material handles the visual glow on all the others for free.
const NIGHT_LIGHT_COUNT = 6;
const nightLights = [];
for (let i = 0; i < NIGHT_LIGHT_COUNT; i++) {
    const pl = new THREE.PointLight(0xffaa44, 0, 12, 1.5);
    scene.add(pl);
    nightLights.push(pl);
}


// ============================================================
//  DAY / NIGHT CYCLE
// ============================================================
//
// The cycle runs on elapsed game time (paused on game over).
// A normalized value t (0-1) drives keyframe interpolation for:
//   - sky/fog color
//   - sun color, intensity, and position (orbits the scene)
//   - ambient color and intensity
//   - fog near/far distances (visibility drops at night)
//
// Phases (approximate):
//   0.00        night (deep dark)
//   0.10-0.20   dawn  (warm orange horizon)
//   0.20-0.50   day   (bright sky, full sun)
//   0.50-0.65   sunset (orange to red to purple)
//   0.65-0.80   dusk  (purple fading to dark)
//   0.80-1.00   night (wraps back to 0)

// Each keyframe: { t, sky, sun, sunI, amb, ambI, fogN, fogF }
// Colors stored as THREE.Color for easy lerp.
const CK = [
    { t: 0.00, sky: c(0x1a1a35), sun: c(0x445577), sunI: 0.25, amb: c(0x1a1a30), ambI: 0.25, fogN: 20, fogF: 140 },
    { t: 0.10, sky: c(0x252540), sun: c(0x556688), sunI: 0.30, amb: c(0x1e1e35), ambI: 0.28, fogN: 22, fogF: 150 },
    { t: 0.15, sky: c(0xd48a5a), sun: c(0xffaa55), sunI: 0.65, amb: c(0x886655), ambI: 0.35, fogN: 25, fogF: 180 },
    { t: 0.22, sky: c(0x87ceeb), sun: c(0xfff5e0), sunI: 1.10, amb: c(0x8899bb), ambI: 0.55, fogN: 38, fogF: 260 },
    { t: 0.35, sky: c(0x87ceeb), sun: c(0xffffff), sunI: 1.25, amb: c(0x99aacc), ambI: 0.60, fogN: 42, fogF: 290 },
    { t: 0.50, sky: c(0x87ceeb), sun: c(0xffffff), sunI: 1.20, amb: c(0x8899bb), ambI: 0.58, fogN: 40, fogF: 280 },
    { t: 0.55, sky: c(0xddaa66), sun: c(0xffcc77), sunI: 1.00, amb: c(0x887755), ambI: 0.48, fogN: 32, fogF: 220 },
    { t: 0.62, sky: c(0xee7744), sun: c(0xff5533), sunI: 0.75, amb: c(0x884433), ambI: 0.38, fogN: 22, fogF: 170 },
    { t: 0.70, sky: c(0x443355), sun: c(0x667799), sunI: 0.38, amb: c(0x2a2244), ambI: 0.30, fogN: 22, fogF: 155 },
    { t: 0.80, sky: c(0x1e1e30), sun: c(0x445577), sunI: 0.25, amb: c(0x181830), ambI: 0.25, fogN: 20, fogF: 140 },
    { t: 1.00, sky: c(0x1a1a35), sun: c(0x445577), sunI: 0.25, amb: c(0x1a1a30), ambI: 0.25, fogN: 20, fogF: 140 },
];

// Helper: create a THREE.Color from a hex int
function c(hex) { return new THREE.Color(hex); }

// Temp colors used during interpolation (avoids allocations every frame)
const tmpSky = new THREE.Color();
const tmpSun = new THREE.Color();
const tmpAmb = new THREE.Color();


// Find the two keyframes surrounding t and return the interpolated values
function sampleCycle(t) {
    // Clamp t into [0, 1)
    t = t - Math.floor(t);

    // Find the pair of keyframes that bracket t
    let a = CK[0];
    let b = CK[1];
    for (let i = 0; i < CK.length - 1; i++) {
        if (t >= CK[i].t && t < CK[i + 1].t) {
            a = CK[i];
            b = CK[i + 1];
            break;
        }
    }

    // Local interpolation factor within this segment
    const segLen = b.t - a.t;
    const f = segLen > 0 ? (t - a.t) / segLen : 0;

    return {
        sky:  tmpSky.copy(a.sky).lerp(b.sky, f),
        sun:  tmpSun.copy(a.sun).lerp(b.sun, f),
        sunI: a.sunI + (b.sunI - a.sunI) * f,
        amb:  tmpAmb.copy(a.amb).lerp(b.amb, f),
        ambI: a.ambI + (b.ambI - a.ambI) * f,
        fogN: a.fogN + (b.fogN - a.fogN) * f,
        fogF: a.fogF + (b.fogF - a.fogF) * f,
    };
}


// Apply the cycle state to the scene lights, fog, and background.
// Also positions the sun in an arc across the sky.
function updateCycle(t) {
    const s = sampleCycle(t);

    // Sky and fog color
    scene.background.copy(s.sky);
    scene.fog.color.copy(s.sky);
    scene.fog.near = s.fogN;
    scene.fog.far  = s.fogF;

    // Ambient
    ambientLight.color.copy(s.amb);
    ambientLight.intensity = s.ambI;

    // Sun color and intensity
    sunLight.color.copy(s.sun);
    sunLight.intensity = s.sunI;

    // Sun orbit: the sun peaks at t=0.35 (midday) and dips below
    // the horizon at t=0.85 (midnight). Using cosine centered on
    // t=0.35 so cos(0) = 1 = highest point.
    const sunAngle = (t - 0.35) * Math.PI * 2;
    const sunDist  = 80;
    const sunBaseY = 5;
    const sunAmp   = 65;   // how high above / below base the sun swings

    sunLight.position.set(
        Math.sin(sunAngle) * sunDist * 0.4,           // lateral drift
        sunBaseY + Math.cos(sunAngle) * sunAmp,        // arc: high at midday, low at night
        -Math.abs(Math.sin(sunAngle)) * sunDist * 0.5  // always cast forward along the slope
    );

    // Offset the sun position relative to the skier so shadows follow the action
    sunLight.position.x += sunTarget.position.x;
    sunLight.position.z += sunTarget.position.z;
}


// ============================================================
//  TERRAIN & TEXTURES
// ============================================================

scene.add(skier);

const chunks = createTerrain(scene);

for (let i = SAFE_CHUNKS; i < chunks.length; i++) {
    populateChunk(chunks[i], CHUNK_LENGTH, CHUNK_WIDTH, 0, false);
}

const textures = [
    makeSnowTexture(0),
    makeSnowTexture(1),
    makeSnowTexture(2),
];

let texIndex = 0;
setSnowTexture(chunks, textures[0]);


// ============================================================
//  HUD & GAME OVER OVERLAY
// ============================================================

const hud = document.createElement('div');
hud.style.cssText =
    'position:fixed; top:16px; left:16px; color:#fff; font:bold 18px monospace;' +
    'text-shadow:0 1px 3px rgba(0,0,0,0.6); pointer-events:none; z-index:10;' +
    'line-height:1.6;';
document.body.appendChild(hud);

const overlay = document.createElement('div');
overlay.style.cssText =
    'position:fixed; inset:0; display:flex; flex-direction:column;' +
    'align-items:center; justify-content:center; background:rgba(0,0,0,0.55);' +
    'color:#fff; font-family:sans-serif; z-index:20; pointer-events:none;' +
    'opacity:0; transition:opacity 0.4s;';
overlay.innerHTML =
    '<div style="font-size:48px; font-weight:bold; margin-bottom:12px;">GAME OVER</div>' +
    '<div id="go-score" style="font-size:22px; margin-bottom:24px;"></div>' +
    '<div style="font-size:16px; opacity:0.8;">Press R to restart</div>';
document.body.appendChild(overlay);


// ============================================================
//  INPUT HANDLING
// ============================================================

document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft')  keys.left  = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'KeyT') {
        texIndex = (texIndex + 1) % textures.length;
        setSnowTexture(chunks, textures[texIndex]);
    }
    if (e.code === 'KeyR' && gameState === 'gameover') restartGame();
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft')  keys.left  = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});


// ============================================================
//  GAME LOGIC HELPERS
// ============================================================

// Returns the current position in the day/night cycle (0-1)
function getCycleT() {
    return ((elapsed / CYCLE_DURATION) + 0.12) % 1.0;
}

// Lit fences start spawning at sunset (t > 0.58) so they are
// already on the slope by the time full darkness arrives.
function isNightTime() {
    const t = getCycleT();
    return t > 0.58 || t < 0.15;
}

function onChunkRecycle(chunk) {
    clearChunk(chunk);
    populateChunk(chunk, CHUNK_LENGTH, CHUNK_WIDTH, score, isNightTime());
}


function restartGame() {
    skier.position.set(0, 0, 0);
    skier.rotation.z = 0;

    // Reset state BEFORE repopulating so chunks use score = 0
    elapsed   = 0;
    score     = 0;
    gameSpeed = SPEED_INITIAL;
    lastTime  = performance.now();

    for (let i = 0; i < chunks.length; i++) {
        clearChunk(chunks[i]);
        chunks[i].position.set(0, 0, i * CHUNK_LENGTH);
        if (i >= SAFE_CHUNKS) {
            populateChunk(chunks[i], CHUNK_LENGTH, CHUNK_WIDTH, score, isNightTime());
        }
    }

    camera.position.set(0, 3, -5);
    gameState = 'playing';
    overlay.style.opacity = '0';
}


// ============================================================
//  ANIMATION LOOP
// ============================================================

function animate(now) {
    requestAnimationFrame(animate);

    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // -- Game update (only while playing) --
    if (gameState === 'playing') {
        elapsed  += delta;
        gameSpeed = SPEED_INITIAL + elapsed * SPEED_RAMP;
        score    += gameSpeed * delta;

        updateTerrain(chunks, gameSpeed, delta, onChunkRecycle);

        // Lateral movement
        if (keys.left)  skier.position.x += LATERAL_SPEED * delta;
        if (keys.right) skier.position.x -= LATERAL_SPEED * delta;
        skier.position.x = Math.max(-LATERAL_LIMIT,
                           Math.min( LATERAL_LIMIT, skier.position.x));

        // Lean into turns
        let targetLean = 0;
        if (keys.left)  targetLean =  LEAN_ANGLE;
        if (keys.right) targetLean = -LEAN_ANGLE;
        skier.rotation.z += (targetLean - skier.rotation.z) * LEAN_SPEED * delta;

        animateSkier(elapsed);

        // Collision
        if (checkCollisions(skier.position, chunks)) {
            gameState = 'gameover';
            document.getElementById('go-score').textContent =
                'Score: ' + Math.floor(score) + ' m';
            overlay.style.opacity = '1';
        }

        // HUD
        hud.innerHTML =
            'Score: ' + Math.floor(score) + ' m<br>' +
            'Speed: ' + gameSpeed.toFixed(1) + ' m/s';
    }

    // -- Day/night cycle (always ticks, even on game over) --
    const cycleT = getCycleT();

    // Sun target follows the skier so the shadow frustum stays centered
    sunTarget.position.set(skier.position.x, 0, skier.position.z);

    updateCycle(cycleT);

    // Night lights follow the skier. Their intensity is the inverse of
    // the sun: when the sun drops below 0.5, they start fading in.
    const nightFactor = Math.max(0, 1.0 - sunLight.intensity / 0.5);

    if (nightFactor > 0) {
        // Collect world positions of all lit fences across all chunks
        const litPositions = [];
        for (const chunk of chunks) {
            const obs = chunk.userData.obstacles || [];
            for (const ob of obs) {
                if (ob.mesh.userData.isLitFence) {
                    const wx = chunk.position.x + ob.localX;
                    const wz = chunk.position.z + ob.localZ;
                    const dx = skier.position.x - wx;
                    const dz = skier.position.z - wz;
                    litPositions.push({ x: wx, z: wz, dist: dx * dx + dz * dz });
                }
            }
        }

        // Sort by distance to skier, closest first
        litPositions.sort((a, b) => a.dist - b.dist);

        // Assign pool lights to the nearest lit fences
        for (let i = 0; i < NIGHT_LIGHT_COUNT; i++) {
            if (i < litPositions.length) {
                nightLights[i].position.set(litPositions[i].x, 1.1, litPositions[i].z);
                nightLights[i].intensity = nightFactor * 2.2;
            } else {
                // No fence to assign, turn off this pool light
                nightLights[i].intensity = 0;
            }
        }
    } else {
        // Daytime: all pool lights off
        for (let i = 0; i < NIGHT_LIGHT_COUNT; i++) {
            nightLights[i].intensity = 0;
        }
    }

    // -- Dynamic camera --
    const camTargetX = skier.position.x * 0.85;
    camera.position.x += (camTargetX - camera.position.x) * 0.12;

    const speedFactor = (gameSpeed - SPEED_INITIAL) / 30;
    const camTargetY  = 3.0 + speedFactor * 1.8;
    camera.position.y += (camTargetY - camera.position.y) * 0.04;

    const camTargetZ  = -5.0 - speedFactor * 2.5;
    camera.position.z += (camTargetZ - camera.position.z) * 0.04;

    camera.lookAt(skier.position.x * 0.6, 0.8, 4);

    renderer.render(scene, camera);
}

requestAnimationFrame(animate);