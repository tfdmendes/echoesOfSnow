import * as THREE from 'three';

// Chunk dimensions -- POOL_SIZE * CHUNK_LENGTH must exceed the camera far plane (600).
// 8 * 80 = 640, so we have a small margin.
export const CHUNK_LENGTH = 80;
export const CHUNK_WIDTH  = 32;                 // Width of the playable ridge (the flat top of the inverted U)
export const PLAY_HALF_X  = CHUNK_WIDTH / 2;    // Lateral boundary: skier falls if |x| exceeds this
const POOL_SIZE = 8;


// Slope parameters -- define the steep sides of the inverted U.
// The drop matches the VALLEY_FLOOR_Y constant in scenery.js (-45):
// the outer edge of each slope lands exactly at the valley floor so
// there is no floating gap or visible cliff between slope and floor.
const SLOPE_WIDTH = 40;   // Horizontal run of each side slope
const SLOPE_DROP  = 45;   // Vertical drop at the outer edge -- matches scenery valley floor level

// Flags sit on the ridge edge (x = +/- PLAY_HALF_X) and mark the
// visual boundary. One pair is spawned every FLAG_SPACING units along Z.
// Spacing kept loose so the ridge reads like a real slalom course with
// breathing room between gates, rather than a continuous fence.
const FLAG_SPACING = 20;
const FLAG_POLE_HEIGHT = 2.2;


// PlaneGeometry(width, height, widthSegments, heightSegments)
// Widthsegments raised so the slope edge has enough vertices for a
// slight noise-based variation; heightSegments stays at 8 (enough to
// avoid cracks along long strips of snow).
const CHUNK_GEOMETRY = new THREE.PlaneGeometry(CHUNK_WIDTH, CHUNK_LENGTH, 4, 8);

// Each side slope is a single plane rotated so it lies tilted downward.
// Shared between every chunk to save memory (the transform is on the mesh,
// not on the geometry, so we can reuse the same buffer for both sides).
const SLOPE_GEOMETRY = buildSlopeGeometry();


const snowMaterial = new THREE.MeshPhongMaterial({
    color:     0xdde8f5,
    shininess: 12
});

// Slope material is a duller, rockier snow so the "out of bounds" area
// is visually distinct from the ridge. flatShading is enabled so each
// triangle gets one solid normal -- this is what gives the slopes their
// "static shadow" look without using dynamic shadow mapping (see ICG_05:
// flat vs. Gouraud shading). Per-face lighting from the sun is enough
// to convey the shape and costs nothing on the GPU compared to a shadow map.
const slopeMaterial = new THREE.MeshPhongMaterial({
    color:       0xa8b5c8,
    shininess:   6,
    flatShading: true
});


// ------ Flag geometry ------
// All flag parts are built once and shared across every chunk.
//
// Pole: a tapered cylinder (thinner at the top) so it looks like a real
// slalom gate rather than a uniform stick. 10 radial segments give a
// clean silhouette; the extra cost is negligible.
const FLAG_POLE_GEO = new THREE.CylinderGeometry(0.03, 0.055, FLAG_POLE_HEIGHT, 10); // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)

// Small decorative knob that sits on top of the pole. Standard touch
// on flagpoles (finial) that reads as "this is the tip" from afar.
const FLAG_KNOB_GEO = new THREE.SphereGeometry(0.065, 10, 6); // SphereGeometry(radius, widthSegments, heightSegments)

// Triangular pennant with a subtle wave baked into its vertex positions.
// Built lazily by buildPennantGeometry() below so the wave parameters
// live inside a single self-contained function.
const FLAG_PENNANT_GEO = buildPennantGeometry();


const flagPoleMat  = new THREE.MeshPhongMaterial({ color: 0xf2f2f2, shininess: 40 });
const flagKnobMat  = new THREE.MeshPhongMaterial({ color: 0x1e1e1e, shininess: 60 });
// Cloth is a little shinier than raw paint so the sun picks it up at
// dawn/dusk, but still flat enough to feel like fabric.
const flagRedMat   = new THREE.MeshPhongMaterial({ color: 0xd4262a, side: THREE.DoubleSide, shininess: 8 });
const flagBlueMat  = new THREE.MeshPhongMaterial({ color: 0x2a50c8, side: THREE.DoubleSide, shininess: 8 });


