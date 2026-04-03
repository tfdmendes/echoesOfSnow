import * as THREE from 'three';

// Chunk dimensions -- POOL_SIZE * CHUNK_LENGTH must exceed the camera far plane (600).
// 8 * 80 = 640, so we have a small margin.
const CHUNK_LENGTH = 80;
const CHUNK_WIDTH  = 32;
const POOL_SIZE    = 8;

// PlaneGeometry(width, height, widthSegments, heightSegments)
const CHUNK_GEOMETRY = new THREE.PlaneGeometry(CHUNK_WIDTH, CHUNK_LENGTH, 4, 8);

// All chunks share one material so a texture swap costs a single call.
const snowMaterial = new THREE.MeshPhongMaterial({
    color:     0xdde8f5,   // slightly blue-tinted white, more convincing than pure white
    shininess: 12
});

function createChunk() {
    const mesh = new THREE.Mesh(CHUNK_GEOMETRY, snowMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
}

// Returns the Z of the chunk that is furthest ahead.
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
        // Spread chunks forward along +Z so the slope is pre-filled on load.
        chunk.position.z = i * CHUNK_LENGTH + CHUNK_LENGTH * 0.5;
        scene.add(chunk);
        chunks.push(chunk);
    }
    return chunks;
}

export function updateTerrain(chunks, speed, delta) {
    for (const chunk of chunks) {
        chunk.position.z -= speed * delta;

        // Trailing edge = center - half length.
        // When that clears the camera, recycle the chunk to the front.
        if (chunk.position.z < -CHUNK_LENGTH * 0.5) {
            chunk.position.z = frontZ(chunks) + CHUNK_LENGTH;
        }
    }
}

// Swaps the snow texture on all chunks -- called by the T key in scene.js.
// The loop lives here because snowMaterial is private to this module.
export function setSnowTexture(chunks, texture) {
    snowMaterial.map = texture;
    snowMaterial.needsUpdate = true;
}