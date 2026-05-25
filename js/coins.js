/*
Author: Tiago Mendes 119378
        OpenAI ChatGPT 5.5 Thinking

Coin system for Echoes of Snow.

This module manages the collectible snowflake coins used by the game:
- builds the coin geometry procedurally using small Three.js primitives;
- stores wallet, lifetime coins and best run values in localStorage;
- places coins inside terrain chunks while avoiding obstacles;
- checks if the skier is close enough to collect a coin;
- updates coin animation, including bobbing, spinning and emissive intensity.

AI-assisted code blocks are commented below
*/


import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getBiome } from './biomes.js';

const SAVE_KEY = 'echoes-of-snow:save';
const SAVE_VERSION = 1;

const COIN_PICKUP_RADIUS = 0.55;
const SKIER_PICKUP_RADIUS = 0.45;
const COIN_HEIGHT       = 0.95;
const COIN_BOB_AMP      = 0.08;
const COIN_BOB_FREQ     = 1.5;
const COIN_SPIN_RATE    = 2.0;

const COIN_EMISSIVE_DAY   = 0.38;
const COIN_EMISSIVE_NIGHT = 0.70;

const COIN_MIN_PER_CHUNK = 2;
const COIN_MAX_PER_CHUNK = 5;
const COIN_OBSTACLE_CLEARANCE = 1.4;
const COIN_SELF_SPACING = 1.2;
const COIN_PLACEMENT_ATTEMPTS = 3;
const COIN_EDGE_MARGIN = 2.5;

// AI-assisted block:
function buildSnowflakeGeometry() {
    const armLength   = 0.50;
    const armRadius   = 0.045;
    const tipRadius   = 0.020;
    const branchLen   = 0.20;
    const branchRad   = 0.030;
    const tipBranchLen = 0.14;
    const tipBranchRad = 0.022;
    const hubRadius   = 0.10;
    const hubDepth    = 0.07;
    const branchAngle = Math.PI / 3;  // 60° off the arm

    const parts = [];

    // Hub: short hexagonal prism with its axis along Z so the flake plane is XY
    const hub = new THREE.CylinderGeometry(hubRadius, hubRadius, hubDepth, 6);
    hub.rotateX(Math.PI / 2);
    parts.push(hub);

    // Arm template: a tapered cylinder rising along +Y, base at origin
    const armProto = new THREE.CylinderGeometry(tipRadius, armRadius, armLength, 6);
    armProto.translate(0, armLength / 2, 0);

    // Side-branch template
    const branchProto = new THREE.CylinderGeometry(branchRad * 0.55, branchRad, branchLen, 5);
    branchProto.translate(0, branchLen / 2, 0);

    // Tip-fork template: smaller branch placed near the arm tip
    const tipBranchProto = new THREE.CylinderGeometry(tipBranchRad * 0.5, tipBranchRad, tipBranchLen, 5);
    tipBranchProto.translate(0, tipBranchLen / 2, 0);

    const sideBranchHeights = [0.42, 0.72];

    for (let i = 0; i < 6; i++) {
        const armAngle = (i / 6) * Math.PI * 2;

        const arm = armProto.clone();
        arm.rotateZ(armAngle);
        parts.push(arm);

        for (const t of sideBranchHeights) {
            const left = branchProto.clone();
            left.rotateZ(branchAngle);
            left.translate(0, armLength * t, 0);
            left.rotateZ(armAngle);
            parts.push(left);

            const right = branchProto.clone();
            right.rotateZ(-branchAngle);
            right.translate(0, armLength * t, 0);
            right.rotateZ(armAngle);
            parts.push(right);
        }

        const tipL = tipBranchProto.clone();
        tipL.rotateZ(branchAngle * 0.85);
        tipL.translate(0, armLength * 0.92, 0);
        tipL.rotateZ(armAngle);
        parts.push(tipL);

        const tipR = tipBranchProto.clone();
        tipR.rotateZ(-branchAngle * 0.85);
        tipR.translate(0, armLength * 0.92, 0);
        tipR.rotateZ(armAngle);
        parts.push(tipR);
    }

    const merged = mergeGeometries(parts, false);
    merged.computeVertexNormals();
    return merged;
}

const COIN_GEOMETRY = buildSnowflakeGeometry();

const COIN_MATERIAL = new THREE.MeshStandardMaterial({
    color:             0xe8f1ff,
    emissive:          0xa8cce8,
    emissiveIntensity: COIN_EMISSIVE_DAY,
    metalness:         0.25,
    roughness:         0.4,
});


let wallet = 0;
let totalCollected = 0;
let bestRun = 0;
let bestScore = 0;
let runCoins = 0;

export function loadSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || data.v !== SAVE_VERSION) return;
        wallet = data.wallet | 0;
        totalCollected = data.totalCollected | 0;
        bestRun = data.bestRun | 0;
        bestScore = data.bestScore | 0;
    } catch (_) {
        wallet = 0;
        totalCollected = 0;
        bestRun = 0;
        bestScore = 0;
    }
}

function persist() {
    try {
        const payload = JSON.stringify({
            v: SAVE_VERSION,
            wallet,
            totalCollected,
            bestRun,
            bestScore,
        });
        localStorage.setItem(SAVE_KEY, payload);
    } catch (_) {
        // private mode / quota — wallet stays in-memory for the session
    }
}

