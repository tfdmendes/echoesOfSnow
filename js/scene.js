/*
Author: Tiago Mendes 119378         
        OpenAI ChatGPT 5.5 Thinking 

This module is the main scene and game controller for Echoes of Snow:
- creates the Three.js scene, camera, renderer, lights, fog, sun/moon visuals,
  terrain chunks, scenery, avalanche, particles, HUD, menu, and overlays;
- manages the main game states: menu, intro, playing, falling, and game over;
- handles player input, camera modes, shop preview rotation, score, coins,
  speed control, crashes, edge falls, avalanche behaviour, wind, blizzard,
  day/night cycle, and speed-line effects;
- runs the main animation loop and coordinates updates between the different
  gameplay modules.

AI assistance: used mostly to help structure the main loop, separate responsibilities,
and reason about some visual/gameplay systems such as camera smoothing, day/night
interpolation, crash state transitions, and environmental effects.

Manual work:
The gameplay rules, constants, module integration, balancing, visual tuning, controls,
menu behaviour, collision responses, and final testing were designed and adjusted
manually for Echoes of Snow.
*/



import * as THREE from 'three';
import {
    skier, animateSkier,
    getSkiTrailContacts,
    poseSkierForCrash, releaseSkierEquipment,
    resetSkierEquipment, resetSkierPose,
    updateReleasedEquipment,
    applySkierTuckPose, applySkierSnowplowPose,
    animateSkierIdle,
    setSkierAppearance,
} from './skier.js';
import { loadShopSave, getEquippedAppearance } from './shop.js';
import {
    createTerrain, updateTerrain,
    CHUNK_LENGTH, CHUNK_WIDTH, PLAY_HALF_X, SLOPE_TILT
} from './terrain.js';
import { createSnowTrails } from './snow-trails.js';
import {
    populateChunk, clearChunk,
    lanternMat, lamppostBulbMat,
    updateFireflies,
    getBlizzardEmitter, updateBlizzard,
    getWindStreakEmitter, spawnWindStreak, updateWindStreaks,
    resetBlizzard
} from './obstacles.js';
import { checkSkierCollision } from './collision.js';
import { createScenery, updateScenery } from './scenery.js';
import { createAvalanche, updateAvalanche, FRONT_DISTANCE } from './avalanche.js';
import {
    getBiomeForNextChunk, resetBiomeProgression, getBiome,
    BIOME_BASE, BIOME_BLIZZARD
} from './biomes.js';
import { createMenu } from './menu.js';
import {
    loadSave as loadCoinSave,
    updateCoins, checkCoinPickup,
    getWallet, getRunCoins,
    resetRunCoins, commitRunToWallet,
    spend,
} from './coins.js';
import {
    updateGameAudio, playCoinPickup, playUiClick
} from './audio.js';

loadCoinSave();
loadShopSave();

function applyEquippedAppearance() {
    setSkierAppearance(getEquippedAppearance());
}
applyEquippedAppearance();


// ============================================================
//  CONSTANTS
// ============================================================

const SPEED_INITIAL  = 14;
const SPEED_RAMP     = 0.4;
const LATERAL_SPEED  = 6;
const LEAN_ANGLE     = 0.32;
const LEAN_SPEED     = 8;
const SAFE_CHUNKS    = 2;

// Edge-fall physics (boundary slip)
const FALL_GRAVITY      = 22;
const FALL_LATERAL_PUSH = 9;
const FALL_SPIN_SPEED   = 2.8;
const FALL_DURATION     = 1.6;

// Obstacle crash kinematics: short slide/tumble using the contact normal
const CRASH_GRAVITY      = 17;
const CRASH_LAUNCH_UP    = 1.1;
const CRASH_SIDE_PUSH    = 4.2;
const CRASH_FORWARD_BASE = 1.5;
const CRASH_FORWARD_SCALE = 0.42;
const CRASH_FORWARD_MAX  = 14.5;
const CRASH_NORMAL_Z_PUSH = 1.2;
const CRASH_FORWARD_PITCH = 0.10;
const CRASH_SIDE_ROLL    = 1.48;
const CRASH_TWIST        = 0.12;
const CRASH_DRAG         = 3.0;
const CRASH_SPEED_DECAY  = 2.4;
const CRASH_DURATION     = 1.45;
const CRASH_GROUND_Y     = 0.05;
const CRASH_MIN_BODY_Y   = 0.03;

// Day/night cycle length (seconds)
const CYCLE_DURATION = 130;

const BLIZZARD_BLEND_RATE = 1.4;
let blizzardFactor = 0;
const tmpBlizzardColor = new THREE.Color();

const windGust = {
    mode: 'calm',      // 'calm' | 'telegraph' | 'gust'
    timer: 0,          // seconds elapsed in the current mode
    duration: 1.5,     
    direction: 1,      // +1 or -1, sign of the lateral push
    peak: 0,           // peak |force| sampled from biome.windPeakForce
};


let windStreakSpawnTimer = 0;
const WIND_STREAK_BURST_ON_START = 10;

function randInRange(min, max) {
    return min + Math.random() * (max - min);
}

// ---- Speed control: tuck (W) and snowplow (S) ----
const BOOST_ACCEL_INITIAL = 1.0;    // m/s^2 on first contact
const BOOST_ACCEL_PEAK    = 4.0;    // m/s^2 once the hold ramp is full
const BOOST_RAMP_TIME     = 1.5;    // seconds to reach the peak rate
const LATERAL_W_PENALTY   = 0.65;   // full boost cuts lateral speed by this fraction
const BRAKE_FACTOR      = 0.50;     // full S cuts effective speed by this fraction
const BRAKE_DECAY_RATE  = 6.0;      // m/s of bonusSpeed lost per second of full braking
const SPEED_FLOOR       = SPEED_INITIAL * 0.5;
const INPUT_SMOOTHING   = 6.0;      // exponential smoothing for boost/brake amounts

// ---- Avalanche gap: spring anchored at GAP_DEFAULT ----
const GAP_DEFAULT      = FRONT_DISTANCE;
const GAP_MAX          = 28.0;
const GAP_DEATH        = 2.0;             // crossing this triggers the avalanche fall
const GAP_BOOST_RATE   = 10.0;
const GAP_BRAKE_RATE   = 10.0;
const GAP_PULL_FACTOR  = 0.6;             // restoring force per metre of displacement

// ---- Avalanche fall (death by being overrun) ----
const AVALANCHE_FALL_DURATION   = 1.4;
const AVALANCHE_FALL_PUSH       = 6.0;
const AVALANCHE_FALL_DROP       = 9.0;
const AVALANCHE_FALL_PITCH      = 1.1;


// ---- Speed lines (2D canvas overlay above the WebGL viewport) ----
const SPEED_LINE_COUNT          = 28;
const SPEED_LINE_THRESHOLD_LO   = 40;    // no streaks below 40 m/s
const SPEED_LINE_THRESHOLD_HI   = 65;    // full strength at 65 m/s
const SPEED_LINE_MAX_OPACITY    = 0.50;
const SPEED_LINE_OPACITY_CURVE  = 1.3;      // >1 = slow onset, sharp climb
const SPEED_LINE_MOTION_GAIN    = 9.0;      // px/s per (m/s) of gameSpeed
const SPEED_LINE_LIFE_MIN       = 0.30;
const SPEED_LINE_LIFE_MAX       = 0.85;
const SPEED_LINE_TAIL_MIN       = 45;
const SPEED_LINE_TAIL_MAX       = 130;
const SPEED_LINE_WIDTH_MIN      = 0.8;
const SPEED_LINE_WIDTH_MAX      = 1.8;
// Spawn radius as a fraction of the distance to the viewport edge along the
// particle's own radial direction (keeps spawns inside the visible rectangle)
const SPEED_LINE_RADIUS_INNER   = 0.55;
const SPEED_LINE_RADIUS_OUTER   = 0.92;
const SPEED_LINE_SPEED_MUL_MIN  = 0.70;
const SPEED_LINE_SPEED_MUL_MAX  = 1.30;


