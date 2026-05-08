import * as THREE from 'three';
import { CHUNK_WIDTH } from './terrain.js';

const TRACK_WIDTH = CHUNK_WIDTH - 1.2;
// Default gap between the skier and the front of the avalanche
export const FRONT_DISTANCE = 10.0;
const CLOUD_DEPTH = 10.5;
const CLOUD_HEIGHT = 7.35;

const VEIL_COUNT = 5;
const BILLBOARD_COUNT = 190;
const FINE_PARTICLES = 2100;
const HEAVY_PARTICLES = 620;

const tmpColor = new THREE.Color();

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function topProfile(xNorm, time = 0) {
    const edge = Math.abs(xNorm);
    const centerLift = 1 - Math.pow(edge, 1.75);
    const wobble =
        Math.sin(xNorm * 9.0 + time * 1.4) * 0.20 +
        Math.sin(xNorm * 17.0 - time * 1.1) * 0.10;

    return 2.65 + centerLift * 3.45 + wobble;
}

function makePowderTexture(size = 160) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(size, size);
    const data = image.data;
    const blobs = [];

    for (let i = 0; i < 18; i++) {
        blobs.push({
            x: 0.22 + Math.random() * 0.56,
            y: 0.18 + Math.random() * 0.60,
            r: 0.13 + Math.random() * 0.28,
            a: 0.35 + Math.random() * 0.65
        });
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const nx = (x / (size - 1)) * 2 - 1;
            const ny = (y / (size - 1)) * 2 - 1;
            const dist = Math.sqrt(nx * nx + ny * ny);
            const radial = 1 - smoothstep(0.25, 1.0, dist);
            let clump = 0;

            for (const b of blobs) {
                const dx = x / size - b.x;
                const dy = y / size - b.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                clump += Math.max(0, 1 - d / b.r) * b.a;
            }

            const grain =
                Math.sin(x * 0.17 + y * 0.07) * 0.07 +
                Math.sin(x * 0.04 - y * 0.15) * 0.05;
            const alpha = clamp01(radial * (0.28 + clump * 0.55 + grain));
            const shade = 235 + Math.floor(20 * clamp01(clump));
            const i = (y * size + x) * 4;

            data[i] = shade;
            data[i + 1] = Math.min(255, shade + 5);
            data[i + 2] = 255;
            data[i + 3] = Math.floor(alpha * 255);
        }
    }

    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
}

function makeVeilTexture(seed, rearDensity = 0) {
    const width = 512;
    const height = 256;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(width, height);
    const data = image.data;

    const clumps = [];
    for (let i = 0; i < 48; i++) {
        clumps.push({
            x: Math.random(),
            y: Math.random(),
            r: 0.055 + Math.random() * 0.16,
            a: 0.16 + Math.random() * 0.42
        });
    }

    for (let y = 0; y < height; y++) {
        const v = y / (height - 1); // 0 top, 1 bottom

        for (let x = 0; x < width; x++) {
            const u = x / (width - 1);
            const xNorm = u * 2 - 1;
            const edge = Math.abs(xNorm);
            const top =
                0.13 +
                0.34 * Math.pow(edge, 1.75) +
                Math.sin(x * 0.040 + seed) * 0.025 +
                Math.sin(x * 0.115 - seed * 2.0) * 0.012;
            const i = (y * width + x) * 4;

            if (v < top) {
                data[i + 3] = 0;
                continue;
            }

            let clump = 0;
            for (const c of clumps) {
                const dx = u - c.x;
                const dy = v - c.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                clump += Math.max(0, 1 - d / c.r) * c.a;
            }

            const sideFade = 1 - smoothstep(0.88, 1.0, edge);
            const topFade = smoothstep(top, top + 0.13, v);
            const bottomCore = smoothstep(top + 0.18, 0.95, v);
            const centerCore = 1 - smoothstep(0.38, 1.0, edge);
            const streaks =
                Math.sin(x * 0.022 + y * 0.070 + seed) * 0.05 +
                Math.sin(x * 0.080 - y * 0.025 + seed * 3.0) * 0.03;
            const alpha =
                (0.20 +
                    rearDensity * 0.16 +
                    bottomCore * (0.34 + rearDensity * 0.18) +
                    centerCore * (0.20 + rearDensity * 0.12) +
                    clump * (0.32 + rearDensity * 0.10) +
                    streaks) *
                topFade *
                sideFade;
            const shade = 232 + Math.floor(22 * clamp01(clump + bottomCore * 0.4));

            data[i] = shade;
            data[i + 1] = Math.min(255, shade + 5);
            data[i + 2] = 255;
            data[i + 3] = Math.floor(clamp01(alpha) * 255);
        }
    }

    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
}

