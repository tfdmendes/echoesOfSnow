import * as THREE from 'three';

let upperBodyGroup, headGroup;
let leftLegGroup, rightLegGroup;
let leftKneeGroup, rightKneeGroup;
let leftAnkleGroup, rightAnkleGroup;
let leftSkiGroup, rightSkiGroup;
let leftArmGroup, rightArmGroup;
let leftForearmGroup, rightForearmGroup;
let leftPoleGroup, rightPoleGroup;
let leftSkiMesh, rightSkiMesh;
let leftPoleMesh, rightPoleMesh;

const POLE_LENGTH = 0.75;
const EQUIPMENT_GRAVITY = 16;
const EQUIPMENT_GROUND_Y = 0.035;
const EQUIPMENT_BOUNCE = 0.28;
const EQUIPMENT_DRAG = 3.8;

const WAIST_Y = 0.86;
const HIP_Y = 0.78;
const HIP_SPACING = 0.12;
const SHOULDER_Y = 0.37;

let poseTime = 0;
const equipmentParts = [];

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value) {
    const t = clamp01(value);
    return 1 - Math.pow(1 - t, 3);
}

function mark(mesh, castShadow = false, receiveShadow = false) {
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
}

function applyBasePose() {
    upperBodyGroup.position.set(0, WAIST_Y, 0);
    upperBodyGroup.rotation.set(0.18, 0, 0);
    headGroup.rotation.set(-0.10, 0, 0);

    leftLegGroup.position.set(-HIP_SPACING, HIP_Y, 0);
    rightLegGroup.position.set(HIP_SPACING, HIP_Y, 0);
    leftLegGroup.rotation.set(-0.30, 0, 0);
    rightLegGroup.rotation.set(-0.30, 0, 0);

    leftKneeGroup.rotation.set(0.58, 0, 0);
    rightKneeGroup.rotation.set(0.58, 0, 0);
    leftAnkleGroup.rotation.set(-0.12, 0, 0);
    rightAnkleGroup.rotation.set(-0.12, 0, 0);

    leftSkiGroup.position.set(0, -0.06, 0.035);
    rightSkiGroup.position.set(0, -0.06, 0.035);
    leftSkiGroup.rotation.set(-0.16, 0.015, 0);
    rightSkiGroup.rotation.set(-0.16, -0.015, 0);

    leftArmGroup.rotation.set(-0.36, 0, -0.18);
    rightArmGroup.rotation.set(-0.36, 0, 0.18);
    leftForearmGroup.rotation.set(-0.48, 0, 0);
    rightForearmGroup.rotation.set(-0.48, 0, 0);
    leftPoleGroup.rotation.set(0.42, 0, -0.18);
    rightPoleGroup.rotation.set(0.42, 0, 0.18);
}

function createArm(side, jacketMat, poleMat, gloveMat) {
    const sign = side === 'left' ? -1 : 1;

    const shoulder = new THREE.Group();
    shoulder.position.set(0.24 * sign, SHOULDER_Y, 0.02);

    const upperArm = mark(new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.038, 0.26, 8),
        jacketMat
    ));
    upperArm.position.y = -0.13;

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.26, 0);

    const forearm = mark(new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.03, 0.25, 8),
        jacketMat
    ));
    forearm.position.y = -0.125;

    const hand = mark(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), gloveMat));
    hand.position.set(0, -0.25, 0.015);

    const polePivot = new THREE.Group();
    polePivot.position.set(0, -0.25, 0.015);

    const pole = mark(new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, POLE_LENGTH, 6),
        poleMat
    ));
    pole.name = `${side}-pole`;
    pole.position.y = -POLE_LENGTH / 2;

    const basket = mark(new THREE.Mesh(
        new THREE.TorusGeometry(0.035, 0.004, 6, 12),
        poleMat
    ));
    basket.name = `${side}-pole-basket`;
    basket.position.y = -POLE_LENGTH / 2 + 0.035;
    basket.rotation.x = Math.PI / 2;

    const spike = mark(new THREE.Mesh(
        new THREE.ConeGeometry(0.012, 0.045, 6),
        poleMat
    ));
    spike.name = `${side}-pole-spike`;
    spike.position.y = -POLE_LENGTH / 2 - 0.02;
    spike.rotation.z = Math.PI;

    pole.add(basket, spike);
    polePivot.add(pole);
    elbow.add(forearm, hand, polePivot);
    shoulder.add(upperArm, elbow);

    return { shoulder, elbow, polePivot, pole };
}

