/*
Author: Tiago Mendes 119378

Background scenery: the valley floor, a main ring of distant peaks, and three
tiers of foothills on the sides of the ridge. Mountains are procedural cones
with randomized vertices, colored by height (rock to snow) and merged into a
single mesh for performance. The ring follows the skier to keep the horizon filled

None of this code was done with AI
*/

import * as THREE from 'three';



// Valley floor Y, kept in sync with SLOPE_DROP in terrain.js
const VALLEY_FLOOR_Y = -45;


// ----- Main distant ring -----
const MAIN_COUNT        = 24;
const MAIN_RING_INNER   = 260;
const MAIN_RING_OUTER   = 380;
const MAIN_MIN_HEIGHT   = 80;
const MAIN_MAX_HEIGHT   = 160;
const MAIN_MIN_RADIUS   = 35;
const MAIN_MAX_RADIUS   = 70;


// ----- Foothills (valley layer) -----
// Lateral angles (~ +/- 90 deg from +Z) so peaks never punch through the track
const FOOTHILL_TIERS = [
    {
        label:      'small',
        count:      28,
        innerR:     85,
        outerR:     140,
        minH:       10,
        maxH:       24,
        minR:       10,
        maxR:       22,
        angleRange: Math.PI / 4
    },
    {
        label:      'medium',
        count:      22,
        innerR:     125,
        outerR:     200,
        minH:       24,
        maxH:       50,
        minR:       18,
        maxR:       32,
        angleRange: Math.PI / 3.2
    },
    {
        label:      'large',
        count:      14,
        innerR:     180,
        outerR:     255,
        minH:       46,
        maxH:       80,
        minR:       26,
        maxR:       42,
        angleRange: Math.PI / 2.8
    }
];


// ----- Valley floor -----
const VALLEY_FLOOR_SIZE = 1800;


// DoubleSide closes the holes left by vertex perturbation flipping triangle
// winding orders in createMountainGeometry()
const mountainMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading:  true,
    side:         THREE.DoubleSide
});

const valleyFloorMaterial = new THREE.MeshPhongMaterial({
    color:       0xa8b5c8,
    shininess:   4,
    flatShading: true
});


function mergeMountainGeometries(geometries) {
    let vertexCount = 0;

    for (const geo of geometries) {
        vertexCount += geo.attributes.position.count;
    }

    const positions = new Float32Array(vertexCount * 3);
    const normals   = new Float32Array(vertexCount * 3);
    const colors    = new Float32Array(vertexCount * 3);

    let offset = 0;
    for (const geo of geometries) {
        const positionAttr = geo.attributes.position;
        const normalAttr   = geo.attributes.normal;
        const colorAttr    = geo.attributes.color;

        positions.set(positionAttr.array, offset * 3);
        normals.set(normalAttr.array, offset * 3);
        colors.set(colorAttr.array, offset * 3);
        offset += positionAttr.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
    merged.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    merged.computeBoundingBox();
    merged.computeBoundingSphere();

    return merged;
}



// Large horizontal plane at VALLEY_FLOOR_Y so foothill bases do not float
function createValleyFloor() {
    const geo = new THREE.PlaneGeometry(VALLEY_FLOOR_SIZE, VALLEY_FLOOR_SIZE, 1, 1);

    const mesh = new THREE.Mesh(geo, valleyFloorMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = VALLEY_FLOOR_Y;
    mesh.receiveShadow = false;
    mesh.castShadow    = false;
    return mesh;
}



// Cone with perturbed vertices and per-vertex colour gradient (rock to snow)
function createMountainGeometry(height, radius) {
    const geo = new THREE.ConeGeometry(radius, height, 7, 5);

    const pos = geo.attributes.position;

    // Skip the apex: it is a single shared vertex and displacing it tears triangles
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);

        const isApex = Math.abs(y - height / 2) < 0.001;
        if (isApex) continue;

        const strength = radius * 0.12;
        pos.setX(i, x + (Math.random() - 0.5) * strength);
        pos.setZ(i, z + (Math.random() - 0.5) * strength);
        pos.setY(i, y + (Math.random() - 0.5) * strength * 0.4);
    }

    geo.computeVertexNormals();


    const colorAttribute = new Float32Array(pos.count * 3);
    const rock    = new THREE.Color(0x3a3530);          // dark rock (base)
    const midRock = new THREE.Color(0x6e6864);          
    const snow    = new THREE.Color(0xf4f7fa);          // white snow (top)
    const tmpColor = new THREE.Color();

    const snowLine = 0.65;

    for (let i = 0; i < pos.count; i++) {
        const yLocal = pos.getY(i);
        const t = (yLocal + height / 2) / height;          // height normalized 0 at base, 1 at apex

        if (t >= snowLine) {
            const k = (t - snowLine) / (1 - snowLine);
            tmpColor.copy(midRock).lerp(snow, k);       // above the line: rock -> snow
        } else {
            const k = t / snowLine;
            tmpColor.copy(rock).lerp(midRock, k);       // below the line: dark rock -> lighter rock
        }

        colorAttribute[i * 3]     = tmpColor.r;
        colorAttribute[i * 3 + 1] = tmpColor.g;
        colorAttribute[i * 3 + 2] = tmpColor.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colorAttribute, 3));    // Attach colors to the mesh

    return geo.toNonIndexed();
}



