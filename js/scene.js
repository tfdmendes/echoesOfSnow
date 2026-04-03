import * as THREE from 'three';
import { skier, animateSkier } from './skier.js';
import { createTerrain, updateTerrain, setSnowTexture, makeSnowTexture } from './terrain.js';


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

let elapsed = 0;
let lastTime = performance.now();

function animate(now) {

    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += delta;
    
    gameSpeed = SPEED_INITIAL + elapsed * SPEED_RAMP;
    updateTerrain(chunks, gameSpeed, delta);

    if (keys.left)  skier.position.x += 6 * delta;
    if (keys.right) skier.position.x -= 6 * delta;
    skier.position.x = Math.max(-12, Math.min(12, skier.position.x));

    const targetX = skier.position.x * 0.4;
    camera.position.x += (targetX - camera.position.x) * 0.08;
    camera.lookAt(skier.position.x, 1, 0);

    animateSkier(elapsed);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);