function createLeg(side, pantsMat, bootMat, skiMat, skiAccentMat) {
    const sign = side === 'left' ? -1 : 1;

    const hip = new THREE.Group();
    hip.position.set(HIP_SPACING * sign, HIP_Y, 0);

    const upperLeg = mark(new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.048, 0.30, 8),
        pantsMat
    ));
    upperLeg.position.y = -0.15;

    const knee = new THREE.Group();
    knee.position.set(0, -0.30, 0);

    const lowerLeg = mark(new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.042, 0.30, 8),
        pantsMat
    ));
    lowerLeg.position.y = -0.15;

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.30, 0.015);

    const boot = mark(new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.08, 0.22),
        bootMat
    ));
    boot.position.set(0, -0.025, 0.045);

    const skiPivot = new THREE.Group();
    skiPivot.position.set(0, -0.06, 0.035);

    const ski = mark(new THREE.Mesh(
        new THREE.BoxGeometry(0.105, 0.026, 1.18),
        skiMat
    ), true, true);
    ski.name = `${side}-ski`;
    ski.position.set(0, -0.03, 0.07);

    const frontTip = mark(new THREE.Mesh(
        new THREE.BoxGeometry(0.105, 0.022, 0.23),
        skiMat
    ), true, true);
    frontTip.name = `${side}-ski-front-tip`;
    frontTip.position.set(0, 0.022, 0.68);
    frontTip.rotation.x = -0.52;

    const tail = mark(new THREE.Mesh(
        new THREE.BoxGeometry(0.105, 0.020, 0.11),
        skiMat
    ), true, true);
    tail.name = `${side}-ski-tail`;
    tail.position.set(0, 0.005, -0.64);
    tail.rotation.x = 0.14;

    const stripe = mark(new THREE.Mesh(
        new THREE.BoxGeometry(0.032, 0.006, 0.86),
        skiAccentMat
    ));
    stripe.name = `${side}-ski-center-stripe`;
    stripe.position.set(0, 0.017, 0.02);

    const binding = mark(new THREE.Mesh(
        new THREE.BoxGeometry(0.086, 0.022, 0.18),
        bootMat
    ));
    binding.name = `${side}-ski-binding`;
    binding.position.set(0, 0.021, 0.035);

    ski.add(frontTip, tail, stripe, binding);

    skiPivot.add(ski);
    ankle.add(boot, skiPivot);
    knee.add(lowerLeg, ankle);
    hip.add(upperLeg, knee);

    return { hip, knee, ankle, skiPivot, ski };
}

function registerEquipment(mesh, homeParent, side, kind) {
    equipmentParts.push({
        mesh,
        homeParent,
        side,
        kind,
        homePosition: mesh.position.clone(),
        homeQuaternion: mesh.quaternion.clone(),
        homeScale: mesh.scale.clone(),
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(),
        released: false
    });
}

