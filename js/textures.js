import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map();

function load(path, { repeat = [1, 1], srgb = true, anisotropy = 8 } = {}) {
    const key = `${path}|${repeat[0]}|${repeat[1]}|${srgb}|${anisotropy}`;
    if (cache.has(key)) return cache.get(key);
    const tex = loader.load(path);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = anisotropy;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, tex);
    return tex;
}

export function applyMaterialTextures(mat, def, overrides = {}) {
    if (!def) return;
    const useMap       = overrides.useMap       ?? true;
    const useNormalMap = overrides.useNormalMap ?? true;
    const repeat       = overrides.repeat       ?? def.repeat ?? [1, 1];
    const normalScale  = overrides.normalScale  ?? def.normalScale ?? 0.5;
    const anisotropy   = overrides.anisotropy   ?? 8;

    if (useMap && def.map) {
        mat.map = load(def.map, { repeat, srgb: true, anisotropy });
    }
    if (useNormalMap && def.normal) {
        mat.normalMap = load(def.normal, { repeat, srgb: false, anisotropy });
        if (mat.normalScale) mat.normalScale.set(normalScale, normalScale);
    }
    mat.needsUpdate = true;
}

export const TEX = {
    jacketQuilted: {
        map:    'assets/textures/fabric/fabric_pattern_07_col_1_1k.png',
        normal: 'assets/textures/fabric/fabric_pattern_07_nor_gl_1k.jpg',
        repeat: [2, 2],
        normalScale: 0.55,
    },
    jacketWaffle: {
        map:    'assets/textures/pique_cotton/waffle_pique_cotton_diff_1k.jpg',
        normal: 'assets/textures/pique_cotton/waffle_pique_cotton_nor_gl_1k.jpg',
        repeat: [4, 4],
        normalScale: 0.45,
    },
    pantsCorduroy: {
        map:    'assets/textures/corduroy/ribbed_corduroy_diff_1k.jpg',
        normal: 'assets/textures/corduroy/ribbed_corduroy_nor_gl_1k.jpg',
        repeat: [3, 4],
        normalScale: 0.6,
    },
    bark: {
        map:    'assets/textures/bark/bark_brown_02_diff_1k.jpg',
        normal: 'assets/textures/bark/bark_brown_02_nor_gl_1k.jpg',
        repeat: [1, 3],
        normalScale: 0.7,
    },
    woolBoucle: {
        map:    'assets/textures/wool_boucle/wool_boucle_diff_1k.jpg',
        normal: 'assets/textures/wool_boucle/wool_boucle_nor_gl_1k.jpg',
        repeat: [2, 2],
        normalScale: 0.6,
    },
    snow01: {
        map:    'assets/textures/snow/snow01/snow_01_diff_1k.jpg',
        normal: 'assets/textures/snow/snow01/snow_01_nor_gl_1k.jpg',
        repeat: [4, 4],
        normalScale: 0.4,
    },
    snow02: {
        map:    'assets/textures/snow/snow02/snow_02_diff_1k.jpg',
        normal: 'assets/textures/snow/snow02/snow_02_nor_gl_1k.jpg',
        repeat: [4, 4],
        normalScale: 0.4,
    },
    snow03: {
        map:    'assets/textures/snow/snow03/snow_03_diff_1k.jpg',
        normal: 'assets/textures/snow/snow03/snow_03_nor_gl_1k.jpg',
        repeat: [4, 4],
        normalScale: 0.4,
    },
};