// Build the pennant as a tapered strip of vertices. The strip runs
// along +X from the pole (t=0) to the tip (t=1). At each step:
//
//   * the vertical extent (heightAtT) shrinks linearly to zero at the
//     tip, forming a classic pennant triangle silhouette;
//   * the strip droops slightly under gravity (droop grows with t^2);
//   * a small Z offset baked from sin(x * freq) gives the cloth a
//     static wave, as if frozen mid-flutter.
//
// Geometry is authored with the inner edge at x = 0 so the pennant can
// be glued directly onto the pole axis. The scale.x sign in createFlag()
// mirrors the whole thing for the opposite boundary side.
function buildPennantGeometry() {
    const len     = 0.95;
    const height  = 0.45;
    const segs    = 6;        // horizontal resolution for the wave to read
    const waveAmp = 0.05;     // depth of the static wave
    const waveFreq = 7.0;     // spatial frequency of the wave along the pennant

    const positions = [];
    const indices   = [];

    for (let i = 0; i <= segs; i++) {
        const t          = i / segs;
        const x          = t * len;
        const heightAtT  = height * (1 - t);  // tapers to 0 at the tip
        const droop      = 0.18 * t * t;      // cloth sags toward the free end
        const wave       = waveAmp * Math.sin(x * waveFreq);

        // Two vertices per column: top edge and bottom edge
        positions.push(x, -droop,              wave);  // top edge
        positions.push(x, -droop - heightAtT,  wave);  // bottom edge
    }

    // Build two triangles per quad between adjacent columns.
    for (let i = 0; i < segs; i++) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = (i + 1) * 2;
        const d = (i + 1) * 2 + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}



// Build a vertex-deformed plane that represents ONE side slope.
// The plane starts as a regular PlaneGeometry lying in XY. We displace
// the Z coordinate of the outer vertices so, once the mesh is rotated
// flat (rotation.x = -PI/2), those vertices end up BELOW the ridge --
// producing the steep flank of the inverted U.
//
// Pattern taken from Praticas/Three_js_06/06_04_Ex_Waves.html, where the
// teacher shows that modifying position attributes and calling
// computeVertexNormals() is the canonical way to reshape a mesh.
function buildSlopeGeometry() {
    // Higher widthSegments gives the falling profile enough vertices
    // for the curved drop to render smoothly instead of as a few big
    // triangular facets. heightSegments is bumped for a similar reason
    // along the Z axis so that the per-chunk noise breaks the long
    // strips cleanly.
    const widthSegments  = 14;
    const heightSegments = 12;
    const geo = new THREE.PlaneGeometry(SLOPE_WIDTH, CHUNK_LENGTH, widthSegments, heightSegments); // PlaneGeometry(width, height, widthSegments, heightSegments)

    const pos = geo.attributes.position;

    // Vertex X runs from -SLOPE_WIDTH/2 (inner edge, at the ridge) to
    // +SLOPE_WIDTH/2 (outer edge, meeting the valley floor). We map it
    // to a normalized parameter t in [0,1] and apply a COSINE SMOOTHSTEP:
    //
    //     eased(t) = 0.5 * (1 - cos(pi * t))
    //
    // This is the curve that produces a true "inverted U" shoulder:
    //
    //   * at t = 0 (ridge edge)    -> slope tangent is HORIZONTAL, so
    //     the ridge flat-top rolls smoothly into the flank with no
    //     visible crease;
    //   * at t = 0.5 (middle)      -> slope reaches its MAXIMUM descent;
    //   * at t = 1 (valley floor)  -> slope tangent is HORIZONTAL again,
    //     matching the horizontal valley floor with the same zero crease.
    //
    // Both endpoints are tangent-continuous with their neighbouring
    // surfaces, so the whole ridge-slope-floor chain reads as a single
    // sculpted landform rather than three planes glued together.
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const t = (x + SLOPE_WIDTH / 2) / SLOPE_WIDTH;
        const eased = 0.5 * (1 - Math.cos(Math.PI * t));

        // Noise peaks in the middle of the slope (t=0.5) and falls to
        // zero at both ends. That keeps the matching edges perfectly
        // clean: the slope top joins the ridge at y=0 and the slope
        // bottom joins the valley floor at y=-SLOPE_DROP with no jitter,
        // while the middle still has organic variation.
        const noise = (Math.random() - 0.5) * 0.9 * t * (1 - t);

        pos.setZ(i, -eased * SLOPE_DROP + noise);
    }

    // Normals have to be recomputed after any vertex displacement,
    // otherwise lighting is wrong (normals still point straight up).
    geo.computeVertexNormals();

    return geo;
}



