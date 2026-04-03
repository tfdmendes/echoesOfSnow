import * as THREE from 'three';
import { skier, animateSkier } from './skier.js';
import {
    createTerrain, updateTerrain, setSnowTexture, makeSnowTexture,
    CHUNK_LENGTH, CHUNK_WIDTH
} from './terrain.js';
import { populateChunk, clearChunk, checkCollisions } from './obstacles.js';


const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// THREE.Fog(color, near, far)
scene.fog = new THREE.Fog(0x87ceeb, 40, 280);

// PerspectiveCamera(fov, aspect, near, far)
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

const ambientLight = new THREE.AmbientLight(0x8899bb, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.position.set(40, 60, -20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width  = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near   = 1;
sunLight.shadow.camera.far    = 300;
sunLight.shadow.camera.left   = -50;
sunLight.shadow.camera.right  = 50;
sunLight.shadow.camera.top    = 60;
sunLight.shadow.camera.bottom = -60;
scene.add(sunLight);

scene.add(skier);

const chunks = createTerrain(scene);

// First 2 chunks are obstacle-free (safe zone)
const SAFE_CHUNKS = 2;
for (let i = SAFE_CHUNKS; i < chunks.length; i++) {
    populateChunk(chunks[i], CHUNK_LENGTH, CHUNK_WIDTH);
}

// Called every time a chunk wraps to the front of the belt
function onChunkRecycle(chunk) {
    clearChunk(chunk);
    populateChunk(chunk, CHUNK_LENGTH, CHUNK_WIDTH);
}

// Speed starts at 14 units/sec and ramps up 
const SPEED_INITIAL = 14;
const SPEED_RAMP = 0.4;         // units per second of play time
let gameSpeed = SPEED_INITIAL;

const keys = {left: false, right: false};

const loader   = new THREE.TextureLoader();
const snowTex = loader.load('textures/snow_rough.jpg');

// Repeat tiles the texture across the plane instead of stretching it
snowTex.wrapS = THREE.RepeatWrapping;
snowTex.wrapT = THREE.RepeatWrapping;

snowTex.repeat.set(4, 10);

const textures = [
    makeSnowTexture(0),   // dry snow
    makeSnowTexture(1),   // icy snow
    makeSnowTexture(2),   // packed snow
];

let texIndex = 0;

setSnowTexture(chunks, textures[0]);


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


let distance  = 0;
let gameState = 'playing';

const LATERAL_SPEED = 6;
const LATERAL_LIMIT = 12;
const LEAN_ANGLE    = 0.18;
const LEAN_SPEED    = 6;

// HUD overlay (HTML on top of the WebGL canvas)
const hud = document.createElement('div');
hud.style.cssText =
    'position:fixed; top:16px; left:16px; color:#fff; font:bold 18px monospace;' +
    'text-shadow:0 1px 3px rgba(0,0,0,0.6); pointer-events:none; z-index:10;' +
    'line-height:1.6;';
document.body.appendChild(hud);

// Game over screen
const overlay = document.createElement('div');
overlay.style.cssText =
    'position:fixed; inset:0; display:flex; flex-direction:column;' +
    'align-items:center; justify-content:center; background:rgba(0,0,0,0.55);' +
    'color:#fff; font-family:sans-serif; z-index:20; pointer-events:none;' +
    'opacity:0; transition:opacity 0.4s;';
overlay.innerHTML =
    '<div style="font-size:48px; font-weight:bold; margin-bottom:12px;">GAME OVER</div>' +
    '<div id="go-distance" style="font-size:22px; margin-bottom:24px;"></div>' +
    '<div style="font-size:16px; opacity:0.8;">Press R to restart</div>';
document.body.appendChild(overlay);


let elapsed = 0;
let lastTime = performance.now();

function animate(now) {
    requestAnimationFrame(animate);

    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (gameState === 'playing') {
        elapsed  += delta;
        gameSpeed = SPEED_INITIAL + elapsed * SPEED_RAMP;
        distance += gameSpeed * delta;

        // Scroll terrain, recycle chunks with new obstacles
        updateTerrain(chunks, gameSpeed, delta, onChunkRecycle);

        // Lateral movement
        if (keys.left)  skier.position.x += LATERAL_SPEED * delta;
        if (keys.right) skier.position.x -= LATERAL_SPEED * delta;
        skier.position.x = Math.max(-LATERAL_LIMIT, Math.min(LATERAL_LIMIT, skier.position.x));

        // Lean into turns (Z rotation with lerp)
        let targetLean = 0;
        if (keys.left)  targetLean =  LEAN_ANGLE;
        if (keys.right) targetLean = -LEAN_ANGLE;
        skier.rotation.z += (targetLean - skier.rotation.z) * LEAN_SPEED * delta;

        animateSkier(elapsed);

        // Collision check
        if (checkCollisions(skier.position, chunks)) {
            gameState = 'gameover';
            document.getElementById('go-distance').textContent =
                Math.floor(distance) + ' m';
            overlay.style.opacity = '1';
        }

        // Update HUD
        hud.innerHTML =
            'Distance: ' + Math.floor(distance) + ' m<br>' +
            'Speed: ' + gameSpeed.toFixed(1) + ' m/s';
    }

    // Camera always follows (stable view during game over)
    const targetX = skier.position.x * 0.4;
    camera.position.x += (targetX - camera.position.x) * 0.08;
    camera.lookAt(skier.position.x, 1, 0);

    renderer.render(scene, camera);
}

requestAnimationFrame(animate);


function restartGame() {
    skier.position.set(0, 0, 0);
    skier.rotation.z = 0;

    for (let i = 0; i < chunks.length; i++) {
        clearChunk(chunks[i]);
        chunks[i].position.set(0, 0, i * CHUNK_LENGTH);
        if (i >= SAFE_CHUNKS) {
            populateChunk(chunks[i], CHUNK_LENGTH, CHUNK_WIDTH);
        }
    }

    camera.position.set(0, 3, -5);
    elapsed   = 0;
    distance  = 0;
    gameSpeed = SPEED_INITIAL;
    lastTime  = performance.now();
    gameState = 'playing';
    overlay.style.opacity = '0';
}