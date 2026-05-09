import * as THREE from 'three';
import { createCircleCollider, createOrientedBoxCollider } from './collision.js';
import { getBiome, BIOME_BASE, BIOME_FOREST } from './biomes.js';

const EDGE_MARGIN = 2.0;

const BASE_MIN = 3;
const BASE_MAX = 6;
const HARD_MIN = 6;
const HARD_MAX = 12;

const PINE_STD_TRUNK = new THREE.CylinderGeometry(0.20, 0.27, 3.4, 8);
const PINE_STD_C1 = new THREE.ConeGeometry(1.30, 2.6, 8);
const PINE_STD_C2 = new THREE.ConeGeometry(1.00, 2.0, 8);
const PINE_STD_C3 = new THREE.ConeGeometry(0.65, 1.4, 8);

const PINE_ALP_TRUNK = new THREE.CylinderGeometry(0.18, 0.24, 5.0, 8);
const PINE_ALP_C1 = new THREE.ConeGeometry(1.05, 2.0, 8);
const PINE_ALP_C2 = new THREE.ConeGeometry(0.80, 1.7, 8);
const PINE_ALP_C3 = new THREE.ConeGeometry(0.58, 1.4, 8);
const PINE_ALP_C4 = new THREE.ConeGeometry(0.36, 1.1, 8);

const BUSHY_TRUNK = new THREE.CylinderGeometry(0.32, 0.42, 3.2, 10);
const BUSHY_BLOB_LG = new THREE.SphereGeometry(1.20, 12, 9);
const BUSHY_BLOB_SM = new THREE.SphereGeometry(0.78, 10, 7);

const FIREFLY_GEO = new THREE.SphereGeometry(0.08, 8, 6);
const fireflyMat = new THREE.MeshBasicMaterial({
    color: 0xffe070,
    transparent: true,
    opacity: 0,
    fog: false,
});

function makeFireflyGlowTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0.0, 'rgba(255, 250, 220, 1.0)');
    gradient.addColorStop(0.3, 'rgba(255, 230, 130, 0.50)');
    gradient.addColorStop(1.0, 'rgba(255, 210, 80, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(canvas);
}

const FIREFLY_GLOW_TEXTURE = makeFireflyGlowTexture();
const fireflyHaloMat = new THREE.SpriteMaterial({
    map: FIREFLY_GLOW_TEXTURE,
    color: 0xffe070,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
    opacity: 0,
});

const ROCK_SM = new THREE.DodecahedronGeometry(0.5, 0);
const ROCK_LG = new THREE.DodecahedronGeometry(0.9, 1);


const textureLoader = new THREE.TextureLoader();

function loadTexture(path, onLoaded) {
    textureLoader.load(
        path,
        (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.anisotropy = 8;
            onLoaded(tex);
        },
        undefined,
        () => console.warn('Texture missing:', path)
    );
}

function tiledClone(tex, repeatU, repeatV) {
    const c = tex.clone();
    c.wrapS = THREE.RepeatWrapping;
    c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeatU, repeatV);
    c.anisotropy = 8;
    c.needsUpdate = true;
    return c;
}

const trunkMatStd   = new THREE.MeshPhongMaterial({ color: 0x8a6a47, shininess: 5 });
const trunkMatAlp   = new THREE.MeshPhongMaterial({ color: 0x7a6750, shininess: 4 });
const trunkMatWide  = new THREE.MeshPhongMaterial({ color: 0xa3835a, shininess: 6 });

loadTexture('assets/textures/bark/bark_brown_02_diff_1k.jpg', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;

    trunkMatStd.map  = tiledClone(tex, 1, 2);
    trunkMatStd.color.setHex(0xffffff);
    trunkMatStd.needsUpdate = true;

    trunkMatAlp.map  = tiledClone(tex, 1, 4);
    trunkMatAlp.color.setHex(0xc8c0b0);
    trunkMatAlp.needsUpdate = true;

    trunkMatWide.map = tiledClone(tex, 2, 1);
    trunkMatWide.color.setHex(0xe8d0a8);
    trunkMatWide.needsUpdate = true;
});

