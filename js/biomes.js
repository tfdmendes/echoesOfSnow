/*
Author: Tiago Mendes 119378

This module defines the different gameplay biomes used:
- base biome, with balanced obstacle placement;
- forest biome, with higher tree density;
- blizzard biome, with reduced visibility, stronger wind and different obstacle weights.

Each biome stores gameplay parameters such as obstacle density, coin density,
minimum spacing, obstacle type weights, night-time weights and, for the blizzard,
wind and fog settings.
*/



export const BIOME_BASE     = 'base';
export const BIOME_FOREST   = 'forest';
export const BIOME_BLIZZARD = 'blizzard';

const SPEED_SPAN_STEP = 5;
const SPEED_BASELINE  = 14;

/**
 * Biome registry. Fields:
 *   spawnChance        Relative pick weight (normalised at pick time).
 *   chunkSpan          Consecutive chunks the biome occupies once picked;
 *                      grows with gameSpeed via SPEED_SPAN_STEP.
 *   densityMultiplier  Scales the base obstacle count per chunk.
 *   minSpacing         Min distance (world units) between obstacle centres.
 *   weights            Day-time obstacle type weights (normalised on sample).
 *   nightWeights       Same shape, used at night.
 *
 * Optional (blizzard-only today):
 *   windPeakForce      Peak lateral force on the skier, m/s, at gust centre.
 *   windGustMin/Max    Gust duration window, seconds (half-sine envelope).
 *   windTelegraphMin/Max  Silent lead-in before each gust, seconds.
 *   windCalmMin/Max    Quiet interval between gust cycles, seconds.
 *   windApproachDist   Look-ahead (world units) for the storm front fade-in.
 *   windRecedeDist     Look-behind (world units) for the storm front fade-out.
 *   fogNearOverride    Target fog.near under full blizzard effect.
 *   fogFarOverride     Target fog.far under full blizzard effect.
 *   fogColorOverride   Hex colour the fog tints toward.
 */
export const BIOMES = {
    [BIOME_BASE]: {
        name: BIOME_BASE,
        spawnChance: 0.90,
        chunkSpan: 4,
        densityMultiplier: 1.0,
        coinDensityMultiplier: 1.0,
        minSpacing: 3.5,
        weights: {
            tree: 0.28, rock: 0.13, snowman: 0.13, fallenLog: 0.13,
            stump: 0.08, fence: 0.10, litFence: 0.08, lamppost: 0.07,
        },
        nightWeights: {
            tree: 0.26, rock: 0.13, snowman: 0.10, fallenLog: 0.11,
            stump: 0.10, fence: 0.00, litFence: 0.13, lamppost: 0.17,
        },
    },
    [BIOME_FOREST]: {
        name: BIOME_FOREST,
        spawnChance: 0.25,
        chunkSpan: 20,
        densityMultiplier: 3.5,
        coinDensityMultiplier: 0.8,
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
    [BIOME_BLIZZARD]: {
        name: BIOME_BLIZZARD,
        spawnChance: 0.10,
        chunkSpan: 10,
        densityMultiplier: 0.7,
        coinDensityMultiplier: 1.4,
        minSpacing: 3.8,
        weights: {
            tree: 0.18, rock: 0.30, snowman: 0.04, fallenLog: 0.20,
            stump: 0.20, fence: 0.08, litFence: 0.00, lamppost: 0.00,
        },
        nightWeights: {
            tree: 0.18, rock: 0.30, snowman: 0.04, fallenLog: 0.20,
            stump: 0.20, fence: 0.08, litFence: 0.00, lamppost: 0.00,
        },
        windPeakForce:        6.5,
        windGustMin:          1.2,
        windGustMax:          2.4,
        windTelegraphMin:     0.7,
        windTelegraphMax:     1.1,
        windCalmMin:          1.8,
        windCalmMax:          3.6,
        windApproachDist:     90,
        windRecedeDist:       90,
        fogNearOverride:      12,
        fogFarOverride:       80,
        fogColorOverride:     0xdfe6ec,
    },
};

let currentBiome = BIOME_BASE;
let chunksRemainingInBiome = 0;

function biomeSpanForSpeed(biomeName, gameSpeed) {
    const biome = BIOMES[biomeName];
    const bonus = Math.max(0, Math.floor((gameSpeed - SPEED_BASELINE) / SPEED_SPAN_STEP));
    return biome.chunkSpan + bonus;
}

function pickWeightedBiome() {
    let total = 0;
    for (const name in BIOMES) total += BIOMES[name].spawnChance;

    let r = Math.random() * total;
    for (const name in BIOMES) {
        r -= BIOMES[name].spawnChance;
        if (r <= 0) return name;
    }
    return BIOME_BASE;
}

export function getBiomeForNextChunk(gameSpeed) {
    if (chunksRemainingInBiome <= 0) {
        currentBiome = pickWeightedBiome();
        chunksRemainingInBiome = biomeSpanForSpeed(currentBiome, gameSpeed);
    }
    chunksRemainingInBiome--;
    return currentBiome;
}

export function resetBiomeProgression() {
    currentBiome = BIOME_BASE;
    chunksRemainingInBiome = biomeSpanForSpeed(BIOME_BASE, SPEED_BASELINE);
}

export function getBiome(name) {
    return BIOMES[name] || BIOMES[BIOME_BASE];
}

resetBiomeProgression();
