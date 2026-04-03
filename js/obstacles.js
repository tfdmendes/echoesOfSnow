import * as THREE from 'three';

const MIN_SPACING   = 3.5;
const EDGE_MARGIN   = 2.0;
const SKIER_RADIUS = 0.45;

const BASE_MIN = 3;
const BASE_MAX = 6;
const HARD_MIN = 6;
const HARD_MAX = 12;

// Shared geometries
const TRUNK_GEO  = new THREE.CylinderGeometry(0.12, 0.16, 1.4, 8);
const CANOPY_BOT = new THREE.ConeGeometry(1.0, 2.0, 8);
const CANOPY_MID = new THREE.ConeGeometry(0.75, 1.5, 8);
const CANOPY_TOP = new THREE.ConeGeometry(0.5, 1.1, 8);
const ROCK_SM    = new THREE.DodecahedronGeometry(0.5, 0);
const ROCK_LG    = new THREE.DodecahedronGeometry(0.9, 1);


const trunkMat      = new THREE.MeshPhongMaterial({ color: 0x4a3728 });
const canopyMat     = new THREE.MeshPhongMaterial({ color: 0x2d5a27 });
const canopyDarkMat = new THREE.MeshPhongMaterial({ color: 0x1e4a1a });
const rockMat       = new THREE.MeshPhongMaterial({ color: 0x6b6b6b, flatShading: true });
const rockDarkMat   = new THREE.MeshPhongMaterial({ color: 0x505050, flatShading: true });

// Snowman materials
const snowballMat = new THREE.MeshPhongMaterial({ color: 0xf0f0f0 });
const carrotMat   = new THREE.MeshPhongMaterial({ color: 0xe87020 });
const coalMat     = new THREE.MeshPhongMaterial({ color: 0x111111 });
const stickMat    = new THREE.MeshPhongMaterial({ color: 0x5a3a1a });

// Fallen log materials
const barkMat     = new THREE.MeshPhongMaterial({ color: 0x5c3d1e });
const barkDarkMat = new THREE.MeshPhongMaterial({ color: 0x3e2912 });

// Stump material (reuses barkMat)
const stumpRingMat = new THREE.MeshPhongMaterial({ color: 0x9e7e5a });

// Fence materials
const fencePostMat  = new THREE.MeshPhongMaterial({ color: 0x6e4b2a });
const fencePlankMat = new THREE.MeshPhongMaterial({ color: 0x8b6841 });

// Shared geometries for new obstacles
const SNOWBALL_BOT = new THREE.SphereGeometry(0.38, 12, 10);
const SNOWBALL_MID = new THREE.SphereGeometry(0.28, 12, 10);
const SNOWBALL_TOP = new THREE.SphereGeometry(0.20, 12, 10);
const CARROT_GEO   = new THREE.ConeGeometry(0.04, 0.18, 6);
const COAL_GEO     = new THREE.SphereGeometry(0.03, 6, 6);
const STICK_GEO    = new THREE.CylinderGeometry(0.015, 0.012, 0.32, 5);

const LOG_GEO      = new THREE.CylinderGeometry(0.18, 0.20, 2.0, 10);
const LOG_LG_GEO   = new THREE.CylinderGeometry(0.22, 0.25, 2.8, 10);

const STUMP_GEO    = new THREE.CylinderGeometry(0.22, 0.28, 0.35, 10);
const STUMP_TOP    = new THREE.CylinderGeometry(0.21, 0.22, 0.04, 10);

const FENCE_POST_GEO  = new THREE.BoxGeometry(0.10, 0.90, 0.10);
const FENCE_PLANK_GEO = new THREE.BoxGeometry(0.06, 0.08, 1.8);

// Lantern on top of lit fence posts
const LANTERN_GEO = new THREE.BoxGeometry(0.12, 0.14, 0.12);
const lanternMat  = new THREE.MeshPhongMaterial({
    color:    0xffcc66,
    emissive: 0xffaa33,
    emissiveIntensity: 1.5,
});



// Pine tree: 3 layered cones + trunk
function createTree() {
    const group = new THREE.Group();

    const trunk = new THREE.Mesh(TRUNK_GEO, trunkMat);
    trunk.position.y = 0.7;
    trunk.castShadow = true;

    // Random shade so the forest is not uniform
    const mat = Math.random() > 0.5 ? canopyMat : canopyDarkMat;

    const c1 = new THREE.Mesh(CANOPY_BOT, mat);
    c1.position.y = 1.8;
    c1.castShadow = true;

    const c2 = new THREE.Mesh(CANOPY_MID, mat);
    c2.position.y = 2.7;
    c2.castShadow = true;

    const c3 = new THREE.Mesh(CANOPY_TOP, mat);
    c3.position.y = 3.4;
    c3.castShadow = true;

    group.add(trunk, c1, c2, c3);

    // Random scale for visual variety
    const s = 0.7 + Math.random() * 0.5;
    group.scale.set(s, s, s);
    group.userData.collisionRadius = 0.35 * s;

    return group;
}