loadTexture('assets/textures/bark/bark_brown_02_nor_gl_1k.jpg', (tex) => {
    trunkMatStd.normalMap  = tiledClone(tex, 1, 2);
    trunkMatStd.normalScale.set(0.8, 0.8);
    trunkMatStd.needsUpdate = true;

    trunkMatAlp.normalMap  = tiledClone(tex, 1, 4);
    trunkMatAlp.normalScale.set(0.6, 0.6);
    trunkMatAlp.needsUpdate = true;

    trunkMatWide.normalMap = tiledClone(tex, 2, 1);
    trunkMatWide.normalScale.set(1.0, 1.0);
    trunkMatWide.needsUpdate = true;
});

function makeCanopyTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, size, size);

    function drawSeamless(x, y, r, fill) {
        ctx.fillStyle = fill;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                ctx.beginPath();
                ctx.arc(x + dx * size, y + dy * size, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    for (let i = 0; i < 70; i++) {
        const r = 6 + Math.random() * 18;
        const v = 150 + Math.random() * 70;
        drawSeamless(Math.random() * size, Math.random() * size, r,
            `rgba(${v}, ${v}, ${v}, 0.55)`);
    }

    for (let i = 0; i < 35; i++) {
        const r = 3 + Math.random() * 7;
        const v = 30 + Math.random() * 40;
        drawSeamless(Math.random() * size, Math.random() * size, r,
            `rgba(${v}, ${v}, ${v}, 0.45)`);
    }

    for (let i = 0; i < 220; i++) {
        const r = 0.6 + Math.random() * 1.8;
        drawSeamless(Math.random() * size, Math.random() * size, r,
            `rgba(255, 255, 255, ${0.3 + Math.random() * 0.4})`);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = 4;
    return tex;
}

const CANOPY_TEXTURE = makeCanopyTexture();

const CANOPY_VARIANT_COUNT = 6;
const canopyVariants = [];
for (let i = 0; i < CANOPY_VARIANT_COUNT; i++) {
    const hue = 0.30 + (Math.random() - 0.5) * 0.05;
    const sat = 0.45 + Math.random() * 0.20;
    const light = 0.30 + Math.random() * 0.15;
    canopyVariants.push(new THREE.MeshPhongMaterial({
        color: new THREE.Color().setHSL(hue, sat, light),
        map: CANOPY_TEXTURE,
    }));
}
const rockMat = new THREE.MeshPhongMaterial({ color: 0x6b6b6b, flatShading: true });
const rockDarkMat = new THREE.MeshPhongMaterial({ color: 0x505050, flatShading: true });

// Snowman materials
const snowballMat = new THREE.MeshPhongMaterial({ color: 0xf0f0f0 });
const carrotMat = new THREE.MeshPhongMaterial({ color: 0xe87020 });
const coalMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
const stickMat = new THREE.MeshPhongMaterial({ color: 0x5a3a1a });

// Fallen log materials
const barkMat = new THREE.MeshPhongMaterial({ color: 0x5c3d1e });
const barkDarkMat = new THREE.MeshPhongMaterial({ color: 0x3e2912 });

// Stump material (reuses barkMat)
const stumpRingMat = new THREE.MeshPhongMaterial({ color: 0x9e7e5a });

// Fence materials
const fencePostMat = new THREE.MeshPhongMaterial({ color: 0x6e4b2a });
const fencePlankMat = new THREE.MeshPhongMaterial({ color: 0x8b6841 });

// Shared geometries for new obstacles
const SNOWBALL_BOT = new THREE.SphereGeometry(0.38, 12, 10);
const SNOWBALL_MID = new THREE.SphereGeometry(0.28, 12, 10);
const SNOWBALL_TOP = new THREE.SphereGeometry(0.20, 12, 10);
const CARROT_GEO = new THREE.ConeGeometry(0.04, 0.18, 6);
const COAL_GEO = new THREE.SphereGeometry(0.03, 6, 6);
const STICK_GEO = new THREE.CylinderGeometry(0.015, 0.012, 0.32, 5);

const LOG_GEO = new THREE.CylinderGeometry(0.18, 0.20, 2.0, 10);
const LOG_LG_GEO = new THREE.CylinderGeometry(0.22, 0.25, 2.8, 10);

const STUMP_GEO = new THREE.CylinderGeometry(0.22, 0.28, 0.35, 10);
const STUMP_TOP = new THREE.CylinderGeometry(0.21, 0.22, 0.04, 10);

const FENCE_POST_GEO = new THREE.BoxGeometry(0.10, 0.90, 0.10);
const FENCE_PLANK_GEO = new THREE.BoxGeometry(0.06, 0.08, 1.8);

// Lantern on top of lit fence posts
const LANTERN_GEO = new THREE.BoxGeometry(0.12, 0.14, 0.12);
const lanternMat = new THREE.MeshPhongMaterial({
    color: 0xffcc66,
    emissive: 0xffaa33,
    emissiveIntensity: 1.5,
});

// Lamppost shared geometries and materials
const LAMPPOST_POLE_GEO    = new THREE.CylinderGeometry(0.05, 0.09, 4.5, 8);   // tapers toward the top
const LAMPPOST_ARM_GEO     = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6);
const LAMPPOST_HOOD_GEO    = new THREE.ConeGeometry(0.28, 0.18, 8);            // downward shade
const LAMPPOST_BULB_GEO    = new THREE.SphereGeometry(0.14, 10, 8);
const LAMPPOST_BASE_GEO    = new THREE.CylinderGeometry(0.20, 0.26, 0.15, 10);
const LAMPPOST_COLLAR_GEO  = new THREE.CylinderGeometry(0.08, 0.06, 0.10, 8);  // joint between pole and arm

const lamppostPoleMat = new THREE.MeshPhongMaterial({ color: 0x3a3a3a, shininess: 60 });
const lamppostHoodMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a, shininess: 40 });
const lamppostBulbMat = new THREE.MeshPhongMaterial({
    color:             0xffeecc,
    emissive:          0xffcc55,
    emissiveIntensity: 2.5,
    transparent:       true,
    opacity:           0.92,
});