function createSkier() {
    const group = new THREE.Group();

    const jacketMat = new THREE.MeshPhongMaterial({ color: 0xdd2222 });
    const pantsMat  = new THREE.MeshPhongMaterial({ color: 0x111a33 });
    const bootMat   = new THREE.MeshPhongMaterial({ color: 0x050505 });
    const skinMat   = new THREE.MeshPhongMaterial({ color: 0xc79a7a });
    const skiMat    = new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 80 });
    const skiAccentMat = new THREE.MeshPhongMaterial({ color: 0xeef6ff, shininess: 60 });
    const poleMat   = new THREE.MeshPhongMaterial({ color: 0x999999, shininess: 100 });
    const hatMat    = new THREE.MeshPhongMaterial({ color: 0xcc1111 });
    const goggleMat = new THREE.MeshPhongMaterial({ color: 0xb35a00, emissive: 0x331100 });
    const gloveMat  = new THREE.MeshPhongMaterial({ color: 0x202020 });

    upperBodyGroup = new THREE.Group();
    headGroup = new THREE.Group();

    const torso = mark(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.22), jacketMat), true);
    torso.position.set(0, 0.19, 0);

    const hips = mark(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.20), pantsMat));
    hips.position.set(0, -0.04, 0);

    const head = mark(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), skinMat), true);

    const hat = mark(new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        hatMat
    ));
    hat.position.set(0, 0.03, 0);

    const goggles = mark(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.08), goggleMat));
    goggles.position.set(0, 0, 0.11);

    headGroup.position.set(0, 0.52, 0.02);
    headGroup.add(head, hat, goggles);

    const leftArm = createArm('left', jacketMat, poleMat, gloveMat);
    leftArmGroup     = leftArm.shoulder;
    leftForearmGroup = leftArm.elbow;
    leftPoleGroup    = leftArm.polePivot;
    leftPoleMesh     = leftArm.pole;

    const rightArm = createArm('right', jacketMat, poleMat, gloveMat);
    rightArmGroup     = rightArm.shoulder;
    rightForearmGroup = rightArm.elbow;
    rightPoleGroup    = rightArm.polePivot;
    rightPoleMesh     = rightArm.pole;

    upperBodyGroup.add(torso, hips, headGroup, leftArmGroup, rightArmGroup);

    const leftLeg = createLeg('left', pantsMat, bootMat, skiMat, skiAccentMat);
    leftLegGroup   = leftLeg.hip;
    leftKneeGroup  = leftLeg.knee;
    leftAnkleGroup = leftLeg.ankle;
    leftSkiGroup   = leftLeg.skiPivot;
    leftSkiMesh    = leftLeg.ski;

    const rightLeg = createLeg('right', pantsMat, bootMat, skiMat, skiAccentMat);
    rightLegGroup   = rightLeg.hip;
    rightKneeGroup  = rightLeg.knee;
    rightAnkleGroup = rightLeg.ankle;
    rightSkiGroup   = rightLeg.skiPivot;
    rightSkiMesh    = rightLeg.ski;

    group.add(upperBodyGroup, leftLegGroup, rightLegGroup);

    applyBasePose();

    registerEquipment(leftSkiMesh,  leftSkiGroup,  -1, 'ski');
    registerEquipment(rightSkiMesh, rightSkiGroup,  1, 'ski');
    registerEquipment(leftPoleMesh, leftPoleGroup, -1, 'pole');
    registerEquipment(rightPoleMesh, rightPoleGroup, 1, 'pole');

    return group;
}

export const skier = createSkier();

const BASE_BODY_LEAN = 0.20;
const BASE_HIP_FLEX = -0.30;
const BASE_KNEE_FLEX = 0.58;
const BASE_ANKLE_FLEX = -0.12;
const BASE_ARM_X = -0.36;
const BASE_ARM_Z = 0.18;

const STICK_SWEEP_SPEED = 1.8;
const STICK_ARM_X = [-0.45, 0.35];
const STICK_ARM_Z = [0.12, 0.20];
const STICK_FOREARM_X = [-0.35, -0.10];
const STICK_POLE_X = [0.05, 0.80];

