import * as THREE from 'three';

let upperBodyGroup;
let leftLegGroup, rightLegGroup;
let leftKneeGroup, rightKneeGroup;
let leftSkiGroup, rightSkiGroup;
let leftArmGroup, rightArmGroup;
let leftForearmGroup, rightForearmGroup;
let leftPoleGroup, rightPoleGroup;

const POLE_LENGTH = 0.75;

function createArm(side, jacketMat, poleMat, gloveMat) {
    const sign = side === 'left' ? -1 : 1;

    const shoulder = new THREE.Group();
    shoulder.position.set(0.22 * sign, 1.12, 0.02);
    shoulder.rotation.z = 0.16 * sign;

    // CylinderGeometry(radiusTop, radiusBottom, height, segments)
    const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.24, 8),
        jacketMat
    );
    upperArm.position.y = -0.12;
    upperArm.castShadow = true;

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.24, 0);

    const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.24, 8),
        jacketMat
    );
    forearm.position.y = -0.12;
    forearm.castShadow = true;

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), gloveMat);
    hand.position.set(0, -0.24, 0.01);
    hand.castShadow = true;

    // pole pivot sits at the hand position so the pole always follows the grip
    const polePivot = new THREE.Group();
    polePivot.position.set(0, -0.24, 0.01);

    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, POLE_LENGTH, 6),
        poleMat
    );
    pole.position.y = -POLE_LENGTH / 2;
    pole.castShadow = true;

    polePivot.add(pole);
    elbow.add(forearm, hand, polePivot);
    shoulder.add(upperArm, elbow);

    return { shoulder, elbow, polePivot };
}

function createLeg(side, pantsMat, bootMat, skiMat) {
    const sign = side === 'left' ? -1 : 1;

    const hip = new THREE.Group();
    hip.position.set(0.11 * sign, 0.78, 0);

    const upperLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.05, 0.28, 8),
        pantsMat
    );
    upperLeg.position.y = -0.14;
    upperLeg.castShadow = true;

    const knee = new THREE.Group();
    knee.position.set(0, -0.28, 0);

    const lowerLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.045, 0.28, 8),
        pantsMat
    );
    lowerLeg.position.y = -0.14;
    lowerLeg.castShadow = true;

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.28, 0.01);

    // BoxGeometry(width, height, depth)
    const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.08, 0.18),
        bootMat
    );
    boot.position.set(0, -0.02, 0.03);
    boot.castShadow = true;

    const skiPivot = new THREE.Group();
    skiPivot.position.set(0, -0.06, 0.03);

    const ski = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.03, 1.25),
        skiMat
    );
    ski.position.set(0, -0.03, 0.10);
    ski.castShadow = true;
    ski.receiveShadow = true;

    skiPivot.add(ski);
    ankle.add(boot, skiPivot);
    knee.add(lowerLeg, ankle);
    hip.add(upperLeg, knee);

    return { hip, knee, skiPivot };
}