// Rock: single dodecahedron with flat shading
function createRock() {
    const group = new THREE.Group();

    const isLarge = Math.random() > 0.5;
    const geo = isLarge ? ROCK_LG : ROCK_SM;
    const mat = Math.random() > 0.5 ? rockMat : rockDarkMat;

    const rock = new THREE.Mesh(geo, mat);
    rock.position.y = isLarge ? 0.5 : 0.3;
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    rock.castShadow = true;

    group.add(rock);
    group.userData.collisionRadius = isLarge ? 0.75 : 0.4;

    return group;
}



// Snowman: 3 stacked spheres, carrot nose, coal eyes, stick arms
function createSnowman() {
    const group = new THREE.Group();

    // Bottom sphere
    const bottom = new THREE.Mesh(SNOWBALL_BOT, snowballMat);
    bottom.position.y = 0.38;
    bottom.castShadow = true;

    // Middle sphere
    const middle = new THREE.Mesh(SNOWBALL_MID, snowballMat);
    middle.position.y = 0.90;
    middle.castShadow = true;

    // Top sphere (head)
    const head = new THREE.Mesh(SNOWBALL_TOP, snowballMat);
    head.position.y = 1.30;
    head.castShadow = true;

    // Carrot nose pointing forward
    const nose = new THREE.Mesh(CARROT_GEO, carrotMat);
    nose.position.set(0, 1.30, 0.20);
    nose.rotation.x = Math.PI / 2;

    // Coal eyes
    const eyeL = new THREE.Mesh(COAL_GEO, coalMat);
    eyeL.position.set(-0.07, 1.36, 0.17);
    const eyeR = new THREE.Mesh(COAL_GEO, coalMat);
    eyeR.position.set(0.07, 1.36, 0.17);

    // Stick arms angled outward
    const armL = new THREE.Mesh(STICK_GEO, stickMat);
    armL.position.set(-0.42, 0.92, 0);
    armL.rotation.z = -0.6;
    armL.castShadow = true;

    const armR = new THREE.Mesh(STICK_GEO, stickMat);
    armR.position.set(0.42, 0.92, 0);
    armR.rotation.z = 0.6;
    armR.castShadow = true;

    group.add(bottom, middle, head, nose, eyeL, eyeR, armL, armR);

    // Slight random rotation so they don't all face the same way
    group.rotation.y = Math.random() * Math.PI * 2;

    const s = 0.85 + Math.random() * 0.3;
    group.scale.set(s, s, s);
    group.userData.collisionRadius = 0.4 * s;

    return group;
}



// Fallen log: horizontal cylinder lying on the ground
function createFallenLog() {
    const group = new THREE.Group();

    const isLarge = Math.random() > 0.5;
    const geo = isLarge ? LOG_LG_GEO : LOG_GEO;
    const mat = Math.random() > 0.5 ? barkMat : barkDarkMat;

    const log = new THREE.Mesh(geo, mat);
    // Rotate so it lies flat along X axis
    log.rotation.z = Math.PI / 2;
    log.position.y = isLarge ? 0.25 : 0.20;
    log.castShadow = true;

    group.add(log);

    // Random rotation around Y so logs point in different directions
    group.rotation.y = Math.random() * Math.PI;

    group.userData.collisionRadius = isLarge ? 0.9 : 0.7;

    return group;
}



// Tree stump: short, wide cylinder with a lighter top ring
function createStump() {
    const group = new THREE.Group();

    const stump = new THREE.Mesh(STUMP_GEO, barkMat);
    stump.position.y = 0.175;
    stump.castShadow = true;

    // Lighter top to show the cut surface / rings
    const top = new THREE.Mesh(STUMP_TOP, stumpRingMat);
    top.position.y = 0.37;

    group.add(stump, top);

    const s = 0.8 + Math.random() * 0.4;
    group.scale.set(s, s, s);
    group.userData.collisionRadius = 0.3 * s;

    return group;
}



// Wooden fence: two posts with two horizontal planks between them
function createFence() {
    const group = new THREE.Group();

    // Left post
    const postL = new THREE.Mesh(FENCE_POST_GEO, fencePostMat);
    postL.position.set(0, 0.45, -0.85);
    postL.castShadow = true;

    // Right post
    const postR = new THREE.Mesh(FENCE_POST_GEO, fencePostMat);
    postR.position.set(0, 0.45, 0.85);
    postR.castShadow = true;

    // Top plank connecting the two posts
    const plankTop = new THREE.Mesh(FENCE_PLANK_GEO, fencePlankMat);
    plankTop.position.set(0, 0.72, 0);
    plankTop.castShadow = true;

    // Bottom plank
    const plankBot = new THREE.Mesh(FENCE_PLANK_GEO, fencePlankMat);
    plankBot.position.set(0, 0.35, 0);
    plankBot.castShadow = true;

    group.add(postL, postR, plankTop, plankBot);

    // Random rotation so fences face different directions
    group.rotation.y = Math.random() * Math.PI;

    group.userData.collisionRadius = 0.9;

    return group;
}



