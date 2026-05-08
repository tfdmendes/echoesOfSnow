import * as THREE from 'three';
import {
    skier, animateSkier,
    poseSkierForCrash, releaseSkierEquipment,
    resetSkierEquipment, resetSkierPose,
    updateReleasedEquipment,
    applySkierTuckPose, applySkierSnowplowPose
} from './skier.js';
import {
    createTerrain, updateTerrain,
    CHUNK_LENGTH, CHUNK_WIDTH, PLAY_HALF_X
} from './terrain.js';
import { populateChunk, clearChunk, lanternMat, lamppostBulbMat } from './obstacles.js';
import { checkSkierCollision } from './collision.js';
import { createScenery, updateScenery } from './scenery.js';
import { createAvalanche, updateAvalanche, FRONT_DISTANCE } from './avalanche.js';


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

// Obstacle crash response. These are still lightweight kinematics, not a
// full physics simulation: the collision system gives us an impact normal,
// then we integrate a short slide/tumble and detach the equipment for visual
// feedback. This keeps the CPU cost close to the original game loop.
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

// Full day/night cycle duration in seconds (~2 minutes)
const CYCLE_DURATION = 130;

// ---- Speed control: tuck (W) and snowplow (S) ----
// The two inputs are deliberately asymmetric:
//   W  -- permanent acquisition. While held, bonusSpeed accumulates and
//         persists for the rest of the run. Releasing the key does NOT
//         give that speed back; the player's investment is preserved.
//   S  -- transient brake. Subtracts a constant amount from the effective
//         speed only while held; releasing instantly restores full speed.
// The asymmetry produces the strategic loop: tuck early to bank speed,
// then spend that buffer on snowplow when obstacles demand caution.
// Boost acceleration uses a non-linear ramp instead of a constant rate.
// Pressing W does not slam bonusSpeed up at full power -- the acceleration
// itself ramps up over BOOST_RAMP_TIME so the gain feels like the skier
// progressively building momentum into the tuck. Curve is quadratic, so
// the very first frames give almost no boost, then the rate climbs:
//   accel(t) = INITIAL + (PEAK - INITIAL) * (t / RAMP_TIME)^2
// Releasing W (or activating S) resets the hold timer to zero, so a
// tap-tap pattern never accumulates the ramp.
const BOOST_ACCEL_INITIAL = 1.0;    // m/s^2 -- gentle kick on first contact
const BOOST_ACCEL_PEAK    = 4.0;    // m/s^2 -- top rate after the ramp completes
const BOOST_RAMP_TIME     = 1.5;    // seconds to reach the peak rate
// Lateral movement is impeded while tucking. Committing to W trades
// agility for speed: at full boost, lateral speed is reduced by this
// fraction of LATERAL_SPEED, making A/D dodging visibly harder.
const LATERAL_W_PENALTY   = 0.65;   // 0..1; full boost cuts lateral speed by this fraction
// Brake is multiplicative on the full speed (baseSpeed + bonusSpeed). An
// additive constant lost its bite once bonusSpeed grew unbounded -- 8 m/s
// off 60 m/s is barely felt -- so a percentage cut keeps the snowplow
// feeling like a real brake at any speed: full S always halves whatever
// speed the player has accumulated.
const BRAKE_FACTOR      = 0.50;     // 0..1; full S reduces effective speed by this fraction
// Persistent cost of braking. While S is held, bonusSpeed is shaved at
// this rate, so releasing the brake leaves the player slightly slower
// than they were before. The decay is gated by brakeAmount so it follows
// the same fade-in curve as the multiplicative speed cut.
const BRAKE_DECAY_RATE  = 6.0;      // m/s of bonusSpeed lost per second of full braking
const SPEED_FLOOR       = SPEED_INITIAL * 0.5; // never let the player effectively stop
const INPUT_SMOOTHING   = 6.0;      // exponential smoothing rate (1/s) for boost/brake POSE amounts