function pickCanopyMat() {
    return canopyVariants[Math.floor(Math.random() * canopyVariants.length)];
}

function jitterCanopy(mesh, amount = 0.06, baseWidth = 1.0) {
    mesh.rotation.y = (Math.random() - 0.5) * amount * 4;
    const sj = baseWidth * (1 + (Math.random() - 0.5) * amount);
    mesh.scale.x = mesh.scale.z = sj;
}

function createPineStandard() {
    const group = new THREE.Group();

    const trunkW = 0.80 + Math.random() * 0.55;
    const canopyW = 0.80 + Math.random() * 0.50;

    const trunk = new THREE.Mesh(PINE_STD_TRUNK, trunkMatStd);
    trunk.position.y = 1.7;
    trunk.scale.x = trunk.scale.z = trunkW;
    trunk.castShadow = true;

    const mat = pickCanopyMat();
    const c1 = new THREE.Mesh(PINE_STD_C1, mat); c1.position.y = 3.80; c1.castShadow = true;
    const c2 = new THREE.Mesh(PINE_STD_C2, mat); c2.position.y = 5.00; c2.castShadow = true;
    const c3 = new THREE.Mesh(PINE_STD_C3, mat); c3.position.y = 6.10; c3.castShadow = true;
    jitterCanopy(c1, 0.06, canopyW);
    jitterCanopy(c2, 0.06, canopyW);
    jitterCanopy(c3, 0.06, canopyW);

    group.add(trunk, c1, c2, c3);

    const s = 1.1 + Math.random() * 0.6;
    group.scale.set(s, s * (1.05 + Math.random() * 0.35), s);
    group.rotation.y = Math.random() * Math.PI * 2;

    group.userData.collider = createCircleCollider(0.40 * s * trunkW);
    return group;
}