function createVeil(index) {
    const layerT = index / (VEIL_COUNT - 1);
    const centerBias = 1 - Math.abs(layerT - 0.5) * 2;
    const rearBias = Math.pow(layerT, 1.35);
    const material = new THREE.MeshBasicMaterial({
        map: makeVeilTexture(index + Math.random() * 10, rearBias),
        color: 0xffffff,
        transparent: true,
        opacity: 0.52 + centerBias * 0.12 + rearBias * 0.22,
        alphaTest: 0.025,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        fog: false
    });

    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(TRACK_WIDTH, CLOUD_HEIGHT, 1, 1),
        material
    );

    mesh.position.set(0, CLOUD_HEIGHT * 0.5, -index * (CLOUD_DEPTH / (VEIL_COUNT - 1)));
    mesh.renderOrder = 2 + index;
    mesh.userData.baseOpacity = material.opacity;
    mesh.userData.phase = Math.random() * Math.PI * 2;
    return mesh;
}

function createBillboards(texture) {
    const group = new THREE.Group();

    for (let i = 0; i < BILLBOARD_COUNT; i++) {
        const xNorm = (Math.random() * 2 - 1) * 0.94;
        const top = topProfile(xNorm);
        const isCrest = Math.random() < 0.34;
        const y = isCrest
            ? top - 0.85 + Math.random() * 0.85
            : 0.45 + Math.random() * Math.max(0.8, top - 0.8);
        const isRear = Math.random() < 0.42;
        const z = isRear
            ? -CLOUD_DEPTH - Math.random() * 2.1
            : -Math.random() * (CLOUD_DEPTH + 1.2) - (isCrest ? 0.6 : 0);
        const sideFade = 1 - smoothstep(0.78, 1.0, Math.abs(xNorm));
        const scale = (isCrest ? 1.25 : 1.0) * (0.8 + sideFade * 0.7);
        const opacity = (isCrest ? 0.32 + Math.random() * 0.22 : 0.22 + Math.random() * 0.18)
            + (isRear ? 0.10 : 0);
        const material = new THREE.SpriteMaterial({
            map: texture,
            color: 0xffffff,
            transparent: true,
            opacity,
            depthWrite: false,
            depthTest: true,
            fog: false
        });
        const sprite = new THREE.Sprite(material);

        sprite.position.set(xNorm * TRACK_WIDTH * 0.5, y, z);
        sprite.scale.set(
            (1.2 + Math.random() * 2.7) * scale * (isRear ? 1.18 : 1),
            (0.9 + Math.random() * 2.0) * scale * (isRear ? 1.10 : 1),
            1
        );
        sprite.renderOrder = isCrest ? 11 : 10;
        sprite.userData = {
            xNorm,
            baseY: y,
            z,
            phase: Math.random() * Math.PI * 2,
            speed: 0.45 + Math.random() * 0.95,
            baseScale: sprite.scale.clone(),
            baseOpacity: opacity,
            isCrest,
            isRear
        };
        group.add(sprite);
    }

    return group;
}

function updateBillboards(group, time) {
    for (const sprite of group.children) {
        const d = sprite.userData;
        const roll = time * d.speed + d.phase;
        const crest = topProfile(d.xNorm, time);
        const pulse = 1 + Math.sin(roll * 1.9) * 0.08;
        const y = d.isCrest
            ? crest - 0.75 + Math.sin(roll * 1.4) * 0.35
            : Math.min(crest - 0.25, d.baseY + Math.sin(roll * 1.3) * 0.22);

        sprite.position.x = d.xNorm * TRACK_WIDTH * 0.5 + Math.sin(roll) * 0.28;
        sprite.position.y = Math.max(0.25, y);
        sprite.position.z = d.z + Math.cos(roll * 1.15) * (d.isCrest ? 0.55 : 0.28);
        if (d.isRear) {
            sprite.material.opacity = Math.min(0.68, d.baseOpacity + Math.sin(roll * 1.2) * 0.018);
        }
        sprite.scale.set(d.baseScale.x * pulse, d.baseScale.y * pulse, 1);
    }
}