// ============================================================
//  GAME STATE
// ============================================================

let score     = 0;
let elapsed   = 0;
let gameSpeed = SPEED_INITIAL;
let gameState = 'menu';         // 'menu' -> 'intro' -> 'playing' -> 'falling'? -> 'gameover'
let lastTime  = performance.now();
let introTimer = 0;
const INTRO_PAN_DURATION = 1.5;

// Falling state (only meaningful while gameState === 'falling')
let fallTimer  = 0;
let fallVelY   = 0;
let fallDir    = 0;
let fallMode   = 'edge';
let fallVelX   = 0;
let fallVelZ   = 0;
let fallSpinX  = 0;
let fallSpinY  = 0;
let fallSpinZ  = 0;
let fallStartRotX = 0;
let fallStartRotY = 0;
let fallStartRotZ = 0;

const keys = { left: false, right: false, boost: false, brake: false };
let startCycleOffset = 0.12;
let boostAmount = 0;
let brakeAmount = 0;
let bonusSpeed = 0; // Permanent speed accumulator built up by W, only reset on restart
let boostHoldTime = 0; 
let avalancheGap = GAP_DEFAULT;
let camMode = 0;                    // 0 = behind, 1 = first-person, 2 = facing
const camLook = new THREE.Vector3(0, 0.8, 4);  // smoothed lookAt target
const skierBounds = new THREE.Box3();

let shopActive = false;
let shopDragging = false;
let shopLastPointerX = 0;
let shopYaw = 0;

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
//  LIGHTS (driven each frame by the day/night cycle)
// ============================================================

const ambientLight = new THREE.AmbientLight(0x8899bb, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.castShadow = true;

// High-res shadow map to compensate for the large frustum
sunLight.shadow.mapSize.width  = 8192;
sunLight.shadow.mapSize.height = 8192;


sunLight.shadow.camera.near   = -200;
sunLight.shadow.camera.far    = 500;
sunLight.shadow.camera.left   = -150;
sunLight.shadow.camera.right  = 150;
sunLight.shadow.camera.top    = 150;
sunLight.shadow.camera.bottom = -150;

// Sun looks at this target, which follows the skier
const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
sunLight.target = sunTarget;

scene.add(sunLight);

const shopSpot = new THREE.PointLight(0xffeedd, 6.0, 5.5, 1.6);
shopSpot.position.set(0.6, 2.0, 1.6);
shopSpot.visible = false;
scene.add(shopSpot);


const shopRim = new THREE.PointLight(0x88aacc, 2.5, 5.0, 1.6);
shopRim.position.set(-0.8, 1.6, -1.0);
shopRim.visible = false;
scene.add(shopRim);

// PointLight pool reassigned to the closest lit obstacles each frame so the
// scene avoids creating a light per obstacle (which would tank framerate)
const NIGHT_LIGHT_COUNT = 8;
const nightLights = [];
for (let i = 0; i < NIGHT_LIGHT_COUNT; i++) {
    const pl = new THREE.PointLight(0xffaa44, 0, 40, 1.2);
    pl._fade = 0;
    scene.add(pl);
    nightLights.push(pl);
}


// ============================================================
//  DAY / NIGHT CYCLE
// ============================================================
// Normalized t in [0,1) drives keyframe interpolation of sky/fog colour,
// sun colour and orbit, ambient lighting, and fog distances. Night is
// compressed to roughly 30 s of the cycle
//
// AI was used for the colors
const CYCLE_KEYFRAMES = [
    { time: 0.00, skyColor: c(0x1a1a35), sunColor: c(0x6680aa), sunIntensity: 0.55, ambientColor: c(0x3a3a60), ambientIntensity: 0.65, fogNear: 20, fogFar: 140 },
    { time: 0.05, skyColor: c(0x252540), sunColor: c(0x7888aa), sunIntensity: 0.60, ambientColor: c(0x353560), ambientIntensity: 0.62, fogNear: 22, fogFar: 150 },
    { time: 0.10, skyColor: c(0xd48a5a), sunColor: c(0xffaa55), sunIntensity: 0.95, ambientColor: c(0xa07a66), ambientIntensity: 0.55, fogNear: 25, fogFar: 180 },
    { time: 0.20, skyColor: c(0x87ceeb), sunColor: c(0xfff5e0), sunIntensity: 1.30, ambientColor: c(0x9eaecc), ambientIntensity: 0.70, fogNear: 38, fogFar: 260 },
    { time: 0.42, skyColor: c(0x87ceeb), sunColor: c(0xffffff), sunIntensity: 1.45, ambientColor: c(0xaabbdd), ambientIntensity: 0.75, fogNear: 42, fogFar: 290 },
    { time: 0.60, skyColor: c(0x87ceeb), sunColor: c(0xffffff), sunIntensity: 1.40, ambientColor: c(0x9eaecc), ambientIntensity: 0.72, fogNear: 40, fogFar: 280 },
    { time: 0.64, skyColor: c(0xddaa66), sunColor: c(0xffcc77), sunIntensity: 1.05, ambientColor: c(0xa08866), ambientIntensity: 0.62, fogNear: 30, fogFar: 210 },
    { time: 0.68, skyColor: c(0xcc6633), sunColor: c(0xff7755), sunIntensity: 0.80, ambientColor: c(0x8e5544), ambientIntensity: 0.55, fogNear: 25, fogFar: 180 },
    { time: 0.73, skyColor: c(0x553344), sunColor: c(0x9988aa), sunIntensity: 0.60, ambientColor: c(0x5a4458), ambientIntensity: 0.55, fogNear: 22, fogFar: 160 },
    { time: 0.80, skyColor: c(0x2a2240), sunColor: c(0x7788aa), sunIntensity: 0.55, ambientColor: c(0x3a3258), ambientIntensity: 0.55, fogNear: 20, fogFar: 150 },
    { time: 0.94, skyColor: c(0x1e1e30), sunColor: c(0x6680aa), sunIntensity: 0.55, ambientColor: c(0x353560), ambientIntensity: 0.60, fogNear: 20, fogFar: 140 },
    { time: 1.00, skyColor: c(0x1a1a35), sunColor: c(0x6680aa), sunIntensity: 0.55, ambientColor: c(0x3a3a60), ambientIntensity: 0.65, fogNear: 20, fogFar: 140 },
];

function c(hex) { return new THREE.Color(hex); }

// Reused for interpolation so we avoid per-frame allocations
const tmpSky = new THREE.Color();
const tmpSun = new THREE.Color();
const tmpAmb = new THREE.Color();


// Radial gradient texture for the sun/moon glow sprite
function makeGlowTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const center   = size / 2;

    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

    gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)'); 
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(canvas);
}


// ============================================================
//  SUN AND MOON VISUALS
// ============================================================

const glowTexture = makeGlowTexture();

