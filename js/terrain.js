import * as THREE from 'three';

// POOL_SIZE * CHUNK_LENGTH must exceed the camera far plane (600)
export const CHUNK_LENGTH = 80;
export const CHUNK_WIDTH  = 32;                 // playable ridge width
export const PLAY_HALF_X  = CHUNK_WIDTH / 2;    // skier falls if |x| > this
const POOL_SIZE = 8;


// Drop matches VALLEY_FLOOR_Y in scenery.js so slope and floor meet seamlessly
const SLOPE_WIDTH = 40;
const SLOPE_DROP  = 45;

const FLAG_SPACING = 20;
const FLAG_POLE_HEIGHT = 2.2;


const CHUNK_GEOMETRY = new THREE.PlaneGeometry(CHUNK_WIDTH, CHUNK_LENGTH, 4, 8);

// Shared between every chunk; the transform lives on the mesh, not the geometry
const SLOPE_GEOMETRY = buildSlopeGeometry();


const snowMaterial = new THREE.MeshPhongMaterial({
    color:     0xdde8f5,
    shininess: 12
});

// Duller, rockier snow so the out-of-bounds area reads as different terrain
const slopeMaterial = new THREE.MeshPhongMaterial({
    color:       0xa8b5c8,
    shininess:   6,
    flatShading: true
});


// ------ Flag geometry ------
// Tapered pole so it reads like a real slalom gate
const FLAG_POLE_GEO = new THREE.CylinderGeometry(0.03, 0.055, FLAG_POLE_HEIGHT, 10);

// Finial knob on top of the pole
const FLAG_KNOB_GEO = new THREE.SphereGeometry(0.065, 10, 6);

const FLAG_PENNANT_GEO = buildPennantGeometry();


const flagPoleMat  = new THREE.MeshPhongMaterial({ color: 0xf2f2f2, shininess: 40 });
const flagKnobMat  = new THREE.MeshPhongMaterial({ color: 0x1e1e1e, shininess: 60 });
// Cloth a bit shinier so dawn/dusk light catches it
const flagRedMat   = new THREE.MeshPhongMaterial({ color: 0xd4262a, side: THREE.DoubleSide, shininess: 8 });
const flagBlueMat  = new THREE.MeshPhongMaterial({ color: 0x2a50c8, side: THREE.DoubleSide, shininess: 8 });


// Tapered strip from pole (t=0) to tip (t=1) with droop and a baked-in wave
function buildPennantGeometry() {
    const len     = 0.95;
    const height  = 0.45;
    const segs    = 6;
    const waveAmp = 0.05;
    const waveFreq = 7.0;

    const positions = [];
    const indices   = [];

    for (let i = 0; i <= segs; i++) {
        const t          = i / segs;
        const x          = t * len;
        const heightAtT  = height * (1 - t);  // tapers to 0 at the tip
        const droop      = 0.18 * t * t;      // cloth sags toward the free end
        const wave       = waveAmp * Math.sin(x * waveFreq);

        // Two vertices per column: top edge then bottom edge
        positions.push(x, -droop,              wave);
        positions.push(x, -droop - heightAtT,  wave);
    }

    // Two triangles per quad between adjacent columns
    for (let i = 0; i < segs; i++) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = (i + 1) * 2;
        const d = (i + 1) * 2 + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}



// PlaneGeometry whose outer vertices get pushed down so it forms the slope
// flank when rotated flat
function buildSlopeGeometry() {
    const widthSegments  = 14;
    const heightSegments = 12;
    const geo = new THREE.PlaneGeometry(SLOPE_WIDTH, CHUNK_LENGTH, widthSegments, heightSegments);

    const pos = geo.attributes.position;

    // Cosine smoothstep: zero tangent at both ends so ridge -> slope -> floor
    // joins seamlessly without visible creases
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const t = (x + SLOPE_WIDTH / 2) / SLOPE_WIDTH;
        const eased = 0.5 * (1 - Math.cos(Math.PI * t));

        // Noise peaks in the middle and dies at both ends so the seams stay clean
        const noise = (Math.random() - 0.5) * 0.9 * t * (1 - t);

        pos.setZ(i, -eased * SLOPE_DROP + noise);
    }

    geo.computeVertexNormals();

    return geo;
}