export function animateSkier(time, controls = {}) {
    poseTime = time;

    const boost = clamp01(controls.boost ?? 0);
    const brake = clamp01(controls.brake ?? 0);
    const inputTempo = 1 - brake * 0.12;
    const cycle = time * 2.2 * inputTempo;
    const absorb = Math.sin(cycle * 1.5 + 0.6);
    const glide = Math.sin(cycle);
    const poleFloat = Math.sin(cycle + 1.2);
    const turnLean = skier.rotation.z;
    const turnAmount = clamp01(Math.abs(turnLean) / 0.45);
    const turnSide = Math.sign(turnLean) || 0;
    const leftInside = turnSide > 0 ? turnAmount : 0;
    const rightInside = turnSide < 0 ? turnAmount : 0;
    const leftOutside = turnSide < 0 ? turnAmount : 0;
    const rightOutside = turnSide > 0 ? turnAmount : 0;

    const footMotion = 1 - boost * 0.72 - brake * 0.22;
    const compression = 0.035 * absorb * footMotion;
    const legCounter = 0.018 * glide * footMotion;
    const turnCompression = 0.035 * turnAmount;

    const leftHipX = BASE_HIP_FLEX - compression + legCounter;
    const rightHipX = BASE_HIP_FLEX - compression - legCounter;
    const leftKneeX = BASE_KNEE_FLEX + compression * 1.4 - legCounter * 0.5;
    const rightKneeX = BASE_KNEE_FLEX + compression * 1.4 + legCounter * 0.5;
    const leftAnkleX = BASE_ANKLE_FLEX - compression * 0.25 - legCounter * 0.2;
    const rightAnkleX = BASE_ANKLE_FLEX - compression * 0.25 + legCounter * 0.2;

    skier.position.y = 0.012 + Math.max(0, absorb) * 0.012 * footMotion;

    upperBodyGroup.position.set(0, WAIST_Y - 0.01 + compression * 0.25 - turnCompression, 0.012);
    upperBodyGroup.rotation.x = BASE_BODY_LEAN + 0.02 * poleFloat + boost * 0.03 - brake * 0.04;
    upperBodyGroup.rotation.y = -turnSide * 0.16 * turnAmount;
    upperBodyGroup.rotation.z = turnLean * 0.22 + 0.006 * glide;
    headGroup.rotation.x = -0.10 - 0.02 * poleFloat;
    headGroup.rotation.y = turnSide * 0.10 * turnAmount;

    leftLegGroup.position.set(-HIP_SPACING - 0.020 * leftInside, HIP_Y - 0.020 * leftOutside, 0);
    rightLegGroup.position.set(HIP_SPACING + 0.020 * rightInside, HIP_Y - 0.020 * rightOutside, 0);
    leftLegGroup.rotation.set(leftHipX - 0.055 * leftInside + 0.035 * leftOutside, 0, turnSide * 0.090 * turnAmount);
    rightLegGroup.rotation.set(rightHipX - 0.055 * rightInside + 0.035 * rightOutside, 0, turnSide * 0.090 * turnAmount);
    leftKneeGroup.rotation.set(leftKneeX + 0.150 * leftInside - 0.055 * leftOutside, 0, -turnSide * 0.115 * turnAmount);
    rightKneeGroup.rotation.set(rightKneeX + 0.150 * rightInside - 0.055 * rightOutside, 0, -turnSide * 0.115 * turnAmount);
    leftAnkleGroup.rotation.set(leftAnkleX, 0, turnSide * (0.120 * turnAmount - 0.045 * leftInside));
    rightAnkleGroup.rotation.set(rightAnkleX, 0, turnSide * (0.120 * turnAmount - 0.045 * rightInside));

    leftSkiGroup.position.set(0, -0.06, 0.035);
    rightSkiGroup.position.set(0, -0.06, 0.035);
    leftSkiGroup.rotation.x = -0.20 - glide * 0.05 * footMotion;
    rightSkiGroup.rotation.x = -0.20 + glide * 0.05 * footMotion;
    leftSkiGroup.rotation.y = 0.015 + turnSide * 0.050 * turnAmount;
    rightSkiGroup.rotation.y = -0.015 + turnSide * 0.050 * turnAmount;
    leftSkiGroup.rotation.z = turnSide * 0.220 * turnAmount;
    rightSkiGroup.rotation.z = turnSide * 0.220 * turnAmount;

    const stickRaw = Math.sin(time * STICK_SWEEP_SPEED * (1 - brake * 0.12));
    const stickAmplitude = 0.5 * (1 - boost * 0.72 - brake * 0.22);
    const stickT = 0.5 + stickRaw * stickAmplitude;
    const armX = lerp(STICK_ARM_X[0], STICK_ARM_X[1], stickT);
    const armZ = lerp(STICK_ARM_Z[0], STICK_ARM_Z[1], stickT) + brake * 0.035;
    const forearmX = lerp(STICK_FOREARM_X[0], STICK_FOREARM_X[1], stickT);
    const poleX = lerp(STICK_POLE_X[0], STICK_POLE_X[1], stickT);

    leftArmGroup.rotation.set(armX - 0.130 * leftInside + 0.060 * leftOutside, 0, -armZ - 0.115 * leftInside);
    rightArmGroup.rotation.set(armX - 0.130 * rightInside + 0.060 * rightOutside, 0, armZ + 0.115 * rightInside);
    leftForearmGroup.rotation.set(forearmX - 0.065 * leftInside, 0, 0);
    rightForearmGroup.rotation.set(forearmX - 0.065 * rightInside, 0, 0);
    leftPoleGroup.rotation.set(poleX - 0.120 * leftInside, 0, -0.125 * leftInside);
    rightPoleGroup.rotation.set(poleX - 0.120 * rightInside, 0, 0.125 * rightInside);
}

