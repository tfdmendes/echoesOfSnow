import * as THREE from 'three';

// Chunk dimensions -- POOL_SIZE * CHUNK_LENGTH must exceed the camera far plane (600).
// 8 * 80 = 640, so we have a small margin.
export const CHUNK_LENGTH = 80;
export const CHUNK_WIDTH  = 32;
const POOL_SIZE = 8;



// PlaneGeometry(width, height, widthSegments, heightSegments)
const CHUNK_GEOMETRY = new THREE.PlaneGeometry(CHUNK_WIDTH, CHUNK_LENGTH, 4, 8);

const snowMaterial = new THREE.MeshPhongMaterial({
    color:     0xdde8f5,
    shininess: 12
});



// Each chunk is a group: snow plane + obstacle children
function createChunk() {
    const group = new THREE.Group();

    const plane = new THREE.Mesh(CHUNK_GEOMETRY, snowMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;

    group.add(plane);
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
    const chunks = [];
    for (let i = 0; i < POOL_SIZE; i++) {
        const chunk = createChunk();
        chunk.position.z = i * CHUNK_LENGTH;
        scene.add(chunk);
        chunks.push(chunk);
    }
    return chunks;
}



// When a chunk is recycled to the front, clear old obstacles 
// and generte new ones
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


// Swaps the snow texture on all chunks
// The loop lives here because snowMaterial is private to this module.
export function setSnowTexture(chunks, texture) {
    snowMaterial.map = texture;
    snowMaterial.needsUpdate = true;
}



// Generates a procedural snow texture on a canvas.
// variant 0 = dry snow (warm white), 1 = icy snow (blue tint), 2 = packed snow (grey)
export function makeSnowTexture(variant) {
    const size   = 512;
    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base colours per variant -> [r, g, b] range centers
    const bases = [
        [252, 254, 255],   // dry - near-pure white
        [236, 246, 255],   // icy - very subtle cold blue
        [241, 243, 245],   // packed - barely-grey
    ];
    const base = bases[variant] || bases[0];

    // Build a coarse grid of random offsets and interpolate between them.
    // This produces smooth low-frequency variation -- the "bumps" feeling.
    const gridSize = 24;
    const grid = [];
    for (let i = 0; i <= gridSize; i++) {
        grid[i] = [];
        for (let j = 0; j <= gridSize; j++) {
            grid[i][j] = (Math.random() - 0.5) * 22;
        }
    }


    function smoothNoise(x, y) {
        // Map pixel coords to grid coords
        const gx = (x / size) * gridSize;
        const gy = (y / size) * gridSize;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const fx = gx - ix;
        const fy = gy - iy;

        // Bilinear interpolation between the four surrounding grid points
        const a = grid[ix][iy];
        const b = grid[ix + 1][iy];
        const c = grid[ix][iy + 1];
        const d = grid[ix + 1][iy + 1];
        return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    }


    
    // Fill pixel by pixel with slight random noise around the base colour
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;

            // Low-frequency bump + very subtle high-frequency grain on top
            const noise = smoothNoise(x, y) + (Math.random() - 0.5) * 6;

            data[i] = Math.min(255, Math.max(0, base[0] + noise));
            data[i + 1] = Math.min(255, Math.max(0, base[1] + noise));
            data[i + 2] = Math.min(255, Math.max(0, base[2] + noise));
            data[i + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    // Sparkle dots -- simulate light catching snow crystals
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