function createPineAlpine() {
    const group = new THREE.Group();

    const trunkW = 0.85 + Math.random() * 0.45;
    const canopyW = 0.85 + Math.random() * 0.40;

    const trunk = new THREE.Mesh(PINE_ALP_TRUNK, trunkMatAlp);
    trunk.position.y = 2.5;
    trunk.scale.x = trunk.scale.z = trunkW;
    trunk.castShadow = true;

    const mat = pickCanopyMat();
    const layout = [
        { geo: PINE_ALP_C1, y: 5.40 },
        { geo: PINE_ALP_C2, y: 6.25 },
        { geo: PINE_ALP_C3, y: 7.10 },
        { geo: PINE_ALP_C4, y: 7.75 },
    ];
    const cones = [];
    for (const l of layout) {
        const m = new THREE.Mesh(l.geo, mat);
        m.position.y = l.y;
        m.castShadow = true;
        jitterCanopy(m, 0.04, canopyW);
        cones.push(m);
    }

    group.add(trunk, ...cones);

    const s = 1.1 + Math.random() * 0.5;
    const sY = s * (1.05 + Math.random() * 0.40);
    group.scale.set(s, sY, s);
    group.rotation.y = Math.random() * Math.PI * 2;

    group.userData.collider = createCircleCollider(0.34 * s * trunkW);
    return group;
}

function createClusterBushy() {
    const group = new THREE.Group();

    const trunkW = 0.85 + Math.random() * 0.50;
    const canopyW = 0.85 + Math.random() * 0.45;

    const trunk = new THREE.Mesh(BUSHY_TRUNK, trunkMatWide);
    trunk.position.y = 1.6;
    trunk.scale.x = trunk.scale.z = trunkW;
    trunk.castShadow = true;
    group.add(trunk);

    const mat = pickCanopyMat();
    const blobLayout = [
        { geo: BUSHY_BLOB_LG, x:  0.00, y: 3.60, z:  0.00 },
        { geo: BUSHY_BLOB_LG, x: -0.70, y: 3.85, z:  0.25 },
        { geo: BUSHY_BLOB_LG, x:  0.65, y: 3.90, z: -0.20 },
        { geo: BUSHY_BLOB_SM, x:  0.10, y: 4.45, z:  0.35 },
        { geo: BUSHY_BLOB_SM, x: -0.35, y: 4.35, z: -0.45 },
    ];
    for (const b of blobLayout) {
        const blob = new THREE.Mesh(b.geo, mat);
        blob.position.set(
            b.x + (Math.random() - 0.5) * 0.18,
            b.y + (Math.random() - 0.5) * 0.10,
            b.z + (Math.random() - 0.5) * 0.18
        );
        const sj = canopyW * (0.85 + Math.random() * 0.3);
        blob.scale.set(sj, sj * (0.85 + Math.random() * 0.2), sj);
        blob.rotation.y = Math.random() * Math.PI * 2;
        blob.castShadow = true;
        group.add(blob);
    }

    const s = 1.1 + Math.random() * 0.4;
    group.scale.set(s, s * (0.95 + Math.random() * 0.25), s);
    group.rotation.y = Math.random() * Math.PI * 2;

    group.userData.collider = createCircleCollider(0.72 * s * trunkW);
    return group;
}

function createTree() {
    const r = Math.random();
    if (r < 0.50) return createPineStandard();
    if (r < 0.85) return createPineAlpine();
    return createClusterBushy();
}

