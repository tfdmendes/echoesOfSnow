import * as THREE from 'three';
import { CHUNK_LENGTH, CHUNK_WIDTH } from './terrain.js';

const TRAIL_Y = 0.018;
const BASE_WIDTH = 0.11;
const BRAKE_WIDTH = 0.18;
const MIN_SEGMENT_LENGTH = 0.08;
const MAX_SEGMENT_JUMP = 2.5;
const MAX_DRAW_STEP = 0.30;
const SEGMENTS_PER_CHUNK = 1400;
const SKI_COUNT = 2;
const BASE_CONTACT_RESPONSE = 1.0;
const BRAKE_CONTACT_RESPONSE = 0.85;

const trailMaterial = new THREE.MeshBasicMaterial({
    color: 0xaec0cf,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
});

function createTrailLayer(chunk) {
    const positions = new Float32Array(SEGMENTS_PER_CHUNK * 4 * 3);
    const indices = new Uint16Array(SEGMENTS_PER_CHUNK * 6);

    for (let i = 0; i < SEGMENTS_PER_CHUNK; i++) {
        const v = i * 4;
        const t = i * 6;
        indices[t]     = v;
        indices[t + 1] = v + 1;
        indices[t + 2] = v + 2;
        indices[t + 3] = v + 1;
        indices[t + 4] = v + 3;
        indices[t + 5] = v + 2;
    }

    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(positions, 3);
    positionAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positionAttr);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);

    const mesh = new THREE.Mesh(geometry, trailMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    chunk.add(mesh);

    const layer = {
        mesh,
        geometry,
        positions,
        positionAttr,
        segmentCount: 0,
        writeIndex: 0
    };

    chunk.userData.snowTrailLayer = layer;
    return layer;
}

function clearLayer(layer) {
    layer.segmentCount = 0;
    layer.writeIndex = 0;
    layer.geometry.setDrawRange(0, 0);
    layer.positionAttr.needsUpdate = true;
}

function isInsidePlayableSnow(localPoint) {
    return Math.abs(localPoint.x) <= CHUNK_WIDTH / 2
        && Math.abs(localPoint.z) <= CHUNK_LENGTH / 2;
}

function getContactCenter(contact) {
    return contact.center || contact;
}

function findChunkForContact(chunks, contact, targetLocal) {
    const worldPoint = getContactCenter(contact);
    for (const chunk of chunks) {
        targetLocal.copy(worldPoint);
        chunk.worldToLocal(targetLocal);
        if (isInsidePlayableSnow(targetLocal)) return chunk;
    }
    return null;
}

function addSegment(layer, from, to, width) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < MIN_SEGMENT_LENGTH || len > MAX_SEGMENT_JUMP) return false;

    const halfWidth = width * 0.5;
    const nx = -dz / len * halfWidth;
    const nz =  dx / len * halfWidth;

    const segmentIndex = layer.writeIndex;
    const offset = segmentIndex * 4 * 3;
    const p = layer.positions;

    p[offset]      = from.x - nx;
    p[offset + 1]  = TRAIL_Y;
    p[offset + 2]  = from.z - nz;
    p[offset + 3]  = from.x + nx;
    p[offset + 4]  = TRAIL_Y;
    p[offset + 5]  = from.z + nz;
    p[offset + 6]  = to.x - nx;
    p[offset + 7]  = TRAIL_Y;
    p[offset + 8]  = to.z - nz;
    p[offset + 9]  = to.x + nx;
    p[offset + 10] = TRAIL_Y;
    p[offset + 11] = to.z + nz;

    layer.writeIndex = (layer.writeIndex + 1) % SEGMENTS_PER_CHUNK;
    layer.segmentCount = Math.min(SEGMENTS_PER_CHUNK, layer.segmentCount + 1);
    layer.geometry.setDrawRange(0, layer.segmentCount * 6);
    layer.positionAttr.needsUpdate = true;
    return true;
}

export function createSnowTrails(chunks) {
    const localScratch = new THREE.Vector3();
    const previousContacts = [];

    for (let i = 0; i < SKI_COUNT; i++) {
        previousContacts.push({
            chunk: null,
            brushCenter: new THREE.Vector3(),
            drawCenter: new THREE.Vector3(),
            active: false
        });
    }

    for (const chunk of chunks) {
        if (!chunk.userData.snowTrailLayer) createTrailLayer(chunk);
    }

    function pause() {
        for (const previous of previousContacts) {
            previous.chunk = null;
            previous.active = false;
        }
    }

    function clearChunk(chunk) {
        const layer = chunk.userData.snowTrailLayer;
        if (layer) clearLayer(layer);

        for (const previous of previousContacts) {
            if (previous.chunk === chunk) {
                previous.chunk = null;
                previous.active = false;
            }
        }
    }

    function reset() {
        for (const chunk of chunks) clearChunk(chunk);
        pause();
    }

    function update(contacts, brakeAmount = 0) {
        const brakeT = Math.max(0, Math.min(1, brakeAmount));
        const width = THREE.MathUtils.lerp(BASE_WIDTH, BRAKE_WIDTH, brakeT);
        const contactResponse = THREE.MathUtils.lerp(BASE_CONTACT_RESPONSE, BRAKE_CONTACT_RESPONSE, brakeT);

        for (let i = 0; i < SKI_COUNT; i++) {
            const contact = contacts[i];
            const previous = previousContacts[i];
            if (!contact) {
                previous.active = false;
                previous.chunk = null;
                continue;
            }

            const chunk = findChunkForContact(chunks, contact, localScratch);
            if (!chunk) {
                previous.active = false;
                previous.chunk = null;
                continue;
            }

            if (previous.active && previous.chunk === chunk) {
                previous.brushCenter.lerp(localScratch, contactResponse);

                const dx = previous.brushCenter.x - previous.drawCenter.x;
                const dz = previous.brushCenter.z - previous.drawCenter.z;
                const drawDistance = Math.hypot(dx, dz);

                if (drawDistance > MAX_SEGMENT_JUMP) {
                    previous.drawCenter.copy(previous.brushCenter);
                } else if (drawDistance > MAX_DRAW_STEP) {
                    // Subdivide long per-frame moves so high-speed trails read
                    // as a continuous line instead of one chunky segment a frame.
                    const steps = Math.ceil(drawDistance / MAX_DRAW_STEP);
                    const stepX = dx / steps;
                    const stepZ = dz / steps;
                    const layer = chunk.userData.snowTrailLayer;
                    const subTarget = { x: 0, z: 0 };
                    for (let s = 0; s < steps; s++) {
                        subTarget.x = previous.drawCenter.x + stepX;
                        subTarget.z = previous.drawCenter.z + stepZ;
                        addSegment(layer, previous.drawCenter, subTarget, width);
                        previous.drawCenter.x = subTarget.x;
                        previous.drawCenter.z = subTarget.z;
                    }
                } else if (addSegment(chunk.userData.snowTrailLayer, previous.drawCenter, previous.brushCenter, width)) {
                    previous.drawCenter.copy(previous.brushCenter);
                }
            } else {
                previous.brushCenter.copy(localScratch);
                previous.drawCenter.copy(localScratch);
            }

            previous.chunk = chunk;
            previous.active = true;
        }
    }

    return { update, clearChunk, reset, pause };
}