// ---- Avalanche gap (damped spring / rubber-band model) ----
// The gap is intentionally decoupled from the speed integral. If it were
// a strict integral of (gameSpeed - baseSpeed), a player who held W long
// enough would bank enough bonusSpeed to permanently outrun the avalanche
// and the snowplow brake would become cosmetic. Instead the gap behaves
// like a spring anchored at GAP_DEFAULT:
//   * W applies an outward push proportional to boostAmount
//   * S applies an inward pull proportional to brakeAmount
//   * A restoring force biases the gap toward GAP_DEFAULT regardless
// While sustained-tucking the equilibrium settles at GAP_DEFAULT +
// GAP_BOOST_RATE / GAP_PULL_FACTOR (a few metres of margin), bounded by
// the spring rather than by GAP_MAX. S then always has a real effect on
// the gap, no matter how long the player has been tucking.
//
// This is an arcade concession: bonusSpeed is still permanent for
// gameSpeed / score / terrain scrolling, but the avalanche is not
// "fooled" by accumulated speed -- it adapts to maintain pressure.
const GAP_DEFAULT      = FRONT_DISTANCE;  // resting gap (also the spring anchor)
const GAP_MAX          = 28.0;            // hard visual clip on the spring; sized to fit the W equilibrium with headroom
const GAP_DEATH        = 2.0;             // crossing this triggers the avalanche fall
// Tuned so W reaches a margin of ~7.5 m within the first second of holding
// the key (75 % above default), with a sustained equilibrium at roughly
// 27 m -- nearly three times the default distance. The pull factor stays
// soft enough that the spring does not aggressively snap the gap back
// while W is held, but stiff enough that releasing W returns the gap to
// default in a couple of seconds.
const GAP_BOOST_RATE   = 10.0;            // outward force at full boost (m/s)
const GAP_BRAKE_RATE   = 10.0;            // inward force at full brake (m/s)
const GAP_PULL_FACTOR  = 0.6;             // restoring force per metre of displacement (1/s)

// ---- Avalanche-fall (death by being overrun) ----
const AVALANCHE_FALL_DURATION   = 1.4;
const AVALANCHE_FALL_PUSH       = 6.0;    // forward push while being engulfed
const AVALANCHE_FALL_DROP       = 9.0;    // gravity for the topple
const AVALANCHE_FALL_PITCH      = 1.1;    // how far the body pitches forward

// ---- Speed lines (UI overlay) ----
// Anime / racing-game style streaks rendered onto a 2D canvas overlay
// stacked above the WebGL viewport. The implementation follows the
// "comet particle" model used in production speed-line effects:
//   * each streak is an independent particle with its own life cycle,
//     not a slot in a fixed-position pool;
//   * each particle is drawn as a gradient stroke that fades from
//     transparent at the tail to opaque at the head, producing the
//     bullet/comet shape that conveys speed without looking like rigid
//     pencil lines;
//   * a sine-shaped life envelope (alpha = sin(pi * t)) makes every
//     streak fade in at birth and fade out at death, eliminating pops;
//   * spawn radius is anchored to the OUTER ring of the viewport (in
//     screen space, not polar space), so the streaks form a peripheral
//     vignette that frames the action instead of cluttering the centre
//     of the screen. The drift direction still points radially outward
//     so the field reads as forward motion;
//   * visibility is gated by the smoothed boost amount, so streaks only
//     appear while the player is actively tucking (W). They fade in and
//     out with W press/release thanks to the input smoothing.
//
// Approach inspired by canonical canvas examples of anime speed lines
// (e.g. CodePen "Anime/Manga Speed lines" by jsonyeung).
const SPEED_LINE_COUNT          = 28;       // pool size; subtle density
const SPEED_LINE_THRESHOLD_LO   = SPEED_INITIAL * 1.3;   // below this no streaks render at all (~18 m/s)
const SPEED_LINE_THRESHOLD_HI   = SPEED_INITIAL * 3.5;   // at and above this the field is at full strength (~49 m/s)
const SPEED_LINE_MAX_OPACITY    = 0.50;     // peak per-line alpha multiplier at THRESHOLD_HI
const SPEED_LINE_OPACITY_CURVE  = 1.3;      // exponent on the speed factor (>1 = slow onset, sharp climb)
const SPEED_LINE_MOTION_GAIN    = 9.0;      // px/s per (m/s) of gameSpeed -- base outward drift rate
const SPEED_LINE_LIFE_MIN       = 0.30;     // shortest streak lifetime (s)
const SPEED_LINE_LIFE_MAX       = 0.85;     // longest streak lifetime (s)
const SPEED_LINE_TAIL_MIN       = 28;       // shortest tail length (px)
const SPEED_LINE_TAIL_MAX       = 85;       // longest tail length (px)
const SPEED_LINE_WIDTH_MIN      = 0.8;      // thinnest stroke (px)
const SPEED_LINE_WIDTH_MAX      = 1.8;      // thickest stroke (px)
// Spawn radius is expressed as a fraction of the distance from the screen
// centre to the viewport edge ALONG THE PARTICLE'S OWN RADIAL DIRECTION.
// This keeps spawns inside the visible rectangle regardless of aspect ratio
// and confines streaks to the peripheral vignette band.
const SPEED_LINE_RADIUS_INNER   = 0.55;
const SPEED_LINE_RADIUS_OUTER   = 0.92;
const SPEED_LINE_SPEED_MUL_MIN  = 0.70;     // per-line variation on outward drift speed
const SPEED_LINE_SPEED_MUL_MAX  = 1.30;