// MeshBasicMaterial: the sun emits light, it does not receive it
// fog:false keeps it visible past the mountain ring
const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(15, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffaa, fog: false })
);
scene.add(sunMesh);

// AdditiveBlending mimics real lens glow: it only brightens
const sunGlowMat = new THREE.SpriteMaterial({
    map:         glowTexture,
    color:       0xffdd66,
    blending:    THREE.AdditiveBlending,
    transparent: true,
    depthWrite:  false,
    fog:         false,
});
const sunGlow = new THREE.Sprite(sunGlowMat);
sunGlow.scale.set(170, 170, 1);
scene.add(sunGlow);

// Moon: smaller and cooler than the sun
const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xdde8ff, fog: false })
);
scene.add(moonMesh);

const moonGlowMat = new THREE.SpriteMaterial({
    map:         glowTexture,
    color:       0x8899cc,
    blending:    THREE.AdditiveBlending,
    transparent: true,
    depthWrite:  false,
    fog:         false,
});
const moonGlow = new THREE.Sprite(moonGlowMat);
moonGlow.scale.set(85, 85, 1);
scene.add(moonGlow);




// Find the two keyframes surrounding t and lerp between them
function sampleCycle(normalizedTime) {
    // Clamp t into [0, 1)
    const t = normalizedTime - Math.floor(normalizedTime);

    // Find the two keyframes that bracket the current time
    let from = CYCLE_KEYFRAMES[0];
    let to   = CYCLE_KEYFRAMES[1];
    for (let i = 0; i < CYCLE_KEYFRAMES.length - 1; i++) {
        if (t >= CYCLE_KEYFRAMES[i].time && t < CYCLE_KEYFRAMES[i + 1].time) {
            from = CYCLE_KEYFRAMES[i];
            to   = CYCLE_KEYFRAMES[i + 1];
            break;
        }
    }

    // How far we are between the two keyframes (0 = at 'from', 1 = at 'to')
    const segmentLength = to.time - from.time;
    const blend = segmentLength > 0 ? (t - from.time) / segmentLength : 0;

    return {
        skyColor:          tmpSky.copy(from.skyColor).lerp(to.skyColor, blend),
        sunColor:          tmpSun.copy(from.sunColor).lerp(to.sunColor, blend),
        sunIntensity:      from.sunIntensity      + (to.sunIntensity      - from.sunIntensity)      * blend,
        ambientColor:      tmpAmb.copy(from.ambientColor).lerp(to.ambientColor, blend),
        ambientIntensity:  from.ambientIntensity  + (to.ambientIntensity  - from.ambientIntensity)  * blend,
        fogNear:           from.fogNear           + (to.fogNear           - from.fogNear)           * blend,
        fogFar:            from.fogFar            + (to.fogFar            - from.fogFar)            * blend,
    };
}



// AI-assisted block:
// AI helped organize the update logic for interpolating lighting, fog, and
// sun/moon positions over time. The final values were manually tested and tuned.
function updateCycle(normalizedTime) {
    const state = sampleCycle(normalizedTime);

    // Sky and fog
    scene.background.copy(state.skyColor);
    scene.fog.color.copy(state.skyColor);
    scene.fog.near = state.fogNear;
    scene.fog.far  = state.fogFar;

    // Ambient
    ambientLight.color.copy(state.ambientColor);
    ambientLight.intensity = state.ambientIntensity;

    // Sun colour and intensity
    sunLight.color.copy(state.sunColor);
    sunLight.intensity = state.sunIntensity;

    // Cosine centered on t=0.42 puts the sun at its peak at midday
    const sunAngle = (normalizedTime - 0.42) * Math.PI * 2;
    const sunDist  = 80;
    const sunBaseY = 5;
    const sunAmp   = 65;

    sunLight.position.set(
        Math.sin(sunAngle) * sunDist * 0.4,
        sunBaseY + Math.cos(sunAngle) * sunAmp,
        sunDist * 0.6
    );

    // Keep the shadow frustum centred on the skier
    sunLight.position.x += sunTarget.position.x;
    sunLight.position.z += sunTarget.position.z;

    // Visual meshes go well past the mountain ring so the sun/moon read as
    // distant. The light itself stays near so the shadow frustum stays tight
    const visualDist = 520;
    const visualAmp  = 260;

    const sunVX = Math.sin(sunAngle) * visualDist * 0.4 + sunTarget.position.x;
    const sunVY = sunBaseY + Math.cos(sunAngle) * visualAmp;
    const sunVZ = visualDist * 0.6                     + sunTarget.position.z;

    sunMesh.position.set(sunVX, sunVY, sunVZ);
    sunGlow.position.set(sunVX, sunVY, sunVZ);

    // Moon: same orbit, half a cycle out of phase
    const moonAngle = sunAngle + Math.PI;
    const moonVX = Math.sin(moonAngle) * visualDist * 0.4 + sunTarget.position.x;
    const moonVY = sunBaseY + Math.cos(moonAngle) * visualAmp;
    const moonVZ = visualDist * 0.6                      + sunTarget.position.z;

    moonMesh.position.set(moonVX, moonVY, moonVZ);
    moonGlow.position.set(moonVX, moonVY, moonVZ);

    // sunLight.intensity is already interpolated, so reuse it as a day/night proxy
    const dayness   = Math.min(1, sunLight.intensity / 1.0);
    const nightness = 1.0 - dayness;

    sunMesh.material.opacity     = dayness;
    sunMesh.material.transparent = true;
    sunGlowMat.opacity           = dayness * 0.8;

    moonMesh.material.opacity     = nightness;
    moonMesh.material.transparent = true;
    moonGlowMat.opacity           = nightness * 0.5;
}


// ============================================================
//  TERRAIN & TEXTURES
// ============================================================
const skierMount = new THREE.Group();
skierMount.rotation.x = SLOPE_TILT;
skierMount.position.y = -0.07;
skierMount.add(skier);
scene.add(skierMount);

const chunks = createTerrain(scene);
const snowTrails = createSnowTrails(chunks);
const skiTrailContacts = [];

for (let i = 0; i < chunks.length; i++) {
    const biomeName = (i < SAFE_CHUNKS) ? BIOME_BASE : getBiomeForNextChunk(SPEED_INITIAL);
    if (i < SAFE_CHUNKS) {
        chunks[i].userData.biome = BIOME_BASE;
    } else {
        populateChunk(chunks[i], CHUNK_LENGTH, CHUNK_WIDTH, 0, false, biomeName);
    }
}

const sceneryRing = createScenery(scene);           // Background mountain ring; the main loop slides it along Z each frame
const avalanche = createAvalanche(scene);
const blizzardEmitter = getBlizzardEmitter();
scene.add(blizzardEmitter);
const windStreakEmitter = getWindStreakEmitter();
scene.add(windStreakEmitter);


// ============================================================
//  SPEED LINES
// ============================================================
const speedLineCanvas = document.createElement('canvas');
speedLineCanvas.style.cssText =
    'position:fixed; inset:0; pointer-events:none; z-index:5;';
document.body.appendChild(speedLineCanvas);
const speedLineCtx = speedLineCanvas.getContext('2d');

function resizeSpeedLineCanvas() {
    speedLineCanvas.width  = window.innerWidth;
    speedLineCanvas.height = window.innerHeight;
}
resizeSpeedLineCanvas();
window.addEventListener('resize', resizeSpeedLineCanvas);

