import * as THREE from 'three';
import { skier, animateSkier } from './skier.js';
import {
    createTerrain, updateTerrain,
    CHUNK_LENGTH, CHUNK_WIDTH, PLAY_HALF_X
} from './terrain.js';
import { populateChunk, clearChunk, checkCollisions, lanternMat, lamppostBulbMat } from './obstacles.js';
import { createScenery, updateScenery } from './scenery.js';


// ============================================================
//  CONSTANTS
// ============================================================

const SPEED_INITIAL  = 14;
const SPEED_RAMP     = 0.4;
const LATERAL_SPEED  = 6;
// The flags mark the edge of the ridge -- crossing PLAY_HALF_X triggers the fall
// so we keep the reference in sync with terrain.js instead of duplicating it here.
const LATERAL_LIMIT  = PLAY_HALF_X;
const LEAN_ANGLE     = 0.18;
const LEAN_SPEED     = 6;
const SAFE_CHUNKS    = 2;

// Falling physics -- used while gameState === 'falling'. These are tuned
// so the fall reads as a dramatic slip off the ridge without the player
// having to wait long before the game-over screen appears.
const FALL_GRAVITY      = 22;   // downward acceleration, world units / s^2
const FALL_LATERAL_PUSH = 9;    // how fast the skier keeps sliding outward during the fall
const FALL_SPIN_SPEED   = 2.8;  // radians / s applied to the skier while tumbling
const FALL_DURATION     = 1.6;  // seconds before transitioning to gameover

// Full day/night cycle duration in seconds (~2 minutes)
const CYCLE_DURATION = 130;


// ============================================================
//  GAME STATE
// ============================================================

let score     = 0;
let elapsed   = 0;
let gameSpeed = SPEED_INITIAL;
// State machine: 'menu' -> 'playing' -> ('falling' ->)? 'gameover'.
// 'falling' is entered when the skier crosses one of the boundary flags;
// physics take over until the skier is well below the ridge, then we
// transition to 'gameover' and show the usual overlay.
let gameState = 'menu';
let lastTime  = performance.now();

// Tracked only while falling. fallTimer counts seconds elapsed since the
// crossing, fallVelY is the current downward velocity (gravity integrates
// it each frame), and fallDir records which side the skier fell off so
// the lateral drift keeps going in a consistent direction even if the
// player releases the arrow keys mid-fall.
let fallTimer  = 0;
let fallVelY   = 0;
let fallDir    = 0;

const keys = { left: false, right: false };

let camMode = 0;                    // 0 = behind, 1 = first-person, 2 = facing
const camLook = new THREE.Vector3(0, 0.8, 4);  // smoothed lookAt target


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

// Higher resolution shadow map to compensate for the large frustum
sunLight.shadow.mapSize.width  = 8192;
sunLight.shadow.mapSize.height = 8192;


sunLight.shadow.camera.near   = -200;
sunLight.shadow.camera.far    = 500;
sunLight.shadow.camera.left   = -150;
sunLight.shadow.camera.right  = 150;
sunLight.shadow.camera.top    = 150;
sunLight.shadow.camera.bottom = -150;

// The sun looks at this target, which follows the skier
const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
sunLight.target = sunTarget;

scene.add(sunLight);

