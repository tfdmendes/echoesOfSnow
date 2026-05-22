/*
Author: Tiago Mendes 119378    
        Claude Sonnet 4.6       

    AI Assistance: Picked the colors and names for each outfit
*/

const SHOP_KEY = 'echoes-of-snow:shop';
const SHOP_VERSION = 1;

export const CHARACTERS = [
    {
        id: 'classic', name: 'CLASSIC', price: 0,
        jacketColor: 0xdd2222, skiColor: 0x2244aa, skiAccentColor: 0xeef6ff,
        hatColor: 0xcc1111, pantsColor: 0x111a33, hat: 'beanie', goggles: 'orange',
    },
    {
        id: 'alpine', name: 'ALPINE', price: 60,
        jacketColor: 0x2c4a8a, skiColor: 0x4477cc, skiAccentColor: 0xddeeff,
        hatColor: 0x1a2a4a, pantsColor: 0x111a33, hat: 'helmet', goggles: 'mirror',
    },
    {
        id: 'ranger', name: 'RANGER', price: 120,
        jacketColor: 0x2e6b3a, skiColor: 0xddd6b8, skiAccentColor: 0x5a4a2a,
        hatColor: 0x4a3a22, pantsColor: 0x2a2418, hat: 'cap', goggles: 'sunglasses',
    },
    {
        id: 'shadow', name: 'SHADOW', price: 200,
        jacketColor: 0x141420, skiColor: 0x222226, skiAccentColor: 0x6677aa,
        hatColor: 0x101018, pantsColor: 0x0a0a12, hat: 'none', goggles: 'mirror',
    },
    {
        id: 'royale', name: 'ROYALE', price: 350,
        jacketColor: 0xa6182a, skiColor: 0xe8b923, skiAccentColor: 0xfff2c0,
        hatColor: 0x6a1020, pantsColor: 0xd8c298, hat: 'crown', goggles: 'mirror',
    },
    {
        id: 'racer', name: 'RACER', price: 280,
        jacketColor: 0xe0b020, skiColor: 0xc02828, skiAccentColor: 0x202020,
        hatColor: 0x882020, pantsColor: 0x111a33, hat: 'helmet', goggles: 'visor',
    },
];

export const JACKETS = [
    { id: 'default', name: 'CHARACTER DEFAULT', price: 0, color: null },
    { id: 'crimson',  name: 'CRIMSON',  price: 30,  color: 0xc91d2a },
    { id: 'cobalt',   name: 'COBALT',   price: 40,  color: 0x2266dd },
    { id: 'forest',   name: 'FOREST',   price: 50,  color: 0x2a6e3a },
    { id: 'magenta',  name: 'MAGENTA',  price: 60,  color: 0xcc2299 },
    { id: 'jet',      name: 'JET BLACK', price: 80, color: 0x1a1a1a },
    { id: 'gold',     name: 'GOLD',     price: 150, color: 0xd4a72c },
    { id: 'arctic',   name: 'ARCTIC WHITE', price: 90, color: 0xeef2f8 },
];

export const SKIS = [
    { id: 'default',  name: 'CHARACTER DEFAULT', price: 0, color: null, accent: null },
    { id: 'crimson',  name: 'CRIMSON',  price: 40, color: 0xaa2233, accent: 0xffd0d0 },
    { id: 'emerald',  name: 'EMERALD',  price: 50, color: 0x2a8855, accent: 0xdfffe6 },
    { id: 'sunset',   name: 'SUNSET',   price: 60, color: 0xe06820, accent: 0xfff0c0 },
    { id: 'gold',     name: 'GOLD',     price: 120, color: 0xddaa33, accent: 0xfff5cc },
    { id: 'carbon',   name: 'CARBON',   price: 80, color: 0x1c1c20, accent: 0x6a7a90 },
    { id: 'glacier',  name: 'GLACIER',  price: 70, color: 0x88c8ee, accent: 0xffffff },
    { id: 'planks',   name: 'WOOD PLANKS', price: 180, color: 0x8b6a3f, accent: null, model: 'planks' },
];

const DEFAULT_STATE = {
    ownedCharacters: ['classic'],
    ownedJackets: ['default'],
    ownedSkis: ['default'],
    equippedCharacter: 'classic',
    equippedJacket: 'default',
    equippedSki: 'default',
};

let state = { ...DEFAULT_STATE };

function clone(s) {
    return {
        ownedCharacters: [...s.ownedCharacters],
        ownedJackets: [...s.ownedJackets],
        ownedSkis: [...s.ownedSkis],
        equippedCharacter: s.equippedCharacter,
        equippedJacket: s.equippedJacket,
        equippedSki: s.equippedSki,
    };
}

