import * as THREE from 'three';

// Background scenery: two rings of mountains around the play area.
//
//   1. MAIN RING    -- tall, distant peaks that define the horizon.
//   2. FOOTHILLS    -- smaller mountains sunk well below ridge level,
//                      visible when the skier looks past the slope edges.
//                      They provide the sense of being HIGH up on a ridge,
//                      with terrain falling away into a valley on both sides.
//
// Design principles (both driven by performance):
//   1. Mountains never cast or receive dynamic shadows. They are far
//      enough from the action that a shadow map would waste texels and
//      dominate fill rate. Instead, flatShading + a single directional
//      light produce consistent per-face shading ("static shadows" --
//      ICG_05 Illumination_and_Shading, Gouraud vs flat shading).
//   2. All mountain geometry is merged into one static BufferGeometry.
//      The skyline still has per-mountain random shapes/colours, but the
//      renderer pays one draw call instead of one call per mountain.


// Valley floor level. All mountain bases and the outer edge of each
// terrain slope meet at this Y coordinate, so the whole scenery reads
// as one continuous landscape: ridge -> slope -> valley floor -> peaks.
// The value is kept in sync with SLOPE_DROP in terrain.js.
const VALLEY_FLOOR_Y = -45;


// ----- Main distant ring -----
// Tall, distant peaks that dominate the horizon.
const MAIN_COUNT        = 24;
const MAIN_RING_INNER   = 260;
const MAIN_RING_OUTER   = 380;
const MAIN_MIN_HEIGHT   = 80;    // Taller than before: their bases now sit
const MAIN_MAX_HEIGHT   = 160;   // at the valley floor, so we raise heights
                                 // to keep peaks dominating the skyline.
const MAIN_MIN_RADIUS   = 35;
const MAIN_MAX_RADIUS   = 70;


// ----- Foothills (valley layer) -----
// Mountains placed IN THE VALLEY on either side of the ridge. Always
// lateral (angles near +/- 90 degrees from +Z axis) so their peaks
// never punch up through the ski track.
//
// Three tiers of increasing size, each tier placed in a progressively
// wider and farther band:
//
//   tier 1 (small)   -- close to the slope, tight angular window
//   tier 2 (medium)  -- further out, slightly wider window
//   tier 3 (large)   -- bridging toward the main ring, widest window
//
// The tight-close / wide-far pattern respects the slope footprint
// constraint |x| = r * sin(angle) > 56: closer mountains need a sharper
// perpendicular angle to clear the slope, farther ones can drift more
// toward the forward/backward directions without issue.
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
        angleRange: Math.PI / 4     // +/- 45 deg around +/- X
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
        angleRange: Math.PI / 3.2   // +/- 56 deg
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
        angleRange: Math.PI / 2.8   // +/- 64 deg
    }
];


// ----- Valley floor -----
// A single large horizontal plane at y = VALLEY_FLOOR_Y. Its role is to
// ground the mountain bases and give the player something to see when
// they look past the slope edge -- without it the foothills appear to
// hover over an empty void.
const VALLEY_FLOOR_SIZE = 1800;  // Plane side length: larger than 2x camera far (600) from all directions


// Shared material across all mountain instances. vertexColors reads the
// per-vertex colour attribute written into each geometry; flatShading
// makes each triangle take a single normal, producing the rugged per-face
// light/dark breakup that substitutes for a shadow map.
//
// side: DoubleSide is IMPORTANT here. The vertex perturbation in
// createMountainGeometry() shifts positions by up to ~12% of the cone radius,
// which occasionally flips the winding order of a triangle. With the
// default FrontSide, flipped triangles are back-face-culled and become
// invisible "holes" in the mesh -- the viewer then sees the back side
// of the mountain's far wall through the gap, producing a ghostly
// "transparent" silhouette. Rendering both sides closes those holes
// at a negligible performance cost (few dozen mountain meshes at most).
const mountainMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading:  true,
    side:         THREE.DoubleSide
});

// Material for the valley floor. Colour matches the slope material in
// terrain.js so the surfaces read as one continuous alpine snowfield
// when they meet at y = VALLEY_FLOOR_Y. flatShading gives the floor
// per-face shading from the sun, consistent with the mountains and
// slopes above it.
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



// Build the valley floor -- one large horizontal plane parked at
// VALLEY_FLOOR_Y. The plane only has to be large enough that fog
// swallows its edge before the player ever reaches it.
// receiveShadow is OFF on purpose: the directional shadow camera's
// frustum is tuned for the ridge play area. Sampling shadows on a
// plane this far away gives near-random results and wastes GPU.
function createValleyFloor() {
    // PlaneGeometry(width, height, widthSegments, heightSegments) -- 1 segment
    // is enough, the floor has no vertex deformation.
    const geo = new THREE.PlaneGeometry(VALLEY_FLOOR_SIZE, VALLEY_FLOOR_SIZE, 1, 1);

    const mesh = new THREE.Mesh(geo, valleyFloorMaterial);
    mesh.rotation.x = -Math.PI / 2;   // Lay flat on the XZ plane
    mesh.position.y = VALLEY_FLOOR_Y;
    mesh.receiveShadow = false;
    mesh.castShadow    = false;
    return mesh;
}



