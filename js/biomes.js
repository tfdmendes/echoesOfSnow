import { PLAY_HALF_X } from './terrain.js';

export const BIOME_BASE   = 'base';
export const BIOME_FOREST = 'forest';

// Each chunk past this game speed adds one extra chunk to the active biome's length.
// Lets fast players stay longer in each biome instead of zipping past in seconds.
const SPEED_LENGTH_STEP = 5;
const SPEED_BASELINE = 14;

/**
 * Biome registry.
 *
 * Each biome describes:
 *   - spawnWeight       Relative probability of being picked when the current biome
 *                       ends. Values are normalised at pick time, so absolute scale
 *                       does not matter (e.g. {1, 2} is equivalent to {0.33, 0.66}).
 * 
 *   - chunkLength       Base number of consecutive chunks assigned to this biome
 *                       once it is picked. Effective length grows with game speed
 *                       via SPEED_LENGTH_STEP.
 * 
 *   - densityMultiplier Scales the base obstacle count per chunk. 1.0 = unchanged,
 *                       3.0 = three times more obstacles attempted in the chunk.
 *                       Effective count is still bounded by minSpacing rejection.
 * 
 *   - lateralLimit      Half-width of the playable corridor (in world units).
 *                       Crossing |x| > lateralLimit triggers an edge fall.
 *                       Forest narrows this so trees on the sides feel like walls.
 * 
 *   - minSpacing        Minimum distance (world units) between obstacle centres
 *                       within a chunk. Lower = denser packing allowed.
 * 
 *   - weights           Day-time probability table for picking each obstacle kind.
 *                       Values are relative; they are normalised by total when sampled.
 * 
 *   - nightWeights      Same shape as weights, but used when the chunk is populated
 *                       at night. Lets night swap in lit obstacles, drop dark ones, etc.
 */
export const BIOMES = {
    [BIOME_BASE]: {
        name: BIOME_BASE,
        spawnWeight: 0.35,
        chunkLength: 4,
        densityMultiplier: 1.0,
        lateralLimit: PLAY_HALF_X,
        minSpacing: 3.5,
        weights: {
            tree: 0.28, rock: 0.13, snowman: 0.13, fallenLog: 0.13,
            stump: 0.08, fence: 0.10, litFence: 0.08, lamppost: 0.07,
        },
        nightWeights: {
            tree: 0.18, rock: 0.08, snowman: 0.08, fallenLog: 0.08,
            stump: 0.08, fence: 0.00, litFence: 0.25, lamppost: 0.25,
        },
    },
    [BIOME_FOREST]: {
        name: BIOME_FOREST,
        spawnWeight: 0.65,
        chunkLength: 20,
        densityMultiplier: 3.5,
        lateralLimit: PLAY_HALF_X * 0.65,
        minSpacing: 2.1,
        weights: {
            tree: 0.78, rock: 0.05, snowman: 0.00, fallenLog: 0.10,
            stump: 0.07, fence: 0.00, litFence: 0.00, lamppost: 0.00,
        },
        nightWeights: {
            tree: 0.78, rock: 0.05, snowman: 0.00, fallenLog: 0.10,
            stump: 0.07, fence: 0.00, litFence: 0.00, lamppost: 0.00,
        },
    },
};

let currentBiome = BIOME_BASE;
let chunksRemainingInBiome = 0;

function biomeLengthForSpeed(biomeName, gameSpeed) {
    const biome = BIOMES[biomeName];
    const bonus = Math.max(0, Math.floor((gameSpeed - SPEED_BASELINE) / SPEED_LENGTH_STEP));
    return biome.chunkLength + bonus;
}

// Weighted random pick across all biomes using their spawnWeight field.
// Repeats are allowed: a biome can be picked twice in a row, which produces
// long stretches of the same terrain when its weight is high.
function pickWeightedBiome() {
    let total = 0;
    for (const name in BIOMES) total += BIOMES[name].spawnWeight;

    let r = Math.random() * total;
    for (const name in BIOMES) {
        r -= BIOMES[name].spawnWeight;
        if (r <= 0) return name;
    }
    return BIOME_BASE;
}

export function getBiomeForNextChunk(gameSpeed) {
    if (chunksRemainingInBiome <= 0) {
        currentBiome = pickWeightedBiome();
        chunksRemainingInBiome = biomeLengthForSpeed(currentBiome, gameSpeed);
    }
    chunksRemainingInBiome--;
    return currentBiome;
}

export function resetBiomeProgression() {
    currentBiome = BIOME_BASE;
    chunksRemainingInBiome = biomeLengthForSpeed(BIOME_BASE, SPEED_BASELINE);
}

export function getBiome(name) {
    return BIOMES[name] || BIOMES[BIOME_BASE];
}

resetBiomeProgression();
