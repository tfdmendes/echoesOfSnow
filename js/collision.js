// Lightweight ground-plane collision helper.
//
// A full rigid-body engine would be overkill here: gameplay only needs to
// know whether the skier footprint hits an obstacle on the XZ plane. This
// module keeps that cheap by using:
//   1. a broad-phase bounding circle to reject far obstacles quickly;
//   2. a narrow-phase test for either circle or oriented-box obstacles;
//   3. a returned contact normal so scene.js can drive crash direction.

export const SKIER_RADIUS = 0.45;

const EPSILON = 0.0001;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function createCircleCollider(radius) {
    return {
        type: 'circle',
        radius,
        boundsRadius: radius
    };
}

// halfX and halfZ are the local-space half-extents of the box after it
// has been rotated by angle around the Y axis.
export function createOrientedBoxCollider(halfX, halfZ, angle) {
    return {
        type: 'box',
        halfX,
        halfZ,
        cos: Math.cos(angle),
        sin: Math.sin(angle),
        boundsRadius: Math.hypot(halfX, halfZ)
    };
}

function circleVsCircle(dx, dz, collider) {
    const limit = SKIER_RADIUS + collider.radius;
    const distSq = dx * dx + dz * dz;
    if (distSq >= limit * limit) return null;

    const dist = Math.sqrt(distSq);
    const invDist = dist > EPSILON ? 1 / dist : 0;

    return {
        normalX: dist > EPSILON ? dx * invDist : 0,
        normalZ: dist > EPSILON ? dz * invDist : -1,
        penetration: limit - dist
    };
}

function boxNormalToWorld(localNormalX, localNormalZ, collider) {
    return {
        normalX: localNormalX * collider.cos - localNormalZ * collider.sin,
        normalZ: localNormalX * collider.sin + localNormalZ * collider.cos
    };
}

function circleVsBox(dx, dz, collider) {
    // Move the skier center into the obstacle's local box frame.
    const localX = dx * collider.cos + dz * collider.sin;
    const localZ = -dx * collider.sin + dz * collider.cos;

    const closestX = clamp(localX, -collider.halfX, collider.halfX);
    const closestZ = clamp(localZ, -collider.halfZ, collider.halfZ);

    const errorX = localX - closestX;
    const errorZ = localZ - closestZ;
    const distSq = errorX * errorX + errorZ * errorZ;
    if (distSq >= SKIER_RADIUS * SKIER_RADIUS) return null;

    if (distSq > EPSILON) {
        const dist = Math.sqrt(distSq);
        const worldNormal = boxNormalToWorld(errorX / dist, errorZ / dist, collider);
        return {
            ...worldNormal,
            penetration: SKIER_RADIUS - dist
        };
    }

    // If the skier center is inside the box, use the closest face as the
    // exit direction. This prevents zero-length normals on direct hits.
    const exitX = collider.halfX - Math.abs(localX);
    const exitZ = collider.halfZ - Math.abs(localZ);
    const localNormalX = exitX < exitZ ? (localX >= 0 ? 1 : -1) : 0;
    const localNormalZ = exitX < exitZ ? 0 : (localZ >= 0 ? 1 : -1);
    const worldNormal = boxNormalToWorld(localNormalX, localNormalZ, collider);

    return {
        ...worldNormal,
        penetration: SKIER_RADIUS + Math.min(exitX, exitZ)
    };
}

export function checkSkierCollision(skierPos, chunks) {
    for (const chunk of chunks) {
        const obs = chunk.userData.obstacles || [];

        for (const ob of obs) {
            const collider = ob.collider;
            if (!collider) continue;

            const worldX = chunk.position.x + ob.localX;
            const worldZ = chunk.position.z + ob.localZ;
            const dx = skierPos.x - worldX;
            const dz = skierPos.z - worldZ;

            // Broad phase: reject anything outside a conservative bounding
            // circle before doing the exact circle/box math.
            const broadLimit = SKIER_RADIUS + collider.boundsRadius;
            if (dx * dx + dz * dz > broadLimit * broadLimit) continue;

            const hit = collider.type === 'box'
                ? circleVsBox(dx, dz, collider)
                : circleVsCircle(dx, dz, collider);

            if (hit) {
                return {
                    ...hit,
                    obstacle: ob.mesh,
                    obstacleX: worldX,
                    obstacleZ: worldZ,
                    colliderType: collider.type
                };
            }
        }
    }

    return null;
}