// Build one flag: tapered pole + black knob finial + triangular pennant.
// colorMat picks the side (red on the left boundary, blue on the right
// by convention, matching how gates are coloured in competitive skiing).
// clothDirection is +1 (pennant extends into +X) or -1 (into -X); by
// convention we always point INWARD, toward the play zone.
function createFlag(colorMat, clothDirection) {
    const group = new THREE.Group();

    const pole = new THREE.Mesh(FLAG_POLE_GEO, flagPoleMat);
    pole.position.y = FLAG_POLE_HEIGHT / 2;
    pole.castShadow = true;

    // Finial knob: sphere placed just above the pole tip. Radius of the
    // knob is added to its Y so the bottom of the sphere touches the
    // top of the pole with no overlap or gap.
    const knob = new THREE.Mesh(FLAG_KNOB_GEO, flagKnobMat);
    knob.position.y = FLAG_POLE_HEIGHT + 0.055;
    knob.castShadow = true;

    // Pennant is authored with its top edge at y=0 and its inner edge
    // at x=0 (pole axis). Positioning it at the pole top and scaling x
    // by clothDirection mirrors the whole triangle to the opposite
    // boundary side when needed. DoubleSide on the cloth material makes
    // the mirrored winding render correctly.
    const pennant = new THREE.Mesh(FLAG_PENNANT_GEO, colorMat);
    pennant.position.set(0, FLAG_POLE_HEIGHT - 0.1, 0);
    pennant.scale.x = clothDirection;

    group.add(pole, knob, pennant);
    return group;
}



// Assemble a chunk: playable ridge plane + left slope + right slope + flags.
// The whole chunk is a THREE.Group so recycling moves everything together.
function createChunk() {
    const group = new THREE.Group();

    // --- Playable ridge (flat top of the inverted U) ---
    const plane = new THREE.Mesh(CHUNK_GEOMETRY, snowMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    group.add(plane);

    // --- Left slope ---
    // The slope geometry was built with its INNER edge at x = -SLOPE_WIDTH/2
    // and OUTER edge at +SLOPE_WIDTH/2 (with the drop applied to +X).
    // For the LEFT side we rotate the slope 180 degrees around Y so the
    // outer (dropped) edge faces -X, then shift it so its inner edge aligns
    // with the ridge edge at x = -PLAY_HALF_X.
    const leftSlope = new THREE.Mesh(SLOPE_GEOMETRY, slopeMaterial);
    leftSlope.rotation.x = -Math.PI / 2;
    leftSlope.rotation.z =  Math.PI;                                  // Mirror along X so the drop is on the far side
    leftSlope.position.x = -PLAY_HALF_X - SLOPE_WIDTH / 2;            // Inner edge lands exactly at the ridge boundary
    leftSlope.receiveShadow = true;
    group.add(leftSlope);

    // --- Right slope ---
    // Same geometry, no mirror, placed on the opposite side.
    const rightSlope = new THREE.Mesh(SLOPE_GEOMETRY, slopeMaterial);
    rightSlope.rotation.x = -Math.PI / 2;
    rightSlope.position.x =  PLAY_HALF_X + SLOPE_WIDTH / 2;
    rightSlope.receiveShadow = true;
    group.add(rightSlope);

    // --- Boundary flags ---
    // One pair of flags every FLAG_SPACING units along Z. The first flag
    // is offset by half the spacing so the pattern looks continuous when
    // two neighbouring chunks meet.
    const flagsPerChunk = Math.floor(CHUNK_LENGTH / FLAG_SPACING);
    const startZ = -CHUNK_LENGTH / 2 + FLAG_SPACING / 2;
    for (let i = 0; i < flagsPerChunk; i++) {
        const localZ = startZ + i * FLAG_SPACING;

        // Left boundary -- red flag, cloth pointing inward (+X toward centre)
        const leftFlag = createFlag(flagRedMat, +1);
        leftFlag.position.set(-PLAY_HALF_X, 0, localZ);
        group.add(leftFlag);

        // Right boundary -- blue flag, cloth pointing inward (-X toward centre)
        const rightFlag = createFlag(flagBlueMat, -1);
        rightFlag.position.set(PLAY_HALF_X, 0, localZ);
        group.add(rightFlag);
    }

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
    snowMaterial.map = makeSnowTexture();
    snowMaterial.needsUpdate = true;

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


// Generates a procedural snow texture on a canvas.
function makeSnowTexture() {
    const size   = 512;
    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base colour: dry snow (warm white)
    const base = [252, 254, 255];

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