export function loadShopSave() {
    state = clone(DEFAULT_STATE);
    try {
        const raw = localStorage.getItem(SHOP_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || data.v !== SHOP_VERSION) return;
        if (Array.isArray(data.ownedCharacters)) state.ownedCharacters = data.ownedCharacters.slice();
        if (Array.isArray(data.ownedJackets))    state.ownedJackets    = data.ownedJackets.slice();
        if (Array.isArray(data.ownedSkis))       state.ownedSkis       = data.ownedSkis.slice();
        if (typeof data.equippedCharacter === 'string') state.equippedCharacter = data.equippedCharacter;
        if (typeof data.equippedJacket === 'string')    state.equippedJacket    = data.equippedJacket;
        if (typeof data.equippedSki === 'string')       state.equippedSki       = data.equippedSki;
    } catch (_) {
        state = clone(DEFAULT_STATE);
    }

    if (!state.ownedCharacters.includes('classic')) state.ownedCharacters.push('classic');
    if (!state.ownedJackets.includes('default'))    state.ownedJackets.push('default');
    if (!state.ownedSkis.includes('default'))       state.ownedSkis.push('default');

    if (!findCharacter(state.equippedCharacter) || !state.ownedCharacters.includes(state.equippedCharacter)) {
        state.equippedCharacter = 'classic';
    }
    if (!findJacket(state.equippedJacket) || !state.ownedJackets.includes(state.equippedJacket)) {
        state.equippedJacket = 'default';
    }
    if (!findSki(state.equippedSki) || !state.ownedSkis.includes(state.equippedSki)) {
        state.equippedSki = 'default';
    }
}

function persist() {
    try {
        localStorage.setItem(SHOP_KEY, JSON.stringify({ v: SHOP_VERSION, ...state }));
    } catch (_) { /* ignore */ }
}

function findCharacter(id) { return CHARACTERS.find(c => c.id === id); }
function findJacket(id)    { return JACKETS.find(c => c.id === id); }
function findSki(id)       { return SKIS.find(c => c.id === id); }

export function isOwned(type, id) {
    if (type === 'character') return state.ownedCharacters.includes(id);
    if (type === 'jacket')    return state.ownedJackets.includes(id);
    if (type === 'ski')       return state.ownedSkis.includes(id);
    return false;
}

export function isEquipped(type, id) {
    if (type === 'character') return state.equippedCharacter === id;
    if (type === 'jacket')    return state.equippedJacket === id;
    if (type === 'ski')       return state.equippedSki === id;
    return false;
}

export function buyItem(type, id, spendFn) {
    const item =
        type === 'character' ? findCharacter(id) :
        type === 'jacket'    ? findJacket(id) :
        type === 'ski'       ? findSki(id) : null;
    if (!item) return false;
    if (isOwned(type, id)) return false;
    if (!spendFn(item.price)) return false;

    if (type === 'character') state.ownedCharacters.push(id);
    if (type === 'jacket')    state.ownedJackets.push(id);
    if (type === 'ski')       state.ownedSkis.push(id);
    persist();
    return true;
}

export function equipItem(type, id) {
    if (!isOwned(type, id)) return false;
    if (type === 'character') state.equippedCharacter = id;
    if (type === 'jacket')    state.equippedJacket = id;
    if (type === 'ski')       state.equippedSki = id;
    persist();
    return true;
}

export function getEquippedIds() {
    return {
        character: state.equippedCharacter,
        jacket:    state.equippedJacket,
        ski:       state.equippedSki,
    };
}

export function buildAppearance(charId, jacketId, skiId) {
    const char   = findCharacter(charId) || findCharacter(state.equippedCharacter) || CHARACTERS[0];
    const jacket = findJacket(jacketId)  || findJacket(state.equippedJacket)       || JACKETS[0];
    const ski    = findSki(skiId)        || findSki(state.equippedSki)             || SKIS[0];

    return {
        jacketColor:    jacket.color    !== null ? jacket.color    : char.jacketColor,
        skiColor:       ski.color       !== null ? ski.color       : char.skiColor,
        skiAccentColor: ski.accent      !== null ? ski.accent      : char.skiAccentColor,
        hatColor:       char.hatColor,
        pantsColor:     char.pantsColor,
        hat:            char.hat,
        goggles:        char.goggles,
        skiModel:       ski.model || 'standard',
    };
}

export function getEquippedAppearance() {
    return buildAppearance(state.equippedCharacter, state.equippedJacket, state.equippedSki);
}