function createMountainMesh(geometries) {
    const mesh = new THREE.Mesh(mergeMountainGeometries(geometries), mountainMaterial);

    // Skip the shadow pass: distant cones would just eat shadow map resolution
    mesh.castShadow    = false;
    mesh.receiveShadow = false;

    return mesh;
}



// angleFn picks the angular coordinate so foothills can be restricted to
// the lateral quadrants and not sit under the ski track
function populateRing(geometries, config, angleFn) {
    for (let i = 0; i < config.count; i++) {
        const angle = angleFn(i, config.count);

        const ringRadius = config.innerRadius
            + Math.random() * (config.outerRadius - config.innerRadius);
        const height = config.minHeight
            + Math.random() * (config.maxHeight - config.minHeight);
        const radius = config.minRadius
            + Math.random() * (config.maxRadius - config.minRadius);

        const mountain = createMountainGeometry(height, radius);

        // ConeGeometry is centered on its midpoint, so shift up by height/2
        // to plant the base exactly on baseY
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3(
            Math.sin(angle) * ringRadius,
            config.baseY + height / 2,
            Math.cos(angle) * ringRadius
        );
        const rotation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, Math.random() * Math.PI * 2, 0)
        );
        matrix.compose(position, rotation, new THREE.Vector3(1, 1, 1));
        mountain.applyMatrix4(matrix);

        geometries.push(mountain);
    }
}



// Full-circle angle distribution with jitter, used for the main ring
function evenAngle(i, count) {
    return (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
}

// Angles clustered around +/- X so foothills sit on the sides of the track
function lateralAngleFn(angleRange) {
    return function() {
        const side = Math.random() < 0.5 ? -1 : 1;
        const baseAngle = side * Math.PI / 2;
        const jitter    = (Math.random() - 0.5) * 2 * angleRange;
        return baseAngle + jitter;
    };
}



export function createScenery(scene) {
    const ring = new THREE.Group();
    const mountainGeometries = [];

    // Floor first so mountain meshes render on top of it
    ring.add(createValleyFloor());

    populateRing(mountainGeometries, {
        count:        MAIN_COUNT,
        innerRadius:  MAIN_RING_INNER,
        outerRadius:  MAIN_RING_OUTER,
        minHeight:    MAIN_MIN_HEIGHT,
        maxHeight:    MAIN_MAX_HEIGHT,
        minRadius:    MAIN_MIN_RADIUS,
        maxRadius:    MAIN_MAX_RADIUS,
        baseY:        VALLEY_FLOOR_Y,
    }, evenAngle);

    // One ring per foothill tier
    for (const tier of FOOTHILL_TIERS) {
        populateRing(mountainGeometries, {
            count:       tier.count,
            innerRadius: tier.innerR,
            outerRadius: tier.outerR,
            minHeight:   tier.minH,
            maxHeight:   tier.maxH,
            minRadius:   tier.minR,
            maxRadius:   tier.maxR,
            baseY:       VALLEY_FLOOR_Y,
        }, lateralAngleFn(tier.angleRange));
    }

    ring.add(createMountainMesh(mountainGeometries));

    scene.add(ring);
    return ring;
}



// Slide the ring along Z so the horizon never recedes
export function updateScenery(ring, skierZ) {
    ring.position.z = skierZ;
}