export function getWallet()    { return wallet; }
export function getRunCoins()  { return runCoins; }
export function getBestRun()   { return bestRun; }
export function getBestScore() { return bestScore; }
export function getLifetime()  { return totalCollected; }

// Returns true if this run beat the previous best score
export function recordRunScore(score) {
    const s = Math.floor(score) | 0;
    if (s > bestScore) {
        bestScore = s;
        persist();
        return true;
    }
    return false;
}

export function resetRunCoins() {
    runCoins = 0;
}

export function commitRunToWallet() {
    wallet += runCoins;
    totalCollected += runCoins;
    if (runCoins > bestRun) bestRun = runCoins;
    persist();
    const banked = runCoins;
    runCoins = 0;
    return banked;
}

export function spend(amount) {
    if (amount <= 0 || amount > wallet) return false;
    wallet -= amount;
    persist();
    return true;
}

// AI-assisted logic:
// Rejection sampling used to place coins while keeping distance from obstacles and other coins.
function rejectionSample(halfW, halfL, obstacles, placed) {
    for (let attempt = 0; attempt < COIN_PLACEMENT_ATTEMPTS; attempt++) {
        const lx = (Math.random() * 2 - 1) * halfW;
        const lz = (Math.random() * 2 - 1) * halfL;

        let bad = false;
        for (const ob of obstacles) {
            const dx = lx - ob.localX;
            const dz = lz - ob.localZ;
            if (dx * dx + dz * dz < COIN_OBSTACLE_CLEARANCE * COIN_OBSTACLE_CLEARANCE) {
                bad = true;
                break;
            }
        }
        if (bad) continue;

        for (const c of placed) {
            const dx = lx - c.localX;
            const dz = lz - c.localZ;
            if (dx * dx + dz * dz < COIN_SELF_SPACING * COIN_SELF_SPACING) {
                bad = true;
                break;
            }
        }
        if (bad) continue;

        return { lx, lz };
    }
    return null;
}

export function populateChunkCoins(chunkGroup, chunkLength, chunkWidth, biomeName) {
    const biome = getBiome(biomeName);
    const density = biome.coinDensityMultiplier ?? 1.0;
    const baseCount = COIN_MIN_PER_CHUNK
        + Math.floor(Math.random() * (COIN_MAX_PER_CHUNK - COIN_MIN_PER_CHUNK + 1));
    const target = Math.round(baseCount * density);

    const obstacles = chunkGroup.userData.obstacles || [];
    const halfW = chunkWidth / 2 - COIN_EDGE_MARGIN;
    const halfL = chunkLength / 2 - COIN_EDGE_MARGIN;

    const coins = [];
    for (let i = 0; i < target; i++) {
        const spot = rejectionSample(halfW, halfL, obstacles, coins);
        if (!spot) continue;

        const mesh = new THREE.Mesh(COIN_GEOMETRY, COIN_MATERIAL);
        mesh.position.set(spot.lx, COIN_HEIGHT, spot.lz);
        mesh.castShadow = true;
        chunkGroup.add(mesh);

        coins.push({
            mesh,
            localX: spot.lx,
            localZ: spot.lz,
            baseY: COIN_HEIGHT,
            bobOffset: Math.random() * Math.PI * 2,
            collected: false,
        });
    }

    chunkGroup.userData.coins = coins;
}

export function clearChunkCoins(chunkGroup) {
    const coins = chunkGroup.userData.coins || [];
    for (const c of coins) {
        chunkGroup.remove(c.mesh);
    }
    chunkGroup.userData.coins = [];
}

export function updateCoins(chunks, time, nightFactor = 0) {
    COIN_MATERIAL.emissiveIntensity =
        COIN_EMISSIVE_DAY + (COIN_EMISSIVE_NIGHT - COIN_EMISSIVE_DAY) * nightFactor;

    for (const chunk of chunks) {
        const coins = chunk.userData.coins;
        if (!coins || coins.length === 0) continue;
        for (const c of coins) {
            if (c.collected) continue;
            c.mesh.rotation.y = time * COIN_SPIN_RATE;
            c.mesh.position.y = c.baseY
                + Math.sin(time * COIN_BOB_FREQ * Math.PI * 2 + c.bobOffset) * COIN_BOB_AMP;
        }
    }
}

export function checkCoinPickup(skierPos, chunks) {
    const limit = SKIER_PICKUP_RADIUS + COIN_PICKUP_RADIUS;
    const limitSq = limit * limit;
    let picked = 0;

    for (const chunk of chunks) {
        const coins = chunk.userData.coins;
        if (!coins || coins.length === 0) continue;
        for (const c of coins) {
            if (c.collected) continue;
            const wx = chunk.position.x + c.localX;
            const wz = chunk.position.z + c.localZ;
            const dx = skierPos.x - wx;
            const dz = skierPos.z - wz;
            if (dx * dx + dz * dz <= limitSq) {
                c.collected = true;
                c.mesh.visible = false;
                picked++;
            }
        }
    }

    if (picked > 0) runCoins += picked;
    return picked;
}