// ============================================================
//  GAME STATE
// ============================================================

let score     = 0;
let elapsed   = 0;
let gameSpeed = SPEED_INITIAL;
// State machine: 'menu' -> 'playing' -> ('falling' ->)? 'gameover'.
// 'falling' covers both boundary slips and obstacle crashes; a fall mode
// selects whether we use the steep edge drop or the shorter crash slide
// before transitioning to 'gameover' and showing the usual overlay.
let gameState = 'menu';
let lastTime  = performance.now();

// Tracked only while falling. fallTimer counts seconds elapsed since the
// fall started, fallVel* store the current kinematic velocities, and fallDir
// records which side the skier fell toward so the tumble remains consistent
// even if the player releases the arrow keys mid-fall.
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

// Smoothed pose intensities (0-1). The raw key state is binary, but the
// visual pose blending and the brake force read these continuous values so
// transitions stay visually smooth. The PERMANENT speed accumulation uses
// the raw keys directly -- there is no need to smooth a one-way integrator.
let boostAmount = 0;
let brakeAmount = 0;

// Permanent speed accumulator. Built up by W, never decays during a run,
// reset only when the player restarts. Adds on top of the natural baseSpeed
// ramp, so the player's tucking investment persists indefinitely.
let bonusSpeed = 0;

// Continuous time W has been held (with no S). Drives the non-linear
// boost-acceleration ramp: the longer it grows, the harder bonusSpeed
// accumulates, until it caps at BOOST_RAMP_TIME. Resets to zero on any
// release of W or activation of S.
let boostHoldTime = 0;

// Avalanche gap state. Evolves with the speed differential each frame.
// During an avalanche fall it is forced rapidly toward 0 to drive the
// visual catch-up.
let avalancheGap = GAP_DEFAULT;

let camMode = 0;                    // 0 = behind, 1 = first-person, 2 = facing
const camLook = new THREE.Vector3(0, 0.8, 4);  // smoothed lookAt target
const skierBounds = new THREE.Box3();


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

// Soft powder cloud behind the skier. Its layered transparency reads as a
// cloud while still masking chunk recycling when the camera faces uphill.
const avalanche = createAvalanche(scene);


// ============================================================
//  SPEED LINES (UI overlay -- 2D canvas above the WebGL viewport)
// ============================================================
//
// A full-screen <canvas> sits above the renderer. Every frame we clear it
// and stroke a small set of radial streaks emanating from the centre.
// Implementing this as a UI layer (instead of three.js meshes parented to
// the skier) anchors the streaks to the player's view rather than to any
// scene geometry, so they read as raw motion perception -- the way speed
// lines work in racing games and anime panels.
//
// The pool is pre-allocated. Each frame we update a radial coordinate
// per line and stroke it; the cost is one clearRect plus N short stroke
// calls, which is dramatically cheaper than the equivalent three.js draw
// calls would be.

const speedLineCanvas = document.createElement('canvas');
// z-index sits between the WebGL canvas (no explicit z-index, default
// stacking) and the HUD (z-index 10). The game-over overlay (20) and menu
// (30) cover the streaks naturally when they are visible.
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

