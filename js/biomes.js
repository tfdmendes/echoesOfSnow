import { PLAY_HALF_X } from './terrain.js';

export const BIOME_BASE   = 'base';
export const BIOME_FOREST = 'forest';

const SPEED_LENGTH_STEP = 5;
const SPEED_BASELINE = 14;

export const BIOMES = {
    [BIOME_BASE]: {
        name: BIOME_BASE,
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
        chunkLength: 12,
        densityMultiplier: 2.2,
        lateralLimit: PLAY_HALF_X * 0.65,
        minSpacing: 2.6,
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

const ORDER = [BIOME_BASE, BIOME_FOREST];

let currentBiome = BIOME_BASE;
let chunksRemainingInBiome = 0;

function biomeLengthForSpeed(biomeName, gameSpeed) {
    const biome = BIOMES[biomeName];
    const bonus = Math.max(0, Math.floor((gameSpeed - SPEED_BASELINE) / SPEED_LENGTH_STEP));
    return biome.chunkLength + bonus;
}

export function getBiomeForNextChunk(gameSpeed) {
    if (chunksRemainingInBiome <= 0) {
        const idx = ORDER.indexOf(currentBiome);
        currentBiome = ORDER[(idx + 1) % ORDER.length];
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