// Each line is an independent particle that respawns when its life ends
function respawnSpeedLine(line) {
    const cx = speedLineCanvas.width  / 2;
    const cy = speedLineCanvas.height / 2;

    // Pick an outward radial direction
    const angle = Math.random() * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    // Anisotropic edge distance keeps spawns inside the visible rectangle
    // regardless of aspect ratio
    const tEdgeX = Math.abs(dx) > 0.0001 ? Math.abs(cx / dx) : Infinity;
    const tEdgeY = Math.abs(dy) > 0.0001 ? Math.abs(cy / dy) : Infinity;
    const edgeDistance = Math.min(tEdgeX, tEdgeY);

    const radiusFraction = SPEED_LINE_RADIUS_INNER
        + Math.random() * (SPEED_LINE_RADIUS_OUTER - SPEED_LINE_RADIUS_INNER);
    const r = edgeDistance * radiusFraction;

    line.dirX = dx;
    line.dirY = dy;
    line.x    = cx + dx * r;
    line.y    = cy + dy * r;

    line.life          = 0;
    line.lifeDuration  = SPEED_LINE_LIFE_MIN
        + Math.random() * (SPEED_LINE_LIFE_MAX - SPEED_LINE_LIFE_MIN);
    line.tailLength    = SPEED_LINE_TAIL_MIN
        + Math.random() * (SPEED_LINE_TAIL_MAX - SPEED_LINE_TAIL_MIN);
    line.width         = SPEED_LINE_WIDTH_MIN
        + Math.random() * (SPEED_LINE_WIDTH_MAX - SPEED_LINE_WIDTH_MIN);
    line.speedMul      = SPEED_LINE_SPEED_MUL_MIN
        + Math.random() * (SPEED_LINE_SPEED_MUL_MAX - SPEED_LINE_SPEED_MUL_MIN);
    line.baseAlpha     = 0.55 + Math.random() * 0.45;
}

const speedLines = [];
for (let i = 0; i < SPEED_LINE_COUNT; i++) {
    const line = {
        activationSpeed: SPEED_LINE_THRESHOLD_LO
            + (i / Math.max(1, SPEED_LINE_COUNT - 1))
              * (SPEED_LINE_THRESHOLD_HI - SPEED_LINE_THRESHOLD_LO)
            + (Math.random() - 0.5) * 1.5
    };
    respawnSpeedLine(line);
    line.life = Math.random();
    speedLines.push(line);
}


function updateSpeedLines(delta, currentSpeed) {
    const ctx = speedLineCtx;
    ctx.clearRect(0, 0, speedLineCanvas.width, speedLineCanvas.height);

    // Visibility ramps from THRESHOLD_LO to THRESHOLD_HI on a curved exponent
    const linearFactor = Math.max(0, Math.min(1,
        (currentSpeed - SPEED_LINE_THRESHOLD_LO) /
        (SPEED_LINE_THRESHOLD_HI - SPEED_LINE_THRESHOLD_LO)
    ));
    const speedFactor = Math.pow(linearFactor, SPEED_LINE_OPACITY_CURVE);
    if (speedFactor <= 0.001) return;

    // Drift rate also tracks gameSpeed
    const baseStep = currentSpeed * SPEED_LINE_MOTION_GAIN * delta;
    ctx.lineCap = 'round';

    for (const line of speedLines) {
        // Each streak is gated until gameSpeed clears its activationSpeed
        if (currentSpeed <= line.activationSpeed) continue;

        line.life += delta / line.lifeDuration;
        if (line.life >= 1) {
            respawnSpeedLine(line);
            continue;
        }

        line.x += line.dirX * baseStep * line.speedMul;
        line.y += line.dirY * baseStep * line.speedMul;

        // Sine envelope: 0 at birth, peak at mid-life, 0 at death
        const lifeFade = Math.sin(line.life * Math.PI);
        const headAlpha = lifeFade * line.baseAlpha
            * speedFactor * SPEED_LINE_MAX_OPACITY;
        if (headAlpha < 0.01) continue;

        // Gradient runs transparent (tail) -> bright (head) for a comet shape
        const tailX = line.x - line.dirX * line.tailLength;
        const tailY = line.y - line.dirY * line.tailLength;

        const grad = ctx.createLinearGradient(tailX, tailY, line.x, line.y);
        grad.addColorStop(0.00, 'rgba(255,255,255,0)');
        grad.addColorStop(0.55, 'rgba(255,255,255,' + (headAlpha * 0.35).toFixed(3) + ')');
        grad.addColorStop(1.00, 'rgba(255,255,255,' + headAlpha.toFixed(3) + ')');

        ctx.strokeStyle = grad;
        ctx.lineWidth   = line.width;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(line.x, line.y);
        ctx.stroke();
    }
}


// ============================================================
//  HUD & GAME OVER OVERLAY
// ============================================================

const hud = document.createElement('div');
hud.style.cssText =
    'position:fixed; top:16px; left:16px; color:#fff; font:bold 18px monospace;' +
    'text-shadow:0 1px 3px rgba(0,0,0,0.6); pointer-events:none; z-index:10;' +
    'line-height:1.6; display:none;';
document.body.appendChild(hud);

const overlay = document.createElement('div');
overlay.style.cssText =
    'position:fixed; inset:0; display:flex; flex-direction:column;' +
    'align-items:center; justify-content:center;' +
    'background:linear-gradient(180deg, rgba(10,12,30,0.88) 0%, rgba(20,35,70,0.78) 100%);' +
    'color:#fff; font-family:sans-serif; z-index:20; pointer-events:none;' +
    'opacity:0; transition:opacity 0.4s;';
overlay.innerHTML =
    '<div style="font-family:Georgia,serif; font-size:clamp(40px,9vw,72px);' +
        'font-weight:bold; letter-spacing:12px; color:#e4edf5;' +
        'text-shadow:0 0 30px rgba(150,200,255,0.4); margin-bottom:16px;">DEATH</div>' +
    '<div id="go-score" style="font-size:20px; letter-spacing:2px;' +
        'color:#a0b8d0; margin-bottom:36px;"></div>' +
    '<div style="display:flex; flex-direction:column;">' +
        '<button id="go-restart" class="menu-btn menu-btn-primary">RESTART</button>' +
        '<button id="go-menu"    class="menu-btn">MAIN MENU</button>' +
    '</div>';
document.body.appendChild(overlay);
overlay.querySelector('#go-restart').addEventListener('click', () => { playUiClick(); restartGame(); });
overlay.querySelector('#go-menu').addEventListener('click', () => { playUiClick(); returnToMenu(); });


// ============================================================
//  MAIN MENU
// ============================================================

const menu = createMenu({
    onPlay: () => startGame(),
    getStartCycleOffset: () => startCycleOffset,
    setStartCycleOffset: (t) => { startCycleOffset = t; },
    getWallet,
    spend,
    onAppearanceChange: applyEquippedAppearance,
    applyAppearance: (config) => setSkierAppearance(config),
    onShopStateChange: (active) => {
        shopActive = active;
        if (active) {
            shopYaw = 0;
            // Flatten the slope mount so dragging spins the skier around true Y
            skierMount.rotation.x = 0;
            skierMount.position.y = 0;
            renderer.domElement.style.cursor = 'grab';
        } else {
            shopDragging = false;
            shopYaw = 0;
            skier.rotation.y = 0;
            skierMount.rotation.x = SLOPE_TILT;
            skierMount.position.y = -0.07;
            renderer.domElement.style.cursor = '';
        }
    },
});