// Lit fence: same structure as a regular fence but with a small
// glowing lantern on top of each post. The lantern uses an emissive
// material so it visually glows with no lighting cost. The actual
// night illumination comes from a few global PointLights in scene.js
// that follow the skier.
function createLitFence() {
    const group = new THREE.Group();

    // Left post
    const postL = new THREE.Mesh(FENCE_POST_GEO, fencePostMat);
    postL.position.set(0, 0.45, -0.85);
    postL.castShadow = true;

    // Right post
    const postR = new THREE.Mesh(FENCE_POST_GEO, fencePostMat);
    postR.position.set(0, 0.45, 0.85);
    postR.castShadow = true;

    // Planks
    const plankTop = new THREE.Mesh(FENCE_PLANK_GEO, fencePlankMat);
    plankTop.position.set(0, 0.72, 0);
    plankTop.castShadow = true;

    const plankBot = new THREE.Mesh(FENCE_PLANK_GEO, fencePlankMat);
    plankBot.position.set(0, 0.35, 0);
    plankBot.castShadow = true;

    // Emissive lantern on left post (glows for free, no PointLight needed)
    const lanternL = new THREE.Mesh(LANTERN_GEO, lanternMat);
    lanternL.position.set(0, 0.97, -0.85);

    // Emissive lantern on right post
    const lanternR = new THREE.Mesh(LANTERN_GEO, lanternMat);
    lanternR.position.set(0, 0.97, 0.85);

    group.add(postL, postR, plankTop, plankBot, lanternL, lanternR);

    group.rotation.y = Math.random() * Math.PI;
    group.userData.collisionRadius = 0.9;
    group.userData.isLitFence = true;

    return group;
}



// Weighted random selection across all obstacle types.
// Trees are still the most common since they define the visual theme.
//
// During day:
//   tree 30%  |  rock 15%  |  snowman 15%
//   log  15%  |  stump 10% |  fence 15%
//
// During night: regular fences become lit fences, and their
// spawn rate goes up to 25% so the slope is dotted with lights.
//   tree 25%  |  rock 12%  |  snowman 12%
//   log  13%  |  stump 13% |  litFence 25%
function pickObstacle(isNight) {
    const r = Math.random();
    if (isNight) {
        if (r < 0.25) return createTree();
        if (r < 0.37) return createRock();
        if (r < 0.49) return createSnowman();
        if (r < 0.62) return createFallenLog();
        if (r < 0.75) return createStump();
        return createLitFence();
    }
    if (r < 0.30) return createTree();
    if (r < 0.45) return createRock();
    if (r < 0.60) return createSnowman();
    if (r < 0.75) return createFallenLog();
    if (r < 0.85) return createStump();
    return createFence();
}



export function populateChunk(chunkGroup, chunkLength, chunkWidth, score, isNight) {
    // Every 400m of score, add 1 to the minimum obstacle count.
    // Every 300m of score, add 1 to the maximum obstacle count.
    // Both capped at their HARD ceiling so the game stays playable.
    const s = score || 0;
    const minCount = Math.min(HARD_MIN, BASE_MIN + Math.floor(s / 400));
    const maxCount = Math.min(HARD_MAX, BASE_MAX + Math.floor(s / 300));

    const obstacles = [];
    const count = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));
    const halfW = chunkWidth  / 2 - EDGE_MARGIN;
    const halfL = chunkLength / 2 - EDGE_MARGIN;

    for (let i = 0; i < count; i++) {
        const lx = (Math.random() * 2 - 1) * halfW;
        const lz = (Math.random() * 2 - 1) * halfL;

        let tooClose = false;
        for (const ob of obstacles) {
            const dx = lx - ob.localX;
            const dz = lz - ob.localZ;
            if (Math.sqrt(dx * dx + dz * dz) < MIN_SPACING) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;

        const mesh = pickObstacle(isNight);
        mesh.position.set(lx, 0, lz);
        chunkGroup.add(mesh);

        obstacles.push({
            mesh,
            localX: lx,
            localZ: lz,
            radius: mesh.userData.collisionRadius
        });
    }

    chunkGroup.userData.obstacles = obstacles;
}



export function clearChunk(chunkGroup) {
    const obs = chunkGroup.userData.obstacles || [];
    for (const ob of obs) {
        chunkGroup.remove(ob.mesh);
    }
    chunkGroup.userData.obstacles = [];
}



export function checkCollisions(skierPos, chunks) {
    for (const chunk of chunks) {
        const obs = chunk.userData.obstacles || [];
        for (const ob of obs) {
            const wx = chunk.position.x + ob.localX;
            const wz = chunk.position.z + ob.localZ;

            const dx = skierPos.x - wx;
            const dz = skierPos.z - wz;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < SKIER_RADIUS + ob.radius) {
                return true;
            }
        }
    }
    return false;
}