function createSkier() {
    const group = new THREE.Group();

    const jacketMat = new THREE.MeshPhongMaterial({ color: 0xdd2222 });
    const pantsMat  = new THREE.MeshPhongMaterial({ color: 0x111a33 });
    const bootMat   = new THREE.MeshPhongMaterial({ color: 0x050505 });
    const skinMat   = new THREE.MeshPhongMaterial({ color: 0xc79a7a });
    const skiMat    = new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 80 });
    const poleMat   = new THREE.MeshPhongMaterial({ color: 0x999999, shininess: 100 });
    const hatMat    = new THREE.MeshPhongMaterial({ color: 0xcc1111 });
    const goggleMat = new THREE.MeshPhongMaterial({ color: 0xb35a00, emissive: 0x331100 });
    const gloveMat  = new THREE.MeshPhongMaterial({ color: 0x202020 });

    upperBodyGroup = new THREE.Group();

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.22), jacketMat);
    torso.position.set(0, 1.00, 0);
    torso.castShadow = true;

    // SphereGeometry(radius, widthSegments, heightSegments)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skinMat);
    head.position.set(0, 1.35, 0);
    head.castShadow = true;

    // partial sphere - covers only the top half
    const hat = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        hatMat
    );
    hat.position.set(0, 1.38, 0);

    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.08), goggleMat);
    goggles.position.set(0, 1.35, 0.11);

    const leftArm = createArm('left', jacketMat, poleMat, gloveMat);
    leftArmGroup     = leftArm.shoulder;
    leftForearmGroup = leftArm.elbow;
    leftPoleGroup    = leftArm.polePivot;

    const rightArm = createArm('right', jacketMat, poleMat, gloveMat);
    rightArmGroup     = rightArm.shoulder;
    rightForearmGroup = rightArm.elbow;
    rightPoleGroup    = rightArm.polePivot;

    const leftLeg = createLeg('left', pantsMat, bootMat, skiMat);
    leftLegGroup  = leftLeg.hip;
    leftKneeGroup = leftLeg.knee;
    leftSkiGroup  = leftLeg.skiPivot;

    const rightLeg = createLeg('right', pantsMat, bootMat, skiMat);
    rightLegGroup  = rightLeg.hip;
    rightKneeGroup = rightLeg.knee;
    rightSkiGroup  = rightLeg.skiPivot;

    upperBodyGroup.add(torso, head, hat, goggles, leftArmGroup, rightArmGroup);
    group.add(upperBodyGroup, leftLegGroup, rightLegGroup);

    // base skiing stance - knees bent, upper body leaning forward
    // Matches the midpoint of animateSkier's lean range so the
    // character doesn't appear to "grow" when the game starts.
    upperBodyGroup.rotation.x = 0.02;

    leftLegGroup.rotation.x  = -0.20;
    rightLegGroup.rotation.x = -0.20;

    leftKneeGroup.rotation.x  = -0.20;
    rightKneeGroup.rotation.x = -0.20;

    leftSkiGroup.rotation.y  =  0.015;
    rightSkiGroup.rotation.y = -0.015;

    leftArmGroup.rotation.x  = -0.45;
    rightArmGroup.rotation.x = -0.45;

    leftArmGroup.rotation.z  = -0.12;
    rightArmGroup.rotation.z =  0.12;

    leftForearmGroup.rotation.x  = -0.35;
    rightForearmGroup.rotation.x = -0.35;

    leftPoleGroup.rotation.x  = 0.05;
    rightPoleGroup.rotation.x = 0.05;

    return group;
}

export const skier = createSkier();

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// [poles forward, poles swept back]
const ARM_X     = [-0.45, 0.35];
const ARM_Z     = [0.12,  0.20];
const FOREARM_X = [-0.35, -0.10];
const POLE_X    = [0.05,  0.80];
const BODY_LEAN = [-0.15,  -0.02];

export function animateSkier(time) {
    const speed = 1.8;

    // sin mapped to 0-1 to drive the push cycle
    const raw = Math.sin(time * speed);
    const t   = (raw + 1.0) * 0.5;

    skier.position.y       = Math.abs(raw) * 0.02;
    upperBodyGroup.rotation.z = raw * 0.02;
    upperBodyGroup.rotation.x = 0.10 + lerp(BODY_LEAN[0], BODY_LEAN[1], t);

    // legs compress slightly in sync with the pole push
    leftLegGroup.rotation.x   = -0.20 + raw * 0.05;
    rightLegGroup.rotation.x  = -0.20 - raw * 0.05;
    leftKneeGroup.rotation.x  =  0.40 + raw * 0.05;
    rightKneeGroup.rotation.x =  0.40 - raw * 0.05;

    // ski compensates hip rotation to stay flat on the snow
    leftSkiGroup.rotation.x   = -0.20 - raw * 0.05;
    rightSkiGroup.rotation.x  = -0.20 + raw * 0.05;

    const armX     = lerp(ARM_X[0],     ARM_X[1],     t);
    const armZ     = lerp(ARM_Z[0],     ARM_Z[1],     t);
    const forearmX = lerp(FOREARM_X[0], FOREARM_X[1], t);
    const poleX    = lerp(POLE_X[0],    POLE_X[1],    t);

    leftArmGroup.rotation.x  = armX;
    rightArmGroup.rotation.x = armX;
    leftArmGroup.rotation.z  = -armZ;
    rightArmGroup.rotation.z =  armZ;

    leftForearmGroup.rotation.x  = forearmX;
    rightForearmGroup.rotation.x = forearmX;

    leftPoleGroup.rotation.x  = poleX;
    rightPoleGroup.rotation.x = poleX;
}