// Tapered pole + black knob finial + triangular pennant pointing inward
function createFlag(colorMat, clothDirection) {
    const group = new THREE.Group();

    const pole = new THREE.Mesh(FLAG_POLE_GEO, flagPoleMat);
    pole.position.y = FLAG_POLE_HEIGHT / 2;
    pole.castShadow = true;

    // Finial knob sitting on top of the pole
    const knob = new THREE.Mesh(FLAG_KNOB_GEO, flagKnobMat);
    knob.position.y = FLAG_POLE_HEIGHT + 0.055;
    knob.castShadow = true;

    // scale.x = clothDirection mirrors the pennant for the opposite side
    const pennant = new THREE.Mesh(FLAG_PENNANT_GEO, colorMat);
    pennant.position.set(0, FLAG_POLE_HEIGHT - 0.1, 0);
    pennant.scale.x = clothDirection;

    group.add(pole, knob, pennant);
    return group;
}



// Playable ridge plane + left slope + right slope + flags
function createChunk() {
    const group = new THREE.Group();

    // --- Playable ridge ---
    const plane = new THREE.Mesh(CHUNK_GEOMETRY, snowMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    group.add(plane);

    // --- Left slope (mirrored so the drop falls on -X) ---
    const leftSlope = new THREE.Mesh(SLOPE_GEOMETRY, slopeMaterial);
    leftSlope.rotation.x = -Math.PI / 2;
    leftSlope.rotation.z =  Math.PI;
    leftSlope.position.x = -PLAY_HALF_X - SLOPE_WIDTH / 2;
    leftSlope.receiveShadow = true;
    group.add(leftSlope);

    // --- Right slope ---
    const rightSlope = new THREE.Mesh(SLOPE_GEOMETRY, slopeMaterial);
    rightSlope.rotation.x = -Math.PI / 2;
    rightSlope.position.x =  PLAY_HALF_X + SLOPE_WIDTH / 2;
    rightSlope.receiveShadow = true;
    group.add(rightSlope);

    // --- Boundary flags ---
    // First flag offset by half spacing so neighbouring chunks line up
    const flagsPerChunk = Math.floor(CHUNK_LENGTH / FLAG_SPACING);
    const startZ = -CHUNK_LENGTH / 2 + FLAG_SPACING / 2;
    for (let i = 0; i < flagsPerChunk; i++) {
        const localZ = startZ + i * FLAG_SPACING;

        // Left boundary: red flag with cloth pointing inward
        const leftFlag = createFlag(flagRedMat, +1);
        leftFlag.position.set(-PLAY_HALF_X, 0, localZ);
        group.add(leftFlag);

        // Right boundary: blue flag with cloth pointing inward
        const rightFlag = createFlag(flagBlueMat, -1);
        rightFlag.position.set(PLAY_HALF_X, 0, localZ);
        group.add(rightFlag);
    }

    group.userData.obstacles = [];
    return group;
}


function frontZ(chunks) {
    let max = -Infinity;
    for (const c of chunks) {
        if (c.position.z > max) max = c.position.z;
    }
    return max;
}



export function createTerrain(scene) {
    snowMaterial.map = makeSnowTexture();
    snowMaterial.needsUpdate = true;

    const chunks = [];
    for (let i = 0; i < POOL_SIZE; i++) {
        const chunk = createChunk();
        chunk.position.z = i * CHUNK_LENGTH;
        scene.add(chunk);
        chunks.push(chunk);
    }
    return chunks;
}



// On recycle, clear old obstacles and let the caller spawn new ones
export function updateTerrain(chunks, speed, delta, onRecycle) {
    for (const chunk of chunks) {
        chunk.position.z -= speed * delta;
    }

    for (const chunk of chunks) {
        if (chunk.position.z < -CHUNK_LENGTH) {
            chunk.position.z = frontZ(chunks) + CHUNK_LENGTH;
            if (onRecycle) onRecycle(chunk);
        }
    }
}


// Procedural snow texture on a canvas
function makeSnowTexture() {
    const size   = 512;
    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const base = [252, 254, 255];

    const gridSize = 24;
    const grid = [];
    for (let i = 0; i <= gridSize; i++) {
        grid[i] = [];
        for (let j = 0; j <= gridSize; j++) {
            grid[i][j] = (Math.random() - 0.5) * 22;
        }
    }

    function smoothNoise(x, y) {
        const gx = (x / size) * gridSize;
        const gy = (y / size) * gridSize;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const fx = gx - ix;
        const fy = gy - iy;

        const a = grid[ix][iy];
        const b = grid[ix + 1][iy];
        const c = grid[ix][iy + 1];
        const d = grid[ix + 1][iy + 1];
        return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    }

    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const noise = smoothNoise(x, y) + (Math.random() - 0.5) * 6;
            data[i]     = Math.min(255, Math.max(0, base[0] + noise));
            data[i + 1] = Math.min(255, Math.max(0, base[1] + noise));
            data[i + 2] = Math.min(255, Math.max(0, base[2] + noise));
            data[i + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    for (let s = 0; s < 350; s++) {
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 10);
    return tex;
}