function spawnFireflies(chunkGroup, chunkLength, chunkWidth) {
    const count = 7 + Math.floor(Math.random() * 7);
    const halfW = chunkWidth / 2 - 1;
    const halfL = chunkLength / 2 - 1;

    const fireflies = [];
    let cx = 0, cy = 0, cz = 0;

    for (let i = 0; i < count; i++) {
        const ff = new THREE.Mesh(FIREFLY_GEO, fireflyMat);
        const px = (Math.random() * 2 - 1) * halfW;
        const py = 1.5 + Math.random() * 2.8;
        const pz = (Math.random() * 2 - 1) * halfL;
        ff.position.set(px, py, pz);

        const halo = new THREE.Sprite(fireflyHaloMat);
        halo.scale.set(2.2, 2.2, 1);
        ff.add(halo);

        ff.userData.basePos = ff.position.clone();
        ff.userData.bobAmp = 0.25 + Math.random() * 0.45;
        ff.userData.bobFreq = 0.35 + Math.random() * 0.55;
        ff.userData.bobPhase = Math.random() * Math.PI * 2;
        ff.userData.driftAmp = 0.30 + Math.random() * 0.50;
        ff.userData.driftFreq = 0.20 + Math.random() * 0.35;
        ff.userData.driftPhase = Math.random() * Math.PI * 2;
        ff.userData.twinkleFreq = 1.2 + Math.random() * 2.5;
        ff.userData.twinklePhase = Math.random() * Math.PI * 2;
        ff.userData.baseScale = 0.7 + Math.random() * 0.8;

        chunkGroup.add(ff);
        fireflies.push(ff);

        cx += px; cy += py; cz += pz;
    }

    chunkGroup.userData.fireflies = fireflies;
    chunkGroup.userData.fireflyLightLocal = {
        x: cx / count,
        y: cy / count,
        z: cz / count,
    };
}

export function updateFireflies(chunks, time, nightFactor) {
    fireflyMat.opacity = nightFactor;
    fireflyHaloMat.opacity = nightFactor * 0.85;
    if (nightFactor <= 0.01) return;

    for (const chunk of chunks) {
        const fireflies = chunk.userData.fireflies;
        if (!fireflies) continue;

        for (const ff of fireflies) {
            const u = ff.userData;
            const bob = Math.sin(time * u.bobFreq + u.bobPhase) * u.bobAmp;
            const driftX = Math.sin(time * u.driftFreq + u.driftPhase) * u.driftAmp;
            const driftZ = Math.cos(time * u.driftFreq + u.driftPhase * 0.7) * u.driftAmp;
            ff.position.set(
                u.basePos.x + driftX,
                u.basePos.y + bob,
                u.basePos.z + driftZ
            );

            const twinkle = 0.5 + 0.5 * Math.sin(time * u.twinkleFreq + u.twinklePhase);
            const sj = u.baseScale * (0.4 + twinkle * 0.6);
            ff.scale.setScalar(sj);
        }
    }
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

    const s = 1.2 + Math.random() * 0.4;
    group.scale.set(s, s, s);
    group.userData.collider = createCircleCollider((isLarge ? 0.65 : 0.35) * s);

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

    // Uniform scale for variety
    const s = 1.1 + Math.random() * 0.4;
    group.scale.set(s, s, s);
    group.userData.collider = createCircleCollider(0.4 * s);

    return group;
}



// Horizontal log on the ground; oriented-box collision avoids dead zones
function createFallenLog() {
    const group = new THREE.Group();

    const isLarge = Math.random() > 0.5;
    const geo = isLarge ? LOG_LG_GEO : LOG_GEO;
    const mat = Math.random() > 0.5 ? barkMat : barkDarkMat;

    const log = new THREE.Mesh(geo, mat);
    log.rotation.z = Math.PI / 2;
    log.position.y = isLarge ? 0.25 : 0.20;
    log.castShadow = true;

    group.add(log);

    const angle = Math.random() * Math.PI;
    group.rotation.y = angle;

    const s = 1.2 + Math.random() * 0.3;
    group.scale.set(s, s, s);

    const halfLength = (isLarge ? 1.4 : 1.0) * s;   // half cylinder height
    const radius = (isLarge ? 0.30 : 0.25) * s;  // cylinder radius
    group.userData.collider = createOrientedBoxCollider(halfLength, radius, angle);

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

    // Uniform scale for variety
    const s = 1.1 + Math.random() * 0.5;
    group.scale.set(s, s, s);
    group.userData.collider = createCircleCollider(0.3 * s);

    return group;
}