export function resetSkierPose() {
    applyBasePose();
}

export function resetSkierEquipment() {
    for (const part of equipmentParts) {
        part.homeParent.add(part.mesh);
        part.mesh.position.copy(part.homePosition);
        part.mesh.quaternion.copy(part.homeQuaternion);
        part.mesh.scale.copy(part.homeScale);
        part.velocity.set(0, 0, 0);
        part.angularVelocity.set(0, 0, 0);
        part.released = false;
    }
}

export function releaseSkierEquipment(sceneRoot, impact = {}) {
    let normalX = impact.normalX ?? 0;
    let normalZ = impact.normalZ ?? -1;
    const normalLen = Math.hypot(normalX, normalZ);
    if (normalLen > 0.0001) {
        normalX /= normalLen;
        normalZ /= normalLen;
    } else {
        normalX = 0;
        normalZ = -1;
    }

    const speed = impact.speed ?? 12;

    sceneRoot.updateMatrixWorld(true);
    for (const part of equipmentParts) {
        if (part.released) continue;

        sceneRoot.attach(part.mesh);
        part.released = true;

        const isSki = part.kind === 'ski';
        const sideKick = part.side * (isSki ? 1.8 : 2.8);
        const forwardKick = isSki ? 5.5 : 2.6;
        const lift = isSki ? 2.6 : 3.6;

        part.velocity.set(
            normalX * 3.0 + sideKick + (Math.random() - 0.5) * 0.8,
            lift + Math.random() * 1.2,
            forwardKick + normalZ * 1.2 + speed * 0.18
        );

        part.angularVelocity.set(
            (2.5 + Math.random() * 3.5) * (isSki ? 1.0 : 1.4),
            part.side * (4.0 + Math.random() * 4.0),
            (Math.random() - 0.5) * 7.0
        );
    }
}

export function updateReleasedEquipment(delta) {
    for (const part of equipmentParts) {
        if (!part.released) continue;

        part.velocity.y -= EQUIPMENT_GRAVITY * delta;
        part.mesh.position.addScaledVector(part.velocity, delta);

        part.mesh.rotation.x += part.angularVelocity.x * delta;
        part.mesh.rotation.y += part.angularVelocity.y * delta;
        part.mesh.rotation.z += part.angularVelocity.z * delta;

        if (part.mesh.position.y < EQUIPMENT_GROUND_Y) {
            part.mesh.position.y = EQUIPMENT_GROUND_Y;

            if (part.velocity.y < 0) {
                part.velocity.y = -part.velocity.y * EQUIPMENT_BOUNCE;
                if (Math.abs(part.velocity.y) < 0.25) part.velocity.y = 0;
            }

            const drag = Math.exp(-EQUIPMENT_DRAG * delta);
            part.velocity.x *= drag;
            part.velocity.z *= drag;
            part.angularVelocity.multiplyScalar(drag);
        }
    }
}