// Pool of PointLights reused each frame. Instead of attaching a light
// to every lit obstacle (expensive), we keep a fixed pool and move
// them to whichever light sources are closest to the skier. The emissive
// materials handle the visual glow on all the others for free.
//
// Pool sized to cover every lit obstacle within fog + PointLight range
// (~170 units at night ≈ 3 chunks × ~6 lit obstacles). This way lights
// are already active before emerging from the fog — no visible pop
const NIGHT_LIGHT_COUNT = 20;
const nightLights = [];
for (let i = 0; i < NIGHT_LIGHT_COUNT; i++) {
    const pl = new THREE.PointLight(0xffaa44, 0, 28, 1.2);
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
// Phases (sorta):
//   0.00        night (deep dark)
//   0.05-0.10   dawn  (warm orange horizon)
//   0.10-0.60   day   (bright sky, full sun)
//   0.60-0.77   sunset (orange to red to purple)
//   0.77-0.88   dusk  (purple fading to dark)
//   0.88-1.00   night (wraps back to 0)
//
// Night is compressed to ~30s; day keeps its original duration.

// Each keyframe: { time, skyColor, sunColor, sunIntensity, ambientColor, ambIntensity, fogNear, fogFar }
// Colors stored as THREE.Color for easy lerp.
const CYCLE_KEYFRAMES = [
    { time: 0.00, skyColor: c(0x1a1a35), sunColor: c(0x445577), sunIntensity: 0.25, ambientColor: c(0x2a2a50), ambientIntensity: 0.40, fogNear: 20, fogFar: 140 },
    { time: 0.05, skyColor: c(0x252540), sunColor: c(0x556688), sunIntensity: 0.30, ambientColor: c(0x252545), ambientIntensity: 0.38, fogNear: 22, fogFar: 150 },
    { time: 0.10, skyColor: c(0xd48a5a), sunColor: c(0xffaa55), sunIntensity: 0.65, ambientColor: c(0x886655), ambientIntensity: 0.35, fogNear: 25, fogFar: 180 },
    { time: 0.20, skyColor: c(0x87ceeb), sunColor: c(0xfff5e0), sunIntensity: 1.10, ambientColor: c(0x8899bb), ambientIntensity: 0.55, fogNear: 38, fogFar: 260 },
    { time: 0.42, skyColor: c(0x87ceeb), sunColor: c(0xffffff), sunIntensity: 1.25, ambientColor: c(0x99aacc), ambientIntensity: 0.60, fogNear: 42, fogFar: 290 },
    { time: 0.60, skyColor: c(0x87ceeb), sunColor: c(0xffffff), sunIntensity: 1.20, ambientColor: c(0x8899bb), ambientIntensity: 0.58, fogNear: 40, fogFar: 280 },
    { time: 0.64, skyColor: c(0xddaa66), sunColor: c(0xffcc77), sunIntensity: 0.80, ambientColor: c(0x887755), ambientIntensity: 0.45, fogNear: 30, fogFar: 210 },
    { time: 0.68, skyColor: c(0xcc6633), sunColor: c(0xff5533), sunIntensity: 0.50, ambientColor: c(0x774433), ambientIntensity: 0.38, fogNear: 25, fogFar: 180 },
    { time: 0.73, skyColor: c(0x553344), sunColor: c(0x887766), sunIntensity: 0.30, ambientColor: c(0x443344), ambientIntensity: 0.33, fogNear: 22, fogFar: 160 },
    { time: 0.80, skyColor: c(0x2a2240), sunColor: c(0x556677), sunIntensity: 0.26, ambientColor: c(0x2a2244), ambientIntensity: 0.30, fogNear: 20, fogFar: 150 },
    { time: 0.94, skyColor: c(0x1e1e30), sunColor: c(0x445577), sunIntensity: 0.25, ambientColor: c(0x252545), ambientIntensity: 0.38, fogNear: 20, fogFar: 140 },
    { time: 1.00, skyColor: c(0x1a1a35), sunColor: c(0x445577), sunIntensity: 0.25, ambientColor: c(0x2a2a50), ambientIntensity: 0.40, fogNear: 20, fogFar: 140 },
];

// Helper: create a THREE.Color from a hex int
function c(hex) { return new THREE.Color(hex); }

// Temp colors used during interpolation (avoids allocations every frame)
const tmpSky = new THREE.Color();
const tmpSun = new THREE.Color();
const tmpAmb = new THREE.Color();




// Generates a radial gradient texture for the glow sprite
// White at the center, fully transparent at the edge
// The same as the snow textures in terrain.js
function makeGlowTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const center   = size / 2;

    // createRadialGradient(x0, y0, r0, x1, y1, r1)
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

// MeshBasicMaterial ignores all light sources and renders with flat color.
// This is correct for the sun and moon -- they are light sources themselves,
// not surfaces that receive light.
// fog:false keeps them visible at the large visual distance we render
// them at (beyond the mountain ring) -- without it the scene fog would
// fade them out entirely before they reach the camera.
// Radius is ~6x the original so the angular size stays comparable once
// the mesh is moved from ~80 to ~520 units away from the skier.
const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(15, 16, 16), // SphereGeometry(radius, widthSegments, heightSegments)
    new THREE.MeshBasicMaterial({ color: 0xffffaa, fog: false })
);
scene.add(sunMesh);

// SpriteMaterial always faces the camera regardless of scene orientation.
// AdditiveBlending adds the sprite's color on top of whatever is behind it,
// which is exactly how real lens glow works: it brightens, never darkens.
// depthWrite false prevents the transparent quad from writing to the depth
// buffer and occluding objects behind it.
const sunGlowMat = new THREE.SpriteMaterial({
    map:         glowTexture,
    color:       0xffdd66,
    blending:    THREE.AdditiveBlending,
    transparent: true,
    depthWrite:  false,
    fog:         false,
});
const sunGlow = new THREE.Sprite(sunGlowMat);
sunGlow.scale.set(170, 170, 1); // Sprite.scale(x, y, z) -- scaled up to match the far-away sun
scene.add(sunGlow);

