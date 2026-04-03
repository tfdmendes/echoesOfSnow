import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { skier, animateSkier } from './skier.js';

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
camera.position.set(6, 2, 0);
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

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

let elapsed = 0;
let lastTime = performance.now();

function animate(now) {
    requestAnimationFrame(animate);
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += delta;

    animateSkier(elapsed);
    controls.update();
    renderer.render(scene, camera);
}

requestAnimationFrame(animate);