// Pre-allocated particle pool. Each line is a self-contained particle
// (position, direction, life, randomized appearance). When its life
// elapses it respawns at a fresh random position. This is the standard
// shape of anime-style speed-line effects: many independent ephemeral
// streaks rather than a rigid grid sliding past the viewport.
function respawnSpeedLine(line) {
    const cx = speedLineCanvas.width  / 2;
    const cy = speedLineCanvas.height / 2;

    // Pick an outward radial direction first.
    const angle = Math.random() * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    // Anisotropic edge distance: how far we can travel from the centre
    // along (dx, dy) before crossing the viewport boundary. Clipping the
    // spawn fraction to this rather than to the half-diagonal keeps every
    // particle inside the visible rectangle, regardless of aspect ratio,
    // and makes "outer 55-92%" mean the same thing on every side.
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
        // Stratified per-line activation: line 0 turns on first, line N-1
        // last. As gameSpeed climbs from THRESHOLD_LO to HI more lines
        // unlock, so the visible density tracks the player's speed
        // instead of being a fixed count. Small jitter prevents a
        // visible "ladder" of streaks switching on at round speed values.
        activationSpeed: SPEED_LINE_THRESHOLD_LO
            + (i / Math.max(1, SPEED_LINE_COUNT - 1))
              * (SPEED_LINE_THRESHOLD_HI - SPEED_LINE_THRESHOLD_LO)
            + (Math.random() - 0.5) * 1.5
    };
    respawnSpeedLine(line);
    // Spread initial life phases so the field appears already populated
    // on the first frame rather than every streak being newborn at once.
    line.life = Math.random();
    speedLines.push(line);
}