// Build a single mountain geometry.
// Base shape is a cone with a few radial and vertical segments. Vertex
// positions are then perturbed (ICG_06, vertex manipulation pattern used
// in Praticas/Three_js_06/06_04_Ex_Waves.html) to remove the uniform cone
// look. Vertex colours are assigned according to the vertical coordinate
// so the tops appear snowy and the bases rocky.
function createMountainGeometry(height, radius) {
    // ConeGeometry(radius, height, radialSegments, heightSegments)
    // radialSegments kept low (7) so silhouettes look rugged; heightSegments
    // moderate so the vertex-colour gradient has enough bands.
    const geo = new THREE.ConeGeometry(radius, height, 7, 5);

    const pos = geo.attributes.position;

    // Perturb every vertex except the apex. The apex is a single shared
    // vertex at y = +height/2; displacing it would tear multiple triangles.
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

    // Normals have to be recomputed after vertex displacement or flat
    // shading picks the wrong face orientations (ICG_06).
    geo.computeVertexNormals();


    // Per-vertex colours: dark rock at the base -> mid grey -> snow at the peak.
    const colorAttribute = new Float32Array(pos.count * 3);
    const rock    = new THREE.Color(0x3a3530);
    const midRock = new THREE.Color(0x6e6864);
    const snow    = new THREE.Color(0xf4f7fa);
    const tmpColor = new THREE.Color();

    // Snow line sits around 65% of the mountain height.
    const snowLine = 0.65;

    for (let i = 0; i < pos.count; i++) {
        const yLocal = pos.getY(i);
        const t = (yLocal + height / 2) / height;          // 0 at base, 1 at apex

        if (t >= snowLine) {
            const k = (t - snowLine) / (1 - snowLine);
            tmpColor.copy(midRock).lerp(snow, k);
        } else {
            const k = t / snowLine;
            tmpColor.copy(rock).lerp(midRock, k);
        }

        colorAttribute[i * 3]     = tmpColor.r;
        colorAttribute[i * 3 + 1] = tmpColor.g;
        colorAttribute[i * 3 + 2] = tmpColor.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colorAttribute, 3));

    return geo.toNonIndexed();
}



function createMountainMesh(geometries) {
    const mesh = new THREE.Mesh(mergeMountainGeometries(geometries), mountainMaterial);

    // Do NOT participate in the shadow pass. Casting shadows from 100-unit
    // cones into an already-stretched directional shadow frustum would
    // destroy shadow map resolution for the gameplay area with no visible
    // benefit (fog covers mountain bases anyway).
    mesh.castShadow    = false;
    mesh.receiveShadow = false;

    return mesh;
}



// Populate a ring of mountains according to the given config.
// angleFn generates the angular coordinate -- used to restrict foothills
// to the lateral quadrants so they do not sit under the ski track.
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

        // Place the mountain so its BASE (bottom tip of the cone) sits at
        // config.baseY. ConeGeometry is centered on its midpoint, so the
        // base lies at (center.y - height/2); placing the center at
        // baseY + height/2 makes the base land exactly at baseY.
        // This is what lets every mountain "stand on" the valley floor.
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



// Full-circle angle distribution with jitter. Used for the main ring --
// distant peaks can surround the player in every direction.
function evenAngle(i, count) {
    return (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
}

// Lateral-only distribution: angles clustered around +/- X axes so
// foothills appear to the SIDES of the track, never directly in front
// or behind. side = -1 (left, -X) or +1 (right, +X) with equal probability.
// The jitter window is supplied per tier so closer tiers stay tightly
// perpendicular to the track (needed to clear the slope footprint) and
// farther tiers can spread toward the forward/backward directions.
function lateralAngleFn(angleRange) {
    return function() {
        const side = Math.random() < 0.5 ? -1 : 1;
        const baseAngle = side * Math.PI / 2;              // +/- 90 deg from +Z axis
        const jitter    = (Math.random() - 0.5) * 2 * angleRange;
        return baseAngle + jitter;
    };
}



// Build the full scenery (main ring + foothills) and attach it to scene.
// Returns the top-level group so the main loop can slide it along Z to
// keep the horizon centred on the skier.
export function createScenery(scene) {
    const ring = new THREE.Group();
    const mountainGeometries = [];

    // Floor first so all mountain meshes render over it in depth order.
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

    // One ring per foothill tier, each with its own size range and
    // angular window (see FOOTHILL_TIERS above).
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



// Move the ring to follow the skier's Z so the horizon never recedes.
// We only slide along Z -- X tracking would feel like the mountains
// chase the player sideways, breaking the "huge distant peak" illusion.
export function updateScenery(ring, skierZ) {
    ring.position.z = skierZ;
}