// ============================================================
//  INPUT HANDLING
// ============================================================

document.addEventListener('keydown', (e) => {
    if (gameState === 'playing') {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft')  keys.left  = true;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
        if (e.code === 'KeyW' || e.code === 'ArrowUp')    keys.boost = true;
        if (e.code === 'KeyS' || e.code === 'ArrowDown')  keys.brake = true;
        if (e.code === 'KeyT') { camMode = (camMode + 1) % 3; }
    }
    if (e.code === 'Space' && gameState === 'menu')     startGame();
    if (e.code === 'KeyR'  && gameState === 'gameover') restartGame();
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft')  keys.left  = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'KeyW' || e.code === 'ArrowUp')    keys.boost = false;
    if (e.code === 'KeyS' || e.code === 'ArrowDown')  keys.brake = false;
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Drag-to-rotate the skier while the shop is open
const SHOP_UI_SELECTOR = '.shop-tab, .shop-item, .shop-confirm-btn, .menu-back, .menu-panel-title';
window.addEventListener('pointerdown', (e) => {
    if (!shopActive) return;
    if (e.target && e.target.closest && e.target.closest(SHOP_UI_SELECTOR)) return;
    shopDragging = true;
    shopLastPointerX = e.clientX;
    renderer.domElement.style.cursor = 'grabbing';
});
window.addEventListener('pointermove', (e) => {
    if (!shopDragging) return;
    const dx = e.clientX - shopLastPointerX;
    shopLastPointerX = e.clientX;
    shopYaw += dx * 0.01;
});
window.addEventListener('pointerup', () => {
    shopDragging = false;
    renderer.domElement.style.cursor = shopActive ? 'grab' : '';
});


// ============================================================
//  GAME LOGIC HELPERS
// ============================================================

// Position in the day/night cycle, in [0, 1)
function getCycleT() {
    return ((elapsed / CYCLE_DURATION) + startCycleOffset) % 1.0;
}

function isNightTime() {
    const t = getCycleT();
    return t > 0.58 || t < 0.15;
}

function onChunkRecycle(chunk) {
    clearChunk(chunk);
    snowTrails.clearChunk(chunk);
    const biomeName = getBiomeForNextChunk(gameSpeed);
    populateChunk(chunk, CHUNK_LENGTH, CHUNK_WIDTH, score, isNightTime(), biomeName);
}

function getCurrentBiome() {
    for (const c of chunks) {
        if (c.position.z > -CHUNK_LENGTH / 2 && c.position.z <= CHUNK_LENGTH / 2) {
            return getBiome(c.userData.biome || BIOME_BASE);
        }
    }
    return getBiome(BIOME_BASE);
}

// AI-done block:
// AI helped structure the blizzard blending logic so the storm can fade in and
// out based on the skier's distance to blizzard chunks. The final gameplay
// integration and distances were adjusted manually.
function computeBlizzardTarget() {
    const biome   = getBiome(BIOME_BLIZZARD);
    const approach = biome.windApproachDist || 80;
    const recede   = biome.windRecedeDist   || approach;
    let best = 0;

    for (const c of chunks) {
        if (c.userData.biome !== BIOME_BLIZZARD) continue;
        // Chunks slide toward -Z, so the +Z (near) face is the leading edge as
        // the storm approaches and the -Z (far) face is the trailing edge as it
        // recedes. Ramp on whichever edge the skier is currently outside of.
        const aheadDist  = (c.position.z - CHUNK_LENGTH / 2) - skier.position.z;
        const behindDist = skier.position.z - (c.position.z + CHUNK_LENGTH / 2);

        let t;
        if (aheadDist > 0)       t = Math.max(0, 1 - aheadDist  / approach);
        else if (behindDist > 0) t = Math.max(0, 1 - behindDist / recede);
        else                     t = 1;

        if (t > best) best = t;
    }
    return best;
}

// AI-done block:
// AI helped structure the wind gust state machine: calm, telegraph, and gust.
// The force values, timing ranges, and biome integration were manually tuned.
function updateWindGust(delta, biome) {
    if (!biome.windPeakForce) {
        windGust.mode = 'calm';
        windGust.timer = 0;
        return 0;
    }

    windGust.timer += delta;
    if (windGust.timer >= windGust.duration) {
        windGust.timer = 0;
        if (windGust.mode === 'calm') {
            windGust.mode      = 'telegraph';
            windGust.duration  = randInRange(biome.windTelegraphMin, biome.windTelegraphMax);
            windGust.direction = Math.random() < 0.5 ? -1 : 1;
            windGust.peak      = biome.windPeakForce;
        } else if (windGust.mode === 'telegraph') {
            // Telegraph → gust: force ramp starts here, same direction
            windGust.mode     = 'gust';
            windGust.duration = randInRange(biome.windGustMin, biome.windGustMax);
        } else {
            windGust.mode     = 'calm';
            windGust.duration = randInRange(biome.windCalmMin, biome.windCalmMax);
        }
    }

    if (windGust.mode !== 'gust') return 0;
    const x = windGust.timer / windGust.duration;
    const envelope = Math.sin(Math.PI * x);
    return windGust.direction * windGust.peak * envelope;
}

function showGameOver() {
    gameState = 'gameover';
    snowTrails.pause();
    const banked = commitRunToWallet();
    document.getElementById('go-score').innerHTML =
        'Score: ' + Math.floor(score) + ' m' +
        '<br><span style="color:#a8cce8;">&#10052;</span> ' +
        banked + ' collected &nbsp;&middot;&nbsp; wallet: ' + getWallet();
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
}

function beginEdgeFall() {
    gameState = 'falling';
    snowTrails.pause();
    fallMode  = 'edge';
    fallTimer = 0;
    fallVelY  = 0;
    fallVelX  = 0;
    fallVelZ  = 0;
    fallDir   = Math.sign(skier.position.x) || 1;   // +1 right, -1 left
    fallSpinX = FALL_SPIN_SPEED * 0.7;
    fallSpinY = 0;
    fallSpinZ = -fallDir * FALL_SPIN_SPEED;
    fallStartRotX = skier.rotation.x;
    fallStartRotY = skier.rotation.y;
    fallStartRotZ = skier.rotation.z;
}

// AI-assisted block:
// AI helped discuss the crash-state structure and how to derive a fall direction
// from the collision normal
function beginCollisionFall(collision) {
    const impactSide = Math.abs(collision.normalX) > 0.08
        ? Math.sign(collision.normalX)
        : (skier.rotation.z >= 0 ? 1 : -1);

    gameState = 'falling';
    snowTrails.pause();
    fallMode  = 'collision';
    fallTimer = 0;
    fallDir   = impactSide;

    // Push away from the obstacle normal but keep downhill momentum (+Z)
    const forwardProjection = Math.min(
        CRASH_FORWARD_MAX,
        CRASH_FORWARD_BASE + gameSpeed * CRASH_FORWARD_SCALE
    );
    fallVelX = collision.normalX * CRASH_SIDE_PUSH + impactSide * 1.2;
    fallVelY = CRASH_LAUNCH_UP;
    fallVelZ = forwardProjection + collision.normalZ * CRASH_NORMAL_Z_PUSH;

    // Controlled loss of balance: equipment flies off but the body stays rigged
    fallSpinX = 0;
    fallSpinY = 0;
    fallSpinZ = 0;
    fallStartRotX = skier.rotation.x;
    fallStartRotY = skier.rotation.y;
    fallStartRotZ = skier.rotation.z;

    releaseSkierEquipment(scene, {
        normalX: collision.normalX,
        normalZ: collision.normalZ,
        speed: gameSpeed
    });
}

function beginAvalancheFall() {
    gameState = 'falling';
    snowTrails.pause();
    fallMode  = 'avalanche';
    fallTimer = 0;
    fallDir   = 0;
    fallVelX  = 0;
    fallVelY  = 0;
    fallVelZ  = AVALANCHE_FALL_PUSH;
    fallSpinX = 0;
    fallSpinY = 0;
    fallSpinZ = 0;
    fallStartRotX = skier.rotation.x;
    fallStartRotY = skier.rotation.y;
    fallStartRotZ = skier.rotation.z;
}

function keepCrashBodyAboveSnow() {
    skier.updateMatrixWorld(true);
    skierBounds.setFromObject(skier);

    if (skierBounds.min.y < CRASH_MIN_BODY_Y) {
        skier.position.y += CRASH_MIN_BODY_Y - skierBounds.min.y;
        if (fallVelY < 0) fallVelY = 0;
    }
}


function startGame() {
    gameState = 'intro';
    introTimer = 0;
    lastTime   = performance.now();
    applyEquippedAppearance();
    menu.hide();
    avalanche.visible = true;
    skier.position.set(0, 0.012, 0);
    skier.rotation.set(0, 0, 0);
    elapsed = 0;
    score = 0;
    gameSpeed = SPEED_INITIAL;
    bonusSpeed = 0;
    boostAmount = 0;
    brakeAmount = 0;
    boostHoldTime = 0;
    avalancheGap = GAP_DEFAULT;
    camMode = 0;
    keys.left = keys.right = keys.boost = keys.brake = false;
    hud.style.display = 'block';
    snowTrails.reset();
    resetRunCoins();
}

function startMenuMode() {
    gameState = 'menu';
    introTimer = 0;
    avalanche.visible = false;
    keys.left = keys.right = keys.boost = keys.brake = false;
    snowTrails.pause();
    skier.position.set(0, 0.012, 0);
    skier.rotation.set(0, 0, 0);
    resetSkierPose();
    resetSkierEquipment();
    hud.style.display = 'none';
    menu.show();
    camera.position.set(3.0, 1.0, 3.5);
    camLook.set(-1.8, 1.4, 0);
    camera.lookAt(camLook);
}


function resetWorld() {
    skier.position.set(0, 0, 0);
    skier.rotation.set(0, 0, 0);
    resetSkierPose();
    resetSkierEquipment();
    snowTrails.reset();

    elapsed   = 0;
    score     = 0;
    gameSpeed = SPEED_INITIAL;
    lastTime  = performance.now();

    fallTimer = 0;
    fallVelY  = 0;
    fallDir   = 0;
    fallMode  = 'edge';
    fallVelX  = 0;
    fallVelZ  = 0;
    fallSpinX = 0;
    fallSpinY = 0;
    fallSpinZ = 0;
    fallStartRotX = 0;
    fallStartRotY = 0;
    fallStartRotZ = 0;

    keys.boost = false;
    keys.brake = false;
    boostAmount = 0;
    brakeAmount = 0;
    bonusSpeed = 0;
    boostHoldTime = 0;
    avalancheGap = GAP_DEFAULT;

    resetBiomeProgression();
    for (let i = 0; i < chunks.length; i++) {
        clearChunk(chunks[i]);
        chunks[i].position.set(0, 0, i * CHUNK_LENGTH);
        if (i < SAFE_CHUNKS) {
            chunks[i].userData.biome = BIOME_BASE;
        } else {
            const biomeName = getBiomeForNextChunk(SPEED_INITIAL);
            populateChunk(chunks[i], CHUNK_LENGTH, CHUNK_WIDTH, score, isNightTime(), biomeName);
        }
    }

    resetRunCoins();

    blizzardFactor = 0;
    windGust.mode = 'calm';
    windGust.timer = 0;
    windGust.duration = 0;
    windGust.direction = 1;
    windGust.peak = 0;
    windStreakSpawnTimer = 0;
    resetBlizzard();

    camera.position.set(0, 3, -5);
    camLook.set(0, 0.8, 4);
    camMode = 0;
}

function hideGameOverOverlay() {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
}

function restartGame() {
    resetWorld();
    gameState = 'playing';
    hideGameOverOverlay();
}

function returnToMenu() {
    resetWorld();
    hideGameOverOverlay();
    startMenuMode();
}


// ============================================================
//  ANIMATION LOOP
// ============================================================

function animate(now) {
    requestAnimationFrame(animate);

    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const tickBiome = getCurrentBiome();

    const gustModeBefore = windGust.mode;
    const tickWindX = updateWindGust(delta, tickBiome);
    const telegraphJustStarted = (gustModeBefore === 'calm' && windGust.mode === 'telegraph');

    if (telegraphJustStarted) {
        for (let i = 0; i < WIND_STREAK_BURST_ON_START; i++) {
            spawnWindStreak(skier.position.x, skier.position.z, windGust.direction, 0.85);
        }
        windStreakSpawnTimer = 0.10;
    }
    if (windGust.mode === 'telegraph' || windGust.mode === 'gust') {
        windStreakSpawnTimer -= delta;
        if (windStreakSpawnTimer <= 0) {
            const mag = windGust.mode === 'gust' && windGust.peak > 0
                ? Math.max(0.55, Math.abs(tickWindX) / windGust.peak)
                : 0.75;
            spawnWindStreak(skier.position.x, skier.position.z, windGust.direction, mag);
            windStreakSpawnTimer = 0.10 + Math.random() * 0.12;
        }
    }

    const blizzardTarget = computeBlizzardTarget();
    const blizzardSmooth = 1 - Math.exp(-BLIZZARD_BLEND_RATE * delta);
    blizzardFactor += (blizzardTarget - blizzardFactor) * blizzardSmooth;

    // Shop spotlight + rim track the skier so they stay anchored to the model
    shopSpot.visible = shopActive;
    shopRim.visible  = shopActive;
    shopSpot.position.set(
        skier.position.x + 0.6,
        skier.position.y + 2.0,
        skier.position.z + 1.6
    );
    shopRim.position.set(
        skier.position.x - 0.8,
        skier.position.y + 1.6,
        skier.position.z - 1.0
    );

    // -- Menu: skier idling at gameplay start, framed on the right --
    if (gameState === 'menu') {
        animateSkierIdle(now * 0.001);
        if (shopActive) skier.rotation.y = shopYaw;
    }

    // -- Intro: short camera pan, skier already skiing for a clean pickup --
    else if (gameState === 'intro') {
        introTimer += delta;
        // Live world: terrain scrolls, skier animates, but no score/input
        gameSpeed = SPEED_INITIAL;
        updateTerrain(chunks, gameSpeed, delta, onChunkRecycle);
        animateSkier(introTimer, { boost: 0, brake: 0 });
        snowTrails.update(getSkiTrailContacts(skiTrailContacts), 0);
        if (introTimer >= INTRO_PAN_DURATION) {
            gameState = 'playing';
            elapsed = 0;
            lastTime = performance.now();
        }
    }

    // -- Game update (only while playing) --
    else if (gameState === 'playing') {
        elapsed  += delta;

        // Snowplow (S) overrides tuck (W), so S held collapses boostTarget to 0
        const boostTarget = (keys.boost && !keys.brake) ? 1.0 : 0.0;
        const brakeTarget = keys.brake ? 1.0 : 0.0;
        const smooth = 1 - Math.exp(-INPUT_SMOOTHING * delta);
        boostAmount += (boostTarget - boostAmount) * smooth;
        brakeAmount += (brakeTarget - brakeAmount) * smooth;

        // Quadratic ramp on the boost rate, reset on release of W or while S held
        if (keys.boost && !keys.brake) {
            boostHoldTime += delta;
            const rampT = Math.min(1, boostHoldTime / BOOST_RAMP_TIME);
            const accel = BOOST_ACCEL_INITIAL
                + (BOOST_ACCEL_PEAK - BOOST_ACCEL_INITIAL) * (rampT * rampT);
            bonusSpeed += accel * delta;
        } else {
            boostHoldTime = 0;
        }

        // Holding S also bleeds bonusSpeed, so braking carries a long-term cost
        if (brakeAmount > 0.001 && bonusSpeed > 0) {
            bonusSpeed = Math.max(0, bonusSpeed - brakeAmount * BRAKE_DECAY_RATE * delta);
        }

        // gameSpeed = (baseSpeed + bonusSpeed) * (1 - brakeAmount * BRAKE_FACTOR)
        const baseSpeed = SPEED_INITIAL + elapsed * SPEED_RAMP;
        const fullSpeed = baseSpeed + bonusSpeed;
        gameSpeed = Math.max(SPEED_FLOOR, fullSpeed * (1 - brakeAmount * BRAKE_FACTOR));
        score    += gameSpeed * delta;

        // Spring on avalancheGap: W pushes out, S pulls in, restoring force pulls back
        const gapBoostForce = boostAmount * GAP_BOOST_RATE;
        const gapBrakeForce = brakeAmount * GAP_BRAKE_RATE;
        const gapRestoring  = GAP_PULL_FACTOR * (avalancheGap - GAP_DEFAULT);
        avalancheGap += (gapBoostForce - gapBrakeForce - gapRestoring) * delta;
        avalancheGap = Math.max(0, Math.min(GAP_MAX, avalancheGap));

        updateTerrain(chunks, gameSpeed, delta, onChunkRecycle);

        // No hard clamp: |x| > PLAY_HALF_X triggers the boundary fall.
        // Tucking shrinks lateral speed, so A/D dodging gets harder while W is held
        const lateralSpeed = LATERAL_SPEED * (1 - boostAmount * LATERAL_W_PENALTY);
        if (keys.left)  skier.position.x += lateralSpeed * delta;
        if (keys.right) skier.position.x -= lateralSpeed * delta;

        // Weather biomes layer a sinusoidal lateral force on top of A/D input,
        // so the skier has to keep reacting instead of counter-steering once.
        skier.position.x += tickWindX * delta;

        // Lean into turns
        let targetLean = 0;
        if (keys.left)  targetLean =  LEAN_ANGLE;
        if (keys.right) targetLean = -LEAN_ANGLE;
        skier.rotation.z += (targetLean - skier.rotation.z) * LEAN_SPEED * delta;

        animateSkier(elapsed, { boost: boostAmount, brake: brakeAmount });
        // Tuck/snowplow biases stack on top of the baseline animateSkier pose
        applySkierTuckPose(boostAmount);
        applySkierSnowplowPose(brakeAmount);
        snowTrails.update(getSkiTrailContacts(skiTrailContacts), brakeAmount);

        // Death checks in priority order: edge slip > obstacle > avalanche
        if (Math.abs(skier.position.x) > PLAY_HALF_X) {
            beginEdgeFall();
        }
        else {
            const collision = checkSkierCollision(skier.position, chunks);
            if (collision) {
                beginCollisionFall(collision);
            } else if (avalancheGap <= GAP_DEATH) {
                beginAvalancheFall();
            } else {
                const picked = checkCoinPickup(skier.position, chunks);
                if (picked > 0) playCoinPickup(picked);
            }
        }

        hud.innerHTML =
            'Score: ' + Math.floor(score) + ' m<br>' +
            'Speed: ' + gameSpeed.toFixed(1) + ' m/s<br>' +
            '<span style="color:#a8cce8; text-shadow:0 1px 3px rgba(0,0,0,0.75), 0 2px 6px rgba(0,0,0,0.45), 0 0 8px rgba(168,204,232,0.7);">&#10052;</span> ' +
            getRunCoins();
    }
    // -- Falling: edge slip, obstacle crash, or avalanche overrun --
    else if (gameState === 'falling') {
        fallTimer += delta;

        if (fallMode === 'edge') {
            fallVelY -= FALL_GRAVITY * delta;

            skier.position.y += fallVelY * delta;
            skier.position.x += fallDir  * FALL_LATERAL_PUSH * delta;

            skier.rotation.z += fallSpinZ * delta;
            skier.rotation.x += fallSpinX * delta;

            // Keep terrain moving so the world does not freeze during the fall
            updateTerrain(chunks, gameSpeed, delta, onChunkRecycle);

            if (fallTimer >= FALL_DURATION) showGameOver();
        } else if (fallMode === 'avalanche') {
            // Body pitches forward as if shoved from behind while the gap
            // collapses so the cloud overruns the camera at impact
            fallVelY -= AVALANCHE_FALL_DROP * delta;
            skier.position.y += fallVelY * delta;
            skier.position.z += fallVelZ * delta;

            if (skier.position.y < CRASH_GROUND_Y) {
                skier.position.y = CRASH_GROUND_Y;
                if (fallVelY < 0) fallVelY = 0;
            }

            const t = Math.min(1, fallTimer / AVALANCHE_FALL_DURATION);
            const eased = 1 - Math.pow(1 - t, 2);
            skier.rotation.x = fallStartRotX + AVALANCHE_FALL_PITCH * eased;

            // Force the gap to close before the overlay appears
            avalancheGap = Math.max(-3.0, avalancheGap - 14 * delta);

            // Slowed but continuing world motion preserves the dragged-along feel
            updateTerrain(chunks, gameSpeed * 0.6, delta, onChunkRecycle);
            gameSpeed *= Math.exp(-1.0 * delta);

            if (fallTimer >= AVALANCHE_FALL_DURATION) showGameOver();
        } else {
            fallVelY -= CRASH_GRAVITY * delta;

            skier.position.x += fallVelX * delta;
            skier.position.y += fallVelY * delta;
            skier.position.z += fallVelZ * delta;

            if (skier.position.y < CRASH_GROUND_Y) {
                skier.position.y = CRASH_GROUND_Y;
                if (fallVelY < 0) fallVelY = 0;
            }

            const crashT = Math.min(1, fallTimer / CRASH_DURATION);
            const easedCrashT = 1 - Math.pow(1 - crashT, 3);

            skier.rotation.x = fallStartRotX + CRASH_FORWARD_PITCH * easedCrashT;
            skier.rotation.y = fallStartRotY - fallDir * CRASH_TWIST * easedCrashT;
            skier.rotation.z = fallStartRotZ - fallDir * CRASH_SIDE_ROLL * easedCrashT;
            poseSkierForCrash(crashT, fallDir);
            keepCrashBodyAboveSnow();

            const drag = Math.exp(-CRASH_DRAG * delta);
            fallVelX *= drag;
            fallVelZ *= drag;

            // Bleed off speed but keep some chunk motion so the scenery does not freeze
            gameSpeed *= Math.exp(-CRASH_SPEED_DECAY * delta);
            updateTerrain(chunks, gameSpeed * 0.45, delta, onChunkRecycle);

            if (fallTimer >= CRASH_DURATION) showGameOver();
        }
    }

    updateReleasedEquipment(delta);

    // -- Day/night cycle keeps ticking, even on game over --
    const cycleT = getCycleT();

    // Sun target follows the skier so the shadow frustum stays centred
    sunTarget.position.set(skier.position.x, 0, skier.position.z);

    // Slide the mountain ring forward so the horizon never recedes
    updateScenery(sceneryRing, skier.position.z);
    updateAvalanche(avalanche, skier.position, delta, now * 0.001, avalancheGap);

    // Hide speed lines in the front-facing cam and during any fall
    const showStreaks = (gameState === 'playing' && camMode !== 2);
    updateSpeedLines(delta, showStreaks ? gameSpeed : 0);

    updateCycle(cycleT);

    if (blizzardFactor > 0.001 && tickBiome.fogFarOverride !== undefined) {
        scene.fog.near = THREE.MathUtils.lerp(scene.fog.near, tickBiome.fogNearOverride, blizzardFactor);
        scene.fog.far  = THREE.MathUtils.lerp(scene.fog.far,  tickBiome.fogFarOverride,  blizzardFactor);
        tmpBlizzardColor.setHex(tickBiome.fogColorOverride);
        scene.fog.color.lerp(tmpBlizzardColor, blizzardFactor);
        scene.background.lerp(tmpBlizzardColor, blizzardFactor);
    }

    const nightFactor = Math.max(0, 1.0 - sunLight.intensity / 1.0);

    updateCoins(chunks, now * 0.001, nightFactor);

    lanternMat.emissiveIntensity      = nightFactor * 1.5;
    lamppostBulbMat.emissiveIntensity = nightFactor * 2.5;

    updateFireflies(chunks, now * 0.001, nightFactor);
    updateBlizzard(delta, blizzardFactor, tickWindX);
    updateWindStreaks(delta, blizzardFactor);


    const gustStrength = (windGust.mode === 'gust' && windGust.peak > 0)
        ? Math.max(0, Math.min(1, Math.abs(tickWindX) / windGust.peak))
        : 0;
    updateGameAudio({
        gameState,
        gameSpeed,
        boostAmount,
        biomeName: tickBiome.name,
        nightFactor,
        blizzardFactor,
        windGustStrength: gustStrength,
    });

    if (nightFactor > 0) {
        // Lampposts sit higher and shine stronger than fence lanterns
        const litPositions = [];
        for (const chunk of chunks) {
            const obs = chunk.userData.obstacles || [];
            for (const ob of obs) {
                if (ob.mesh.userData.isLitFence) {
                    const wx = chunk.position.x + ob.localX;
                    const wz = chunk.position.z + ob.localZ;
                    const dx = skier.position.x - wx;
                    const dz = skier.position.z - wz;
                    litPositions.push({ x: wx, z: wz, y: 1.1, intensity: 4.0, color: 0xffaa44, dist: dx * dx + dz * dz });
                }
                if (ob.mesh.userData.isLamppost) {
                    const offsetX = ob.mesh.userData.lampOffsetX || 0;
                    const wx = chunk.position.x + ob.localX + offsetX;
                    const wz = chunk.position.z + ob.localZ;
                    const dx = skier.position.x - wx;
                    const dz = skier.position.z - wz;
                    litPositions.push({ x: wx, z: wz, y: 4.2, intensity: 6.0, color: 0xffaa44, dist: dx * dx + dz * dz });
                }
            }
            const ffl = chunk.userData.fireflyLightLocal;
            if (ffl) {
                const wx = chunk.position.x + ffl.x;
                const wz = chunk.position.z + ffl.z;
                const dx = skier.position.x - wx;
                const dz = skier.position.z - wz;
                litPositions.push({ x: wx, z: wz, y: ffl.y, intensity: 3.5, color: 0xffd060, dist: dx * dx + dz * dz });
            }
        }

        litPositions.sort((a, b) => a.dist - b.dist);

        for (let i = 0; i < NIGHT_LIGHT_COUNT; i++) {
            const pl = nightLights[i];
            if (i < litPositions.length) {
                const lp = litPositions[i];
                pl.position.set(lp.x, lp.y, lp.z);
                pl.color.setHex(lp.color);

                const target = nightFactor * lp.intensity;
                pl._fade += (target - pl._fade) * (1 - Math.exp(-3 * delta));
                pl.intensity = pl._fade;
            } else {
                pl._fade *= Math.exp(-3 * delta);
                pl.intensity = pl._fade;
            }
        }
    } else {
        // Daytime: fade all pool lights off smoothly
        for (let i = 0; i < NIGHT_LIGHT_COUNT; i++) {
            const pl = nightLights[i];
            pl._fade = (pl._fade ?? 0) * Math.exp(-6 * delta);
            pl.intensity = pl._fade;
        }
    }

    // -- Dynamic camera (3 modes with exponential smoothing) --
    // speedFactor is clamped so unbounded bonusSpeed cannot drift the camera away
    const speedFactor = Math.min(1, Math.max(0, (gameSpeed - SPEED_INITIAL) / 50));
    let targetPos, targetLook;

    if (gameState === 'menu') {
        if (shopActive) {
            // Frontal close-up so the player can read the items on the model
            targetPos  = { x: 0, y: 1.4, z: 3.4 };
            targetLook = { x: 0, y: 1.0, z: 0 };
        } else {
            // Low front-right: skier silhouettes against the sky
            targetPos  = { x: 3.0, y: 1.0, z: 3.5 };
            targetLook = { x: -1.8, y: 1.4, z: 0 };
        }
    } else if (gameState === 'intro' || camMode === 0) {
        // Behind
        targetPos  = { x: skier.position.x * 0.85,
                       y: 3.0 + speedFactor * 1.0,
                       z: -5.0 - speedFactor * 1.5 };
        targetLook = { x: skier.position.x * 0.6, y: 0.8, z: 4 };
    } else if (camMode === 1) {
        // First-person
        targetPos  = { x: skier.position.x, y: 1.2, z: 0.3 };
        targetLook = { x: skier.position.x, y: 0.8, z: 10 };
    } else {
        // Facing skier from the front
        targetPos  = { x: skier.position.x * 0.85,
                       y: 3.0 + speedFactor * 1.0,
                       z: 10 + speedFactor * 1.5 };
        targetLook = { x: skier.position.x, y: 0.8, z: 0 };
    }

    const smooth = 1 - Math.exp(-4 * delta);

    camera.position.x += (targetPos.x - camera.position.x) * smooth;
    camera.position.y += (targetPos.y - camera.position.y) * smooth;
    camera.position.z += (targetPos.z - camera.position.z) * smooth;

    // Smooth the lookAt target the same way so it never desyncs from position
    camLook.x += (targetLook.x - camLook.x) * smooth;
    camLook.y += (targetLook.y - camLook.y) * smooth;
    camLook.z += (targetLook.z - camLook.z) * smooth;
    camera.lookAt(camLook);

    renderer.render(scene, camera);
}

startMenuMode();
requestAnimationFrame(animate);