// Moon is smaller and cooler in color temperature than the sun
const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 16), // SphereGeometry(radius, widthSegments, heightSegments)
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
moonGlow.scale.set(85, 85, 1); // Sprite.scale(x, y, z) -- smaller halo than the sun
scene.add(moonGlow);




// Find the two keyframes surrounding t and return the interpolated values
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


// Apply the cycle state to the scene lights, fog, and background.
// Also positions the sun in an arc across the sky.
function updateCycle(normalizedTime) {
    const state = sampleCycle(normalizedTime);

    // Sky and fog color
    scene.background.copy(state.skyColor);
    scene.fog.color.copy(state.skyColor);
    scene.fog.near = state.fogNear;
    scene.fog.far  = state.fogFar;

    // Ambient
    ambientLight.color.copy(state.ambientColor);
    ambientLight.intensity = state.ambientIntensity;

    // Sun color and intensity
    sunLight.color.copy(state.sunColor);
    sunLight.intensity = state.sunIntensity;

    // Sun orbit: the sun peaks at t=0.42 (midday) and dips below
    // the horizon at t=0.92 (midnight). Using cosine centered on
    // t=0.42 so cos(0) = 1 = highest point.
    const sunAngle = (normalizedTime - 0.42) * Math.PI * 2;
    const sunDist  = 80;
    const sunBaseY = 5;
    const sunAmp   = 65;   // how high above / below base the sun swings

    sunLight.position.set(
        Math.sin(sunAngle) * sunDist * 0.4,           // lateral drift (east-west sweep)
        sunBaseY + Math.cos(sunAngle) * sunAmp,        // arc: high at midday, low at night
        sunDist * 0.6                                  // always in front of the camera so the sun/moon are visible
    );

    // Offset the sun position relative to the skier so shadows follow the action
    sunLight.position.x += sunTarget.position.x;
    sunLight.position.z += sunTarget.position.z;

    // The VISUAL sun/moon meshes sit much further out than the directional
    // light. This is purely a rendering concern: if the mesh were at the
    // light's actual orbital distance (~80 units), it would appear BETWEEN
    // the skier and the mountain ring (inner radius 260) -- totally
    // breaking the sense of scale. Pushing the mesh to ~520 units places
    // the sun disc BEHIND the distant peaks, where it belongs.
    // The light itself stays close so the directional shadow camera
    // frustum stays tight over the play area (better shadow resolution).
    const visualDist = 520;
    const visualAmp  = 260;

    const sunVX = Math.sin(sunAngle) * visualDist * 0.4 + sunTarget.position.x;
    const sunVY = sunBaseY + Math.cos(sunAngle) * visualAmp;
    const sunVZ = visualDist * 0.6                     + sunTarget.position.z;

    sunMesh.position.set(sunVX, sunVY, sunVZ);
    sunGlow.position.set(sunVX, sunVY, sunVZ);

    // The moon orbits on the opposite side of the arc (half cycle out of phase).
    // We reuse the same orbital math as the sun but offset by PI radians.
    const moonAngle = sunAngle + Math.PI;
    const moonVX = Math.sin(moonAngle) * visualDist * 0.4 + sunTarget.position.x;
    const moonVY = sunBaseY + Math.cos(moonAngle) * visualAmp;
    const moonVZ = visualDist * 0.6                      + sunTarget.position.z;

    moonMesh.position.set(moonVX, moonVY, moonVZ);
    moonGlow.position.set(moonVX, moonVY, moonVZ);

    // Fade each body in and out based on how day-like the moment is.
    // sunLight.intensity is already interpolated by the keyframes, so it
    // serves as a proxy: high = day, low = night.
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

scene.add(skier);

const chunks = createTerrain(scene);

for (let i = SAFE_CHUNKS; i < chunks.length; i++) {
    populateChunk(chunks[i], CHUNK_LENGTH, CHUNK_WIDTH, 0, false);
}

// Background mountain ring. Created once; the main loop only has to
// slide it along Z every frame so it tracks the skier's progress.
const sceneryRing = createScenery(scene);


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
    'align-items:center; justify-content:center; background:rgba(0,0,0,0.55);' +
    'color:#fff; font-family:sans-serif; z-index:20; pointer-events:none;' +
    'opacity:0; transition:opacity 0.4s;';
overlay.innerHTML =
    '<div style="font-size:48px; font-weight:bold; margin-bottom:12px;">GAME OVER</div>' +
    '<div id="go-score" style="font-size:22px; margin-bottom:24px;"></div>' +
    '<div style="font-size:16px; opacity:0.8;">Press R to restart</div>';
document.body.appendChild(overlay);


// ============================================================
//  MAIN MENU OVERLAY
// ============================================================
//
// The menu is a DOM overlay following the same pattern as the HUD and
// game-over overlay above. 

// Inject CSS keyframes into the document <head>
const menuStyleSheet = document.createElement('style');
menuStyleSheet.textContent = `
    @keyframes snowfall {
        0%   { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
        10%  { opacity: 1; }
        90%  { opacity: 0.8; }
        100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
    }
    @keyframes pulseText {
        0%, 100% { opacity: 0.5; }
        50%      { opacity: 1.0; }
    }
    @keyframes snowflakeSpin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
    }
`;
document.head.appendChild(menuStyleSheet);

// Full-screen container -- flex centering for the title block
const menuOverlay = document.createElement('div');
menuOverlay.style.cssText =
    'position:fixed; inset:0; display:flex; flex-direction:column;' +
    'align-items:center; justify-content:center;' +
    'background:linear-gradient(180deg, rgba(10,12,30,0.88) 0%, rgba(20,35,70,0.78) 100%);' +
    'z-index:30; overflow:hidden; transition:opacity 0.8s;';

// ---- Title: "ECHOES OF" ----
const titleLine1 = document.createElement('div');
titleLine1.style.cssText =
    'font-family:Georgia,serif; font-size:clamp(18px,4vw,32px);' +
    'letter-spacing:10px; color:#c0d0e8; opacity:0.8;' +
    'text-shadow:0 0 15px rgba(140,180,255,0.4); user-select:none;';
titleLine1.textContent = 'ECHOES OF';
menuOverlay.appendChild(titleLine1);


const titleLine2 = document.createElement('div');
titleLine2.style.cssText =
    'font-family:Georgia,serif; font-size:clamp(48px,12vw,96px);' +
    'font-weight:bold; letter-spacing:14px; color:#e4edf5;' +
    'text-shadow:0 0 30px rgba(150,200,255,0.5), 0 2px 6px rgba(0,0,0,0.8);' +
    'margin-top:4px; user-select:none;';
titleLine2.innerHTML =
    'SN<span style="display:inline-block; color:#a8cce8;' +
    'animation:snowflakeSpin 10s linear infinite;' +
    'text-shadow:0 0 18px rgba(160,200,255,0.7);">&#10052;</span>W';
menuOverlay.appendChild(titleLine2);

// ---- "Press ENTER to start"  ----
const startPrompt = document.createElement('div');
startPrompt.style.cssText =
    'margin-top:48px; font-family:sans-serif; font-size:clamp(12px,2vw,18px);' +
    'color:#a0b8d0; letter-spacing:4px;' +
    'animation:pulseText 2.5s ease-in-out infinite; user-select:none;';
startPrompt.textContent = 'PRESS SPACE TO START';
menuOverlay.appendChild(startPrompt);

// ---- Controls hint at the bottom of the screen ----
const controlsHint = document.createElement('div');
controlsHint.style.cssText =
    'position:absolute; bottom:32px; font-family:monospace;' +
    'font-size:clamp(10px,1.4vw,14px); color:#7890a8; opacity:0.6;' +
    'letter-spacing:2px; text-align:center; user-select:none;';
controlsHint.innerHTML =
    'A / &#8592; &mdash; Move Left &nbsp;&nbsp;&nbsp;' +
    'D / &#8594; &mdash; Move Right &nbsp;&nbsp;&nbsp;' +
    'T &mdash; Camera';
menuOverlay.appendChild(controlsHint);


const MENU_SNOWFLAKE_COUNT = 35;
for (let i = 0; i < MENU_SNOWFLAKE_COUNT; i++) {
    const flake = document.createElement('div');
    const size     = 6 + Math.random() * 14;
    const opacity  = 0.1 + Math.random() * 0.25;
    const duration = 6 + Math.random() * 12;
    const delay    = Math.random() * duration;
    flake.textContent = '\u2744'; // Unicode snowflake U+2744
    flake.style.cssText =
        'position:absolute; pointer-events:none;' +
        'color:rgba(200,220,255,' + opacity + ');' +
        'font-size:' + size + 'px;' +
        'left:' + (Math.random() * 100) + '%;' +
        'animation:snowfall ' + duration + 's linear ' + delay + 's infinite;';
    menuOverlay.appendChild(flake);
}

document.body.appendChild(menuOverlay);


// ============================================================
//  INPUT HANDLING
// ============================================================

document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft')  keys.left  = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'KeyT') { camMode = (camMode + 1) % 3; }
    if (e.code === 'Space' && gameState === 'menu')     startGame();
    if (e.code === 'KeyR'  && gameState === 'gameover') restartGame();
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
    // 0.12 makes it so that the game starts in the morning instead as of starting at night
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


// Transitions from the menu screen to active gameplay.
// Resets lastTime so the first frame delta is near zero (avoids
// a large jump caused by time spent on the menu).
function startGame() {
    gameState = 'playing';
    lastTime  = performance.now();
    menuOverlay.style.opacity       = '0';
    menuOverlay.style.pointerEvents = 'none';
    hud.style.display = 'block';
}


function restartGame() {
    skier.position.set(0, 0, 0);
    skier.rotation.set(0, 0, 0);

    // Reset state BEFORE repopulating so chunks use score = 0
    elapsed   = 0;
    score     = 0;
    gameSpeed = SPEED_INITIAL;
    lastTime  = performance.now();

    // Clear any leftover falling state from the previous run
    fallTimer = 0;
    fallVelY  = 0;
    fallDir   = 0;

    for (let i = 0; i < chunks.length; i++) {
        clearChunk(chunks[i]);
        chunks[i].position.set(0, 0, i * CHUNK_LENGTH);
        if (i >= SAFE_CHUNKS) {
            populateChunk(chunks[i], CHUNK_LENGTH, CHUNK_WIDTH, score, isNightTime());
        }
    }

    camera.position.set(0, 3, -5);
    camLook.set(0, 0.8, 4);
    camMode = 0;
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

        // Lateral movement. No hard clamp -- the skier is allowed to cross
        // the boundary flags so the fall can be triggered by the overshoot.
        if (keys.left)  skier.position.x += LATERAL_SPEED * delta;
        if (keys.right) skier.position.x -= LATERAL_SPEED * delta;

        // Lean into turns
        let targetLean = 0;
        if (keys.left)  targetLean =  LEAN_ANGLE;
        if (keys.right) targetLean = -LEAN_ANGLE;
        skier.rotation.z += (targetLean - skier.rotation.z) * LEAN_SPEED * delta;

        animateSkier(elapsed);

        // Boundary check: crossing either flag line triggers the fall.
        // Done before collision so a skier that overshoots exactly at a
        // boundary obstacle still falls instead of colliding.
        if (Math.abs(skier.position.x) > LATERAL_LIMIT) {
            gameState = 'falling';
            fallTimer = 0;
            fallVelY  = 0;
            fallDir   = Math.sign(skier.position.x);   // +1 right, -1 left
        }
        // Collision
        else if (checkCollisions(skier.position, chunks)) {
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
    // -- Falling: the skier has crossed a boundary flag --
    // Physics: constant lateral push outward + gravity on y + tumbling
    // rotation. Terrain keeps moving so the camera still reads as
    // in-motion. After FALL_DURATION we switch to 'gameover'.
    else if (gameState === 'falling') {
        fallTimer += delta;
        fallVelY  -= FALL_GRAVITY * delta;   // gravity integrates velocity

        skier.position.y += fallVelY * delta;
        skier.position.x += fallDir  * FALL_LATERAL_PUSH * delta;

        // Tumble: roll sideways (Z) and pitch forward (X) for a
        // dramatic "lost control" look
        skier.rotation.z += -fallDir * FALL_SPIN_SPEED * delta;
        skier.rotation.x +=  FALL_SPIN_SPEED * 0.7     * delta;

        // Keep terrain + cycle moving so the world around the fall feels alive
        updateTerrain(chunks, gameSpeed, delta, onChunkRecycle);

        if (fallTimer >= FALL_DURATION) {
            gameState = 'gameover';
            document.getElementById('go-score').textContent =
                'Score: ' + Math.floor(score) + ' m';
            overlay.style.opacity = '1';
        }
    }

    // -- Day/night cycle (always ticks, even on game over) --
    const cycleT = getCycleT();

    // Sun target follows the skier so the shadow frustum stays centered
    sunTarget.position.set(skier.position.x, 0, skier.position.z);

    // Keep the mountain ring centred on the player's forward position
    // so the horizon appears infinite regardless of how far the skier goes.
    updateScenery(sceneryRing, skier.position.z);

    updateCycle(cycleT);

    // Night lights follow the skier. Their intensity is the inverse of
    // the sun: when the sun drops below 0.5, they start fading in.
    const nightFactor = Math.max(0, 1.0 - sunLight.intensity / 0.5);

    // Fade the emissive materials in sync with the pool lights.
    // During daytime nightFactor is 0 so emissive turns off completely;
    // at full night it reaches 1.0 and emissive is at full strength.
    // This guarantees that whenever a lantern or bulb *looks* lit,
    // the pool lights are also active -- no more glowing without light.
    lanternMat.emissiveIntensity      = nightFactor * 1.5;
    lamppostBulbMat.emissiveIntensity = nightFactor * 2.5;

    if (nightFactor > 0) {
        // Collect world positions of all lit obstacles (fences and lampposts).
        // Lampposts get a higher Y and stronger intensity than fences
        // because their bulb sits at ~4.2 units, far above fence lanterns.
        const litPositions = [];
        for (const chunk of chunks) {
            const obs = chunk.userData.obstacles || [];
            for (const ob of obs) {
                if (ob.mesh.userData.isLitFence) {
                    const wx = chunk.position.x + ob.localX;
                    const wz = chunk.position.z + ob.localZ;
                    const dx = skier.position.x - wx;
                    const dz = skier.position.z - wz;
                    litPositions.push({ x: wx, z: wz, y: 1.1, intensity: 4.0, dist: dx * dx + dz * dz });
                }
                if (ob.mesh.userData.isLamppost) {
                    const offsetX = ob.mesh.userData.lampOffsetX || 0;
                    const wx = chunk.position.x + ob.localX + offsetX;
                    const wz = chunk.position.z + ob.localZ;
                    const dx = skier.position.x - wx;
                    const dz = skier.position.z - wz;
                    litPositions.push({ x: wx, z: wz, y: 4.2, intensity: 6.0, dist: dx * dx + dz * dz });
                }
            }
        }

        // Sort by distance to skier, closest first
        litPositions.sort((a, b) => a.dist - b.dist);

        // Assign pool lights to the nearest lit obstacles.
        // Intensity fades in/out smoothly so lights don't "pop" when
        // an obstacle enters or leaves the closest-10 list.
        for (let i = 0; i < NIGHT_LIGHT_COUNT; i++) {
            const pl = nightLights[i];
            if (i < litPositions.length) {
                const lp = litPositions[i];
                pl.position.set(lp.x, lp.y, lp.z);

                // Exponential ease toward target (frame-rate independent)
                // The PointLight's own distance/decay handles spatial
                // falloff — we only smooth the on/off transition here
                const target = nightFactor * lp.intensity;
                pl._fade = (pl._fade ?? 0) + (target - (pl._fade ?? 0)) * (1 - Math.exp(-3 * delta));
                pl.intensity = pl._fade;
            } else {
                // Fade out unused lights
                pl._fade = (pl._fade ?? 0) * Math.exp(-3 * delta);
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

    // -- Dynamic camera (3 modes, smooth transitions) --
    // Uses exponential damping: 1 - e^(-speed * dt) gives a frame-rate
    // independent smoothing factor that feels identical at 30 or 144 fps.
    const speedFactor = (gameSpeed - SPEED_INITIAL) / 30;
    let targetPos, targetLook;

    if (camMode === 0) {
        // Behind (original)
        targetPos  = { x: skier.position.x * 0.85,
                       y: 3.0 + speedFactor * 1.8,
                       z: -5.0 - speedFactor * 2.5 };
        targetLook = { x: skier.position.x * 0.6, y: 0.8, z: 4 };
    } else if (camMode === 1) {
        // First-person
        targetPos  = { x: skier.position.x, y: 1.2, z: 0.3 };
        targetLook = { x: skier.position.x, y: 0.8, z: 10 };
    } else {
        // Facing skier (from the front)
        targetPos  = { x: skier.position.x * 0.85,
                       y: 3.0 + speedFactor * 1.8,
                       z: 10 + speedFactor * 2.5 };
        targetLook = { x: skier.position.x, y: 0.8, z: 0 };
    }

    // Frame-rate independent damping (higher = snappier, ~4 gives a smooth glide)
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

requestAnimationFrame(animate);