function updateSpeedLines(delta, currentSpeed) {
    const ctx = speedLineCtx;
    ctx.clearRect(0, 0, speedLineCanvas.width, speedLineCanvas.height);

    // Visibility is now keyed off the absolute gameSpeed: streaks only
    // appear once the player crosses THRESHOLD_LO, and reach full
    // strength at THRESHOLD_HI. The exponent biases the curve so the
    // onset is subtle and the climb sharpens at higher speeds, which
    // matches how the perception of speed actually scales.
    const linearFactor = Math.max(0, Math.min(1,
        (currentSpeed - SPEED_LINE_THRESHOLD_LO) /
        (SPEED_LINE_THRESHOLD_HI - SPEED_LINE_THRESHOLD_LO)
    ));
    const speedFactor = Math.pow(linearFactor, SPEED_LINE_OPACITY_CURVE);
    if (speedFactor <= 0.001) return;

    // Motion rate also tracks gameSpeed: streaks drift slowly at the
    // bottom of the visible range and tear past at high speed.
    const baseStep = currentSpeed * SPEED_LINE_MOTION_GAIN * delta;
    ctx.lineCap = 'round';

    for (const line of speedLines) {
        // Per-line gating: a streak is dormant until gameSpeed clears
        // its activationSpeed. Density rises with absolute speed.
        if (currentSpeed <= line.activationSpeed) continue;

        line.life += delta / line.lifeDuration;
        if (line.life >= 1) {
            respawnSpeedLine(line);
            continue;
        }

        line.x += line.dirX * baseStep * line.speedMul;
        line.y += line.dirY * baseStep * line.speedMul;

        // Sine envelope on life: 0 at birth, peaks at mid-life, 0 at
        // death. This is the cleanest way to fade a particle in and out
        // smoothly without an explicit two-phase ramp.
        const lifeFade = Math.sin(line.life * Math.PI);
        const headAlpha = lifeFade * line.baseAlpha
            * speedFactor * SPEED_LINE_MAX_OPACITY;
        if (headAlpha < 0.01) continue;

        // Tail anchor sits BEHIND the head along the inverse motion
        // vector. The gradient runs transparent (tail) -> bright (head),
        // producing a comet/bullet streak that visually points in the
        // direction of travel.
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
    'A / &#8592; &mdash; Left &nbsp;&nbsp;&nbsp;' +
    'D / &#8594; &mdash; Right &nbsp;&nbsp;&nbsp;' +
    'W / &#8593; &mdash; Tuck (faster) &nbsp;&nbsp;&nbsp;' +
    'S / &#8595; &mdash; Snowplow (brake) &nbsp;&nbsp;&nbsp;' +
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
    if (e.code === 'KeyW' || e.code === 'ArrowUp')    keys.boost = true;
    if (e.code === 'KeyS' || e.code === 'ArrowDown')  keys.brake = true;
    if (e.code === 'KeyT') { camMode = (camMode + 1) % 3; }
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

function showGameOver() {
    gameState = 'gameover';
    document.getElementById('go-score').textContent =
        'Score: ' + Math.floor(score) + ' m';
    overlay.style.opacity = '1';
}

function beginEdgeFall() {
    gameState = 'falling';
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

function beginCollisionFall(collision) {
    const impactSide = Math.abs(collision.normalX) > 0.08
        ? Math.sign(collision.normalX)
        : (skier.rotation.z >= 0 ? 1 : -1);

    gameState = 'falling';
    fallMode  = 'collision';
    fallTimer = 0;
    fallDir   = impactSide;

    // Push away from the obstacle normal, but preserve downhill momentum.
    // In this scene +Z is the skier's forward/downhill direction because
    // terrain chunks scroll backward along -Z during normal play.
    const forwardProjection = Math.min(
        CRASH_FORWARD_MAX,
        CRASH_FORWARD_BASE + gameSpeed * CRASH_FORWARD_SCALE
    );
    fallVelX = collision.normalX * CRASH_SIDE_PUSH + impactSide * 1.2;
    fallVelY = CRASH_LAUNCH_UP;
    fallVelZ = forwardProjection + collision.normalZ * CRASH_NORMAL_Z_PUSH;

    // Obstacle crashes are posed as a controlled loss of balance, not a
    // free-spinning ragdoll. The equipment flies off; the body stays a
    // connected skier-shaped rig.
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

// Triggered when the avalanche gap collapses below GAP_DEATH. The skier
// is overrun: we forward-pitch the body as if hit from behind and let the
// existing fall update integrate the rest. The gap is then forced toward
// zero in the main loop so the cloud visibly engulfs the skier instead of
// staying parked at its resting position.
function beginAvalancheFall() {
    gameState = 'falling';
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
    resetSkierPose();
    resetSkierEquipment();

    // Reset state BEFORE repopulating so chunks use score = 0
    elapsed   = 0;
    score     = 0;
    gameSpeed = SPEED_INITIAL;
    lastTime  = performance.now();

    // Clear any leftover falling state from the previous run
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

    // Reset speed-control state so a fresh run does not inherit residual
    // boost/brake or accumulated bonus from the dying frames of the
    // previous run.
    keys.boost = false;
    keys.brake = false;
    boostAmount = 0;
    brakeAmount = 0;
    bonusSpeed = 0;
    boostHoldTime = 0;
    avalancheGap = GAP_DEFAULT;

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

        // Smoothed pose intensities. These drive the visual lean (tuck) and
        // wedge (snowplow) blends, plus the brake force. Snowplow wins on
        // conflict: the player cannot physically be both tucked and in a
        // wedge stance at the same time, so we collapse the boost target
        // to zero while S is held.
        const boostTarget = (keys.boost && !keys.brake) ? 1.0 : 0.0;
        const brakeTarget = keys.brake ? 1.0 : 0.0;
        const smooth = 1 - Math.exp(-INPUT_SMOOTHING * delta);
        boostAmount += (boostTarget - boostAmount) * smooth;
        brakeAmount += (brakeTarget - brakeAmount) * smooth;

        // Permanent boost accumulation with a non-linear ramp: the longer
        // W is held, the harder the rate of accumulation. The first frames
        // give almost nothing -- the player has to commit to the tuck for
        // the speed to start building meaningfully. Releasing W (or being
        // overridden by S) wipes the ramp, so tap-tapping is never as
        // effective as a sustained hold.
        if (keys.boost && !keys.brake) {
            boostHoldTime += delta;
            const rampT = Math.min(1, boostHoldTime / BOOST_RAMP_TIME);
            const accel = BOOST_ACCEL_INITIAL
                + (BOOST_ACCEL_PEAK - BOOST_ACCEL_INITIAL) * (rampT * rampT);
            bonusSpeed += accel * delta;
        } else {
            boostHoldTime = 0;
        }

        // Persistent brake cost: while S is held, bonusSpeed is shaved
        // away. After releasing S, the player resumes at a slightly lower
        // speed than they had before braking, so snowplowing carries a
        // real long-term price. brakeAmount is the smoothed input so the
        // decay fades in/out consistent with the visual brake force.
        if (brakeAmount > 0.001 && bonusSpeed > 0) {
            bonusSpeed = Math.max(0, bonusSpeed - brakeAmount * BRAKE_DECAY_RATE * delta);
        }

        // Effective game speed:
        //   baseSpeed   = SPEED_INITIAL + elapsed * SPEED_RAMP   (natural ramp; the avalanche moves at this rate)
        //   bonusSpeed  = persistent W investment                (added on top, kept across input releases)
        //   brake       = multiplicative reduction               (full S keeps only (1 - BRAKE_FACTOR) of the speed)
        // The multiplicative model ensures the brake stays meaningful at
        // any accumulated speed: it always cuts the same fraction off,
        // so a player who has banked a large bonusSpeed feels the same
        // proportional slowdown as one who has not.
        const baseSpeed = SPEED_INITIAL + elapsed * SPEED_RAMP;
        const fullSpeed = baseSpeed + bonusSpeed;
        gameSpeed = Math.max(SPEED_FLOOR, fullSpeed * (1 - brakeAmount * BRAKE_FACTOR));
        score    += gameSpeed * delta;

        // Rubber-band gap dynamics. The gap is a spring anchored at
        // GAP_DEFAULT: W applies an outward push, S applies an inward
        // pull, and the restoring force pulls back toward the resting
        // gap continuously. Holding W indefinitely settles the gap a
        // few metres above default (NOT at GAP_MAX), which means the
        // brake always has a meaningful window to close the gap --
        // overcoming both the boost push and the displacement gives
        // S real consequence regardless of how much speed the player
        // has banked.
        const gapBoostForce = boostAmount * GAP_BOOST_RATE;
        const gapBrakeForce = brakeAmount * GAP_BRAKE_RATE;
        const gapRestoring  = GAP_PULL_FACTOR * (avalancheGap - GAP_DEFAULT);
        avalancheGap += (gapBoostForce - gapBrakeForce - gapRestoring) * delta;
        avalancheGap = Math.max(0, Math.min(GAP_MAX, avalancheGap));

        updateTerrain(chunks, gameSpeed, delta, onChunkRecycle);

        // Lateral movement. No hard clamp -- the skier is allowed to cross
        // the boundary flags so the fall can be triggered by the overshoot.
        // The effective lateral speed shrinks while tucking (boostAmount
        // > 0): a committed downhill tuck trades agility for forward speed,
        // so dodging A/D becomes visibly harder when W is held.
        const lateralSpeed = LATERAL_SPEED * (1 - boostAmount * LATERAL_W_PENALTY);
        if (keys.left)  skier.position.x += lateralSpeed * delta;
        if (keys.right) skier.position.x -= lateralSpeed * delta;

        // Lean into turns
        let targetLean = 0;
        if (keys.left)  targetLean =  LEAN_ANGLE;
        if (keys.right) targetLean = -LEAN_ANGLE;
        skier.rotation.z += (targetLean - skier.rotation.z) * LEAN_SPEED * delta;

        animateSkier(elapsed);
        // Apply tuck/snowplow on top of the running cycle. Order matters:
        // animateSkier writes the baseline pose first, then these biases
        // add (or override, in the case of ski Y/Z) on top of it.
        applySkierTuckPose(boostAmount);
        applySkierSnowplowPose(brakeAmount);

        // Death checks, in order of priority:
        //   1. Boundary slip (drives the existing edge-fall)
        //   2. Obstacle collision
        //   3. Avalanche overrun (new) -- the gap collapsed to lethal range.
        // The avalanche check is last so a player who is also crossing the
        // ridge edge or hitting an obstacle still gets the more specific
        // animation for that case.
        if (Math.abs(skier.position.x) > LATERAL_LIMIT) {
            beginEdgeFall();
        }
        else {
            const collision = checkSkierCollision(skier.position, chunks);
            if (collision) {
                beginCollisionFall(collision);
            } else if (avalancheGap <= GAP_DEATH) {
                beginAvalancheFall();
            }
        }

        // HUD
        hud.innerHTML =
            'Score: ' + Math.floor(score) + ' m<br>' +
            'Speed: ' + gameSpeed.toFixed(1) + ' m/s';
    }
    // -- Falling: boundary slip or obstacle crash --
    // Edge falls keep the old steep-drop behavior. Obstacle collisions use
    // the contact normal returned by collision.js for a short tumble/slide
    // before the game-over overlay appears.
    else if (gameState === 'falling') {
        fallTimer += delta;

        if (fallMode === 'edge') {
            fallVelY -= FALL_GRAVITY * delta;   // gravity integrates velocity

            skier.position.y += fallVelY * delta;
            skier.position.x += fallDir  * FALL_LATERAL_PUSH * delta;

            skier.rotation.z += fallSpinZ * delta;
            skier.rotation.x += fallSpinX * delta;

            // Keep terrain + cycle moving so the world around the fall feels alive
            updateTerrain(chunks, gameSpeed, delta, onChunkRecycle);

            if (fallTimer >= FALL_DURATION) showGameOver();
        } else if (fallMode === 'avalanche') {
            // Body topples forward as if shoved from behind, then falls. We
            // also drive the gap rapidly toward zero so the cloud overruns
            // the camera in the same beat as the body hits the snow.
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

            // Gap collapses faster than it can during gameplay so the cloud
            // visibly closes the remaining distance before the overlay shows.
            avalancheGap = Math.max(-3.0, avalancheGap - 14 * delta);

            // Slow but continuing world motion preserves the sense of being
            // dragged forward by the slide while the player loses control.
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

            // The crash bleeds off speed instead of keeping the full downhill
            // illusion after impact, but chunks still move a little so the
            // scenery does not freeze abruptly.
            gameSpeed *= Math.exp(-CRASH_SPEED_DECAY * delta);
            updateTerrain(chunks, gameSpeed * 0.45, delta, onChunkRecycle);

            if (fallTimer >= CRASH_DURATION) showGameOver();
        }
    }

    updateReleasedEquipment(delta);

    // -- Day/night cycle (always ticks, even on game over) --
    const cycleT = getCycleT();

    // Sun target follows the skier so the shadow frustum stays centered
    sunTarget.position.set(skier.position.x, 0, skier.position.z);

    // Keep the mountain ring centred on the player's forward position
    // so the horizon appears infinite regardless of how far the skier goes.
    updateScenery(sceneryRing, skier.position.z);
    updateAvalanche(avalanche, skier.position, delta, now * 0.001, avalancheGap);

    // Hide speed lines in the front-facing camera (they would emanate behind
    // the player from the camera's perspective, which reads as nonsense)
    // and during any fall state -- once the player loses control the streaks
    // would conflict with the avalanche cloud or the crash tumble.
    //
    // Visibility is gated purely by gameSpeed: streaks render once the
    // player crosses THRESHOLD_LO and ramp up toward THRESHOLD_HI. There
    // is no separate input gate, so the streaks remain visible whenever
    // the player is actually moving fast, regardless of why.
    const showStreaks = (gameState === 'playing' && camMode !== 2);
    updateSpeedLines(delta, showStreaks ? gameSpeed : 0);

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
    //
    // The camera response to speed is intentionally clipped: bonusSpeed
    // is unbounded, so without a cap the camera would drift up and back
    // forever as the player accumulates speed. Capping the speed factor
    // at 1 (with a slower divisor) keeps the camera framing stable past
    // a moderate "fast enough" threshold.
    const speedFactor = Math.min(1, Math.max(0, (gameSpeed - SPEED_INITIAL) / 50));
    let targetPos, targetLook;

    if (camMode === 0) {
        // Behind (original)
        targetPos  = { x: skier.position.x * 0.85,
                       y: 3.0 + speedFactor * 1.0,
                       z: -5.0 - speedFactor * 1.5 };
        targetLook = { x: skier.position.x * 0.6, y: 0.8, z: 4 };
    } else if (camMode === 1) {
        // First-person
        targetPos  = { x: skier.position.x, y: 1.2, z: 0.3 };
        targetLook = { x: skier.position.x, y: 0.8, z: 10 };
    } else {
        // Facing skier (from the front)
        targetPos  = { x: skier.position.x * 0.85,
                       y: 3.0 + speedFactor * 1.0,
                       z: 10 + speedFactor * 1.5 };
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