const TUCK_BODY_DROP = 0.10;
const TUCK_BODY_FORWARD = 0.06;
const TUCK_BODY_PITCH = 0.42;
const TUCK_STANCE_NARROW = 0.045;
const TUCK_HIP_FOLD = -0.12;
const TUCK_KNEE_BEND = 0.26;
const TUCK_ANKLE_FLEX = -0.05;
const TUCK_ARM_BACK = 0.55;
const TUCK_FOREARM_PULL = -0.45;
const TUCK_POLE_LIFT = -0.55;

const PLOW_BODY_RISE = 0.04;
const PLOW_BODY_UPRIGHT = -0.16;
const PLOW_STANCE_WIDEN = 0.12;
const PLOW_HIP_RELAX = 0.08;
const PLOW_KNEE_RELAX = -0.08;
const PLOW_KNEE_IN = 0.08;
const PLOW_SKI_WEDGE = 0.42;
const PLOW_SKI_EDGE = 0.10;
const PLOW_ARM_OUT = 0.28;
const PLOW_POLE_DROP = 0.35;

export function applySkierTuckPose(amount) {
    const t = easeOutCubic(amount);
    if (t <= 0) return;

    upperBodyGroup.position.y -= TUCK_BODY_DROP * t;
    upperBodyGroup.position.z += TUCK_BODY_FORWARD * t;
    upperBodyGroup.rotation.x += TUCK_BODY_PITCH * t;
    upperBodyGroup.rotation.z *= 1 - 0.35 * t;
    headGroup.rotation.x -= 0.10 * t;

    leftLegGroup.position.x += TUCK_STANCE_NARROW * t;
    rightLegGroup.position.x -= TUCK_STANCE_NARROW * t;
    leftLegGroup.rotation.x += TUCK_HIP_FOLD * t;
    rightLegGroup.rotation.x += TUCK_HIP_FOLD * t;
    leftKneeGroup.rotation.x += TUCK_KNEE_BEND * t;
    rightKneeGroup.rotation.x += TUCK_KNEE_BEND * t;
    leftAnkleGroup.rotation.x += TUCK_ANKLE_FLEX * t;
    rightAnkleGroup.rotation.x += TUCK_ANKLE_FLEX * t;

    leftSkiGroup.rotation.x += 0.09 * t;
    rightSkiGroup.rotation.x += 0.09 * t;
    const tuckFlatten = 0.55 * t;
    leftSkiGroup.rotation.y = lerp(leftSkiGroup.rotation.y, 0.015, tuckFlatten);
    rightSkiGroup.rotation.y = lerp(rightSkiGroup.rotation.y, -0.015, tuckFlatten);
    leftSkiGroup.rotation.z *= 1 - 0.45 * t;
    rightSkiGroup.rotation.z *= 1 - 0.45 * t;

    leftArmGroup.rotation.x += TUCK_ARM_BACK * t;
    rightArmGroup.rotation.x += TUCK_ARM_BACK * t;
    leftForearmGroup.rotation.x += TUCK_FOREARM_PULL * t;
    rightForearmGroup.rotation.x += TUCK_FOREARM_PULL * t;
    leftPoleGroup.rotation.x += TUCK_POLE_LIFT * t;
    rightPoleGroup.rotation.x += TUCK_POLE_LIFT * t;
}