// Two posts with two horizontal planks between them
function createFence() {
    const group = new THREE.Group();

    const postL = new THREE.Mesh(FENCE_POST_GEO, fencePostMat);
    postL.position.set(0, 0.45, -0.85);
    postL.castShadow = true;

    const postR = new THREE.Mesh(FENCE_POST_GEO, fencePostMat);
    postR.position.set(0, 0.45, 0.85);
    postR.castShadow = true;

    const plankTop = new THREE.Mesh(FENCE_PLANK_GEO, fencePlankMat);
    plankTop.position.set(0, 0.72, 0);
    plankTop.castShadow = true;

    const plankBot = new THREE.Mesh(FENCE_PLANK_GEO, fencePlankMat);
    plankBot.position.set(0, 0.35, 0);
    plankBot.castShadow = true;

    group.add(postL, postR, plankTop, plankBot);

    const angle = Math.random() * Math.PI;
    group.rotation.y = angle;

    const s = 1.2 + Math.random() * 0.2;
    group.scale.set(s, s, s);

    // Fence planks: half-extents (1.8 long along Z, 0.10 thick along X)
    const halfLen = 0.95 * s;
    const halfW   = 0.20 * s;
    group.userData.collider = createOrientedBoxCollider(halfW, halfLen, angle);

    return group;
}



// Same as a regular fence, with an emissive lantern on top of each post
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

    // Emissive lantern on left post
    const lanternL = new THREE.Mesh(LANTERN_GEO, lanternMat);
    lanternL.position.set(0, 0.97, -0.85);

    // Emissive lantern on right post
    const lanternR = new THREE.Mesh(LANTERN_GEO, lanternMat);
    lanternR.position.set(0, 0.97, 0.85);

    group.add(postL, postR, plankTop, plankBot, lanternL, lanternR);

    const angle = Math.random() * Math.PI;
    group.rotation.y = angle;

    const s = 1.2 + Math.random() * 0.2;
    group.scale.set(s, s, s);

    const halfLen = 0.95 * s;
    const halfW   = 0.20 * s;
    group.userData.collider = createOrientedBoxCollider(halfW, halfLen, angle);
    group.userData.isLitFence = true;

    return group;
}



// Lampposts share the PointLight pool managed in scene.js; the bulb is
// emissive only, so no PointLight is attached here
function createLamppost(spawnX) {
    const group = new THREE.Group();

    // Arm always points toward the centre of the slope (inward)
    const side = (spawnX > 0) ? -1 : 1;

    // Sturdy base
    const base = new THREE.Mesh(LAMPPOST_BASE_GEO, lamppostPoleMat);
    base.position.y = 0.075;
    base.castShadow = true;

    // Tall vertical pole tapering toward the top
    const pole = new THREE.Mesh(LAMPPOST_POLE_GEO, lamppostPoleMat);
    pole.position.y = 2.325;
    pole.castShadow = true;

    // Collar joint where the arm meets the pole
    const collar = new THREE.Mesh(LAMPPOST_COLLAR_GEO, lamppostPoleMat);
    collar.position.set(0, 4.55, 0);

    // Horizontal arm: rotated 90 deg on Z so the cylinder lies flat along X
    const arm = new THREE.Mesh(LAMPPOST_ARM_GEO, lamppostPoleMat);
    arm.position.set(0.5 * side, 4.55, 0);
    arm.rotation.z = Math.PI / 2;
    arm.castShadow = true;

    // Downward-facing conical hood (shade) at the end of the arm
    const hood = new THREE.Mesh(LAMPPOST_HOOD_GEO, lamppostHoodMat);
    hood.position.set(0.95 * side, 4.48, 0);
    hood.rotation.x = Math.PI;
    hood.castShadow = true;

    // Emissive glowing bulb hanging just below the hood
    const bulb = new THREE.Mesh(LAMPPOST_BULB_GEO, lamppostBulbMat);
    bulb.position.set(0.95 * side, 4.28, 0);

    group.add(base, pole, collar, arm, hood, bulb);

    group.rotation.y = 0;

    group.userData.collider = createCircleCollider(0.3);
    group.userData.isLamppost = true;
    // Local X offset of the bulb so the pool light lands on the right side
    group.userData.lampOffsetX = 0.95 * side;

    return group;
}