function makeParticleSeed(crestBias) {
    const xNorm = (Math.random() * 2 - 1) * 0.97;
    const top = topProfile(xNorm);
    const crest = Math.random() < crestBias;

    return {
        xNorm,
        y: crest
            ? top - 1.1 + Math.random() * 1.3
            : 0.2 + Math.random() * Math.max(0.8, top - 0.5),
        z: -Math.random() * (CLOUD_DEPTH + 2.0) + (crest ? -0.7 : 0.5),
        phase: Math.random() * Math.PI * 2,
        speed: 0.85 + Math.random() * 1.8,
        crest
    };
}

function writeParticle(array, index, seed, time) {
    const roll = time * seed.speed + seed.phase;
    const xNorm = seed.xNorm + Math.sin(roll * 1.1) * (seed.crest ? 0.026 : 0.014);
    const top = topProfile(xNorm, time);
    const tumble = roll % 1;
    const y = seed.crest
        ? top - 0.25 + Math.sin(roll * 1.7) * 0.45 - tumble * 0.9
        : Math.min(top - 0.18, seed.y + Math.sin(roll * 1.5) * 0.18);
    const offset = index * 3;

    array[offset] = xNorm * TRACK_WIDTH * 0.5 + Math.sin(roll * 1.8) * (seed.crest ? 0.42 : 0.20);
    array[offset + 1] = Math.max(0.08, y);
    array[offset + 2] = seed.z + Math.cos(roll * 1.3) * (seed.crest ? 0.78 : 0.34);
}

function createParticleLayer(count, size, opacity, crestBias, texture) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const seeds = [];

    for (let i = 0; i < count; i++) {
        const seed = makeParticleSeed(crestBias);
        seeds.push(seed);
        writeParticle(positions, i, seed, 0);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        map: texture,
        transparent: true,
        opacity,
        size,
        sizeAttenuation: true,
        depthWrite: false,
        depthTest: true,
        fog: false
    });

    const points = new THREE.Points(geometry, material);
    points.renderOrder = 14;
    points.userData.seeds = seeds;
    points.userData.positions = positions;
    return points;
}

function updateParticleLayer(points, time) {
    const seeds = points.userData.seeds;
    const positions = points.userData.positions;

    for (let i = 0; i < seeds.length; i++) {
        writeParticle(positions, i, seeds[i], time);
    }

    points.geometry.attributes.position.needsUpdate = true;
}

export function createAvalanche(scene) {
    const group = new THREE.Group();
    group.name = 'Avalanche';

    const powderTexture = makePowderTexture();
    const veils = [];

    for (let i = 0; i < VEIL_COUNT; i++) {
        const veil = createVeil(i);
        veils.push(veil);
        group.add(veil);
    }

    const billboards = createBillboards(powderTexture);
    const fineParticles = createParticleLayer(FINE_PARTICLES, 0.24, 0.82, 0.42, powderTexture);
    const heavyParticles = createParticleLayer(HEAVY_PARTICLES, 0.62, 0.60, 0.22, powderTexture);

    group.add(billboards, fineParticles, heavyParticles);
    group.userData.veils = veils;
    group.userData.billboards = billboards;
    group.userData.particleLayers = [fineParticles, heavyParticles];

    scene.add(group);
    return group;
}

export function updateAvalanche(avalanche, skierPosition, delta, time, gap = FRONT_DISTANCE) {
    const follow = 1 - Math.exp(-10 * delta);

    // Centre on the skiable plane so the skier can dodge laterally inside it
    avalanche.position.x += (0 - avalanche.position.x) * follow;
    avalanche.position.y = 0;
    avalanche.position.z = skierPosition.z - gap;

    for (let i = 0; i < avalanche.userData.veils.length; i++) {
        const veil = avalanche.userData.veils[i];
        veil.material.opacity = veil.userData.baseOpacity + Math.sin(time * 1.55 + veil.userData.phase) * 0.035;
        veil.position.z = -i * (CLOUD_DEPTH / (VEIL_COUNT - 1)) + Math.sin(time * 0.9 + i * 1.4) * 0.16;
    }

    updateBillboards(avalanche.userData.billboards, time);
    for (const layer of avalanche.userData.particleLayers) {
        updateParticleLayer(layer, time);
    }
}