export function applySkierSnowplowPose(amount) {
    const t = easeOutCubic(amount);
    if (t <= 0) return;

    const scrape = Math.sin(poseTime * 12) * 0.01 * t;

    upperBodyGroup.position.y += PLOW_BODY_RISE * t;
    upperBodyGroup.position.z -= 0.02 * t;
    upperBodyGroup.rotation.x += PLOW_BODY_UPRIGHT * t;
    upperBodyGroup.rotation.z *= 1 - 0.25 * t;
    headGroup.rotation.x += 0.08 * t;

    leftLegGroup.position.x -= PLOW_STANCE_WIDEN * t;
    rightLegGroup.position.x += PLOW_STANCE_WIDEN * t;
    leftLegGroup.rotation.x += PLOW_HIP_RELAX * t;
    rightLegGroup.rotation.x += PLOW_HIP_RELAX * t;
    leftLegGroup.rotation.z += PLOW_KNEE_IN * t;
    rightLegGroup.rotation.z -= PLOW_KNEE_IN * t;
    leftKneeGroup.rotation.x += PLOW_KNEE_RELAX * t;
    rightKneeGroup.rotation.x += PLOW_KNEE_RELAX * t;
    leftKneeGroup.rotation.z += PLOW_KNEE_IN * 0.5 * t;
    rightKneeGroup.rotation.z -= PLOW_KNEE_IN * 0.5 * t;
    leftAnkleGroup.rotation.z += PLOW_SKI_EDGE * 0.4 * t;
    rightAnkleGroup.rotation.z -= PLOW_SKI_EDGE * 0.4 * t;

    leftSkiGroup.rotation.y = 0.015 - PLOW_SKI_WEDGE * t + scrape;
    rightSkiGroup.rotation.y = -0.015 + PLOW_SKI_WEDGE * t - scrape;
    leftSkiGroup.rotation.z += PLOW_SKI_EDGE * t;
    rightSkiGroup.rotation.z -= PLOW_SKI_EDGE * t;

    leftArmGroup.rotation.z -= PLOW_ARM_OUT * t;
    rightArmGroup.rotation.z += PLOW_ARM_OUT * t;
    leftPoleGroup.rotation.x += PLOW_POLE_DROP * t;
    rightPoleGroup.rotation.x += PLOW_POLE_DROP * t;
}

export function poseSkierForCrash(progress, side) {
    const t = 1 - Math.pow(1 - Math.max(0, Math.min(1, progress)), 3);
    const s = side || 1;

    upperBodyGroup.position.set(0, WAIST_Y, 0.012);
    upperBodyGroup.rotation.x = lerp(BASE_BODY_LEAN, 0.34, t);
    upperBodyGroup.rotation.z = lerp(0.00, -0.18 * s, t);
    headGroup.rotation.x = lerp(-0.10, -0.02, t);

    leftLegGroup.position.set(-HIP_SPACING, HIP_Y, 0);
    rightLegGroup.position.set(HIP_SPACING, HIP_Y, 0);
    leftLegGroup.rotation.x = lerp(BASE_HIP_FLEX, -0.42, t);
    rightLegGroup.rotation.x = lerp(BASE_HIP_FLEX, -0.38, t);
    leftKneeGroup.rotation.x = lerp(BASE_KNEE_FLEX, 0.72, t);
    rightKneeGroup.rotation.x = lerp(BASE_KNEE_FLEX, 0.64, t);
    leftAnkleGroup.rotation.x = lerp(BASE_ANKLE_FLEX, -0.02, t);
    rightAnkleGroup.rotation.x = lerp(BASE_ANKLE_FLEX, -0.02, t);

    leftSkiGroup.rotation.x = -(leftLegGroup.rotation.x + leftKneeGroup.rotation.x + leftAnkleGroup.rotation.x);
    rightSkiGroup.rotation.x = -(rightLegGroup.rotation.x + rightKneeGroup.rotation.x + rightAnkleGroup.rotation.x);
    leftSkiGroup.rotation.y = 0.015;
    rightSkiGroup.rotation.y = -0.015;
    leftSkiGroup.rotation.z = 0;
    rightSkiGroup.rotation.z = 0;

    leftArmGroup.rotation.x = lerp(BASE_ARM_X, -0.12, t);
    rightArmGroup.rotation.x = lerp(BASE_ARM_X, -0.12, t);
    leftArmGroup.rotation.z = lerp(-BASE_ARM_Z, -0.38, t);
    rightArmGroup.rotation.z = lerp(BASE_ARM_Z, 0.38, t);
    leftForearmGroup.rotation.x = lerp(BASE_FOREARM_X, -0.12, t);
    rightForearmGroup.rotation.x = lerp(BASE_FOREARM_X, -0.12, t);
}