const FACTORIES = {
    tree:      (spawnX) => createTree(),
    rock:      (spawnX) => createRock(),
    snowman:   (spawnX) => createSnowman(),
    fallenLog: (spawnX) => createFallenLog(),
    stump:     (spawnX) => createStump(),
    fence:     (spawnX) => createFence(),
    litFence:  (spawnX) => createLitFence(),
    lamppost:  (spawnX) => createLamppost(spawnX),
};

function pickObstacle(biome, isNight, spawnX) {
    const weights = isNight ? biome.nightWeights : biome.weights;

    let total = 0;
    for (const k in weights) total += weights[k];
    if (total <= 0) return createTree();

    let r = Math.random() * total;
    for (const k in weights) {
        r -= weights[k];
        if (r <= 0) return FACTORIES[k](spawnX);
    }
    return createTree();
}



export function populateChunk(chunkGroup, chunkLength, chunkWidth, score, isNight, biomeName = BIOME_BASE) {
    const biome = getBiome(biomeName);
    chunkGroup.userData.biome = biomeName;

    const s = score || 0;
    const baseMin = BASE_MIN + Math.floor(s / 400);
    const baseMax = BASE_MAX + Math.floor(s / 300);
    const minCount = Math.min(HARD_MIN, Math.round(baseMin * biome.densityMultiplier));
    const maxCount = Math.min(HARD_MAX * 2, Math.round(baseMax * biome.densityMultiplier));

    const obstacles = [];
    const count = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));
    const halfW = chunkWidth / 2 - EDGE_MARGIN;
    const halfL = chunkLength / 2 - EDGE_MARGIN;
    const minSpacing = biome.minSpacing;

    for (let i = 0; i < count; i++) {
        const lx = (Math.random() * 2 - 1) * halfW;
        const lz = (Math.random() * 2 - 1) * halfL;

        let tooClose = false;
        for (const ob of obstacles) {
            const dx = lx - ob.localX;
            const dz = lz - ob.localZ;
            if (Math.sqrt(dx * dx + dz * dz) < minSpacing) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;

        const mesh = pickObstacle(biome, isNight, lx);
        mesh.position.set(lx, 0, lz);
        chunkGroup.add(mesh);

        obstacles.push({
            mesh,
            localX: lx,
            localZ: lz,
            collider: mesh.userData.collider
        });
    }

    chunkGroup.userData.obstacles = obstacles;

    if (biomeName === BIOME_FOREST) {
        spawnFireflies(chunkGroup, chunkLength, chunkWidth);
    }
}



export function clearChunk(chunkGroup) {
    const obs = chunkGroup.userData.obstacles || [];
    for (const ob of obs) {
        chunkGroup.remove(ob.mesh);
    }
    chunkGroup.userData.obstacles = [];

    const fireflies = chunkGroup.userData.fireflies || [];
    for (const ff of fireflies) {
        chunkGroup.remove(ff);
    }
    chunkGroup.userData.fireflies = [];
    chunkGroup.userData.fireflyLightLocal = null;
}


// Exported so the day/night cycle in scene.js can fade the emissive glow
export { lanternMat, lamppostBulbMat };
