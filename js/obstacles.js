import * as THREE from 'three';

const MIN_SPACING   = 3.5;
const EDGE_MARGIN   = 2.0;
const SKIER_RADIUS = 0.45;


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



export function populateChunk(chunkGroup, chunkLength, chunkWidth) {
    const obstacles = [];
    const count = 3 + Math.floor(Math.random() * 5);
    const halfW = chunkWidth  / 2 - EDGE_MARGIN;
    const halfL = chunkLength / 2 - EDGE_MARGIN;

    for (let i = 0; i < count; i++) {
        const lx = (Math.random() * 2 - 1) * halfW;
        const lz = (Math.random() * 2 - 1) * halfL;

        // Enforce minimum spacing
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

        // 60% trees, 40% rocks
        const mesh = Math.random() < 0.6 ? createTree() : createRock();
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