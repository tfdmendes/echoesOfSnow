/*
Author: Tiago Mendes 119378         
        Anthropic Claude Sonnet 4.6 
        OpenAI ChatGPT 5.5 Thinking 

This module manages the game's sound and music using the Web Audio API:
- loads music, sound effects and ambient loops;
- separates music, sound effects and ambience into different gain buses;
- fades sounds in and out depending on the game state and biome;
- adjusts skiing and wind sounds according to speed, boost and weather;
- applies a small crossfade to looping audio buffers to reduce audible loop cuts.

AI assistance:
This file was developed with AI assistance, mainly for structuring the Web Audio API
logic, managing looping sounds, and implementing smooth volume transitions between
game states and biomes.


Representative prompt used:
"Help me build an audio manager for a Three.js skiing game using the Web Audio API.
I need menu music, sound effects, looping ambience, biome-based wind/forest/blizzard
layers, and smooth fade transitions instead of abruptly starting and stopping audio."

Manual work:

*/


import { BIOME_BASE, BIOME_FOREST, BIOME_BLIZZARD } from './biomes.js';

const FILES = {
    menuMusic:      'assets/audio/menu_music.mp3',
    uiClick:        'assets/audio/ui-button-click.mp3',
    coinPickup:     'assets/audio/retro-coin.mp3',
    skiing:         'assets/audio/skiing.wav',
    velocityWind:   'assets/audio/velocity_wind.wav',
    softWind:       'assets/audio/soft-wind.mp3',
    forestDay:      'assets/audio/forestbirds.mp3',
    forestNight:    'assets/audio/night-cricket-ambience.mp3',
    blizzardBase:   'assets/audio/blizzard-wind.mp3',
    blizzardStorm:  'assets/audio/freezing-winter-wind.mp3',
};

const MUSIC_TARGET_VOL    = 0.55;
const SKIING_BASE_VOL     = 0.45; // constant scrape of skis on snow while alive
const SKIING_SPEED_BONUS  = 0.20; // extra gain added linearly from base speed → saturation
const VELOCITY_WIND_MIN   = 30;   // m/s where speed wind starts to be audible (silent below)
const VELOCITY_WIND_MAX   = 65;   // m/s where speed wind saturates
const VELOCITY_WIND_CURVE = 2.0;  // power curve on speedT — keeps low/mid speeds quiet
const VELOCITY_WIND_PEAK  = 0.75; // gain at saturation, no boost
const VELOCITY_WIND_BOOST = 0.30; // extra gain added while W is held (scaled by speedT)
const SOFT_WIND_TARGET    = 0.22;
const FOREST_DAY_TARGET   = 0.30;
const FOREST_NIGHT_TARGET = 0.35;
const BLIZZARD_BASE_TARGET  = 0.50;
const BLIZZARD_STORM_BASE   = 0.25; // freezing-winter-wind volume during calm/telegraph
const BLIZZARD_STORM_PEAK   = 0.95; // freezing-winter-wind volume at full gust
const FADE_TIME = 0.4; // seconds for crossfades between biomes/states

let ctx = null;
let masterGain = null;
let musicGain  = null;
let sfxGain    = null;
let ambGain    = null;   // shared bus for all looping ambient/wind layers

// Looping buffers get a post-decode pass that overlaps the tail back onto the
// head, so the wrap point is a crossfade instead of a discontinuity. Files
// downloaded from sample libraries almost never loop seamlessly on their own.
const LOOPING_FILES = new Set([
    'menuMusic', 'skiing', 'velocityWind', 'softWind',
    'forestDay', 'forestNight', 'blizzardBase', 'blizzardStorm',
]);
const SEAMLESS_XFADE_SEC = 0.25;

const buffers = {};      // name -> AudioBuffer (post-seamless treatment for loops)
const loops = {};        // name -> { source, gain, playing, targetVol }
let unlocked = false;
let menuMusicWanted = false;
let pendingLoad = null;

function ensureContext() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1.0;
    masterGain.connect(ctx.destination);

    musicGain = ctx.createGain(); musicGain.gain.value = 1.0; musicGain.connect(masterGain);
    sfxGain   = ctx.createGain(); sfxGain.gain.value   = 1.0; sfxGain.connect(masterGain);
    ambGain   = ctx.createGain(); ambGain.gain.value   = 1.0; ambGain.connect(masterGain);
    return ctx;
}

// Build a new buffer whose first N samples are a crossfade between the
// original's tail and head. Playing this with loop=true gives a seamless wrap:
// at the loop point the audio is already mid-blend, so there is no audible
// junction. Length shrinks by the crossfade window (the tail is folded into
// the head instead of being played sequentially).
function makeSeamlessBuffer(audioCtx, original, xfadeSec) {
    const channels = original.numberOfChannels;
    const sampleRate = original.sampleRate;
    const len = original.length;
    const xfade = Math.min(
        Math.floor(xfadeSec * sampleRate),
        Math.floor(len / 4)
    );
    if (xfade < 2) return original; // buffer too short to bother

    const newLen = len - xfade;
    const out = audioCtx.createBuffer(channels, newLen, sampleRate);

    for (let ch = 0; ch < channels; ch++) {
        const src = original.getChannelData(ch);
        const dst = out.getChannelData(ch);

        // First xfade samples: equal-power blend of (tail fading out) + (head fading in)
        for (let i = 0; i < xfade; i++) {
            const t = i / xfade;
            const fadeIn  = Math.sin(t * Math.PI / 2);
            const fadeOut = Math.cos(t * Math.PI / 2);
            dst[i] = src[newLen + i] * fadeOut + src[i] * fadeIn;
        }
        // Rest of the buffer is the original body verbatim
        for (let i = xfade; i < newLen; i++) {
            dst[i] = src[i];
        }
    }
    return out;
}

async function loadBuffer(name) {
    if (buffers[name]) return buffers[name];
    const res = await fetch(FILES[name]);
    const arr = await res.arrayBuffer();
    const raw = await ctx.decodeAudioData(arr);
    buffers[name] = LOOPING_FILES.has(name)
        ? makeSeamlessBuffer(ctx, raw, SEAMLESS_XFADE_SEC)
        : raw;
    return buffers[name];
}

function loadAll() {
    if (pendingLoad) return pendingLoad;
    pendingLoad = Promise.all(Object.keys(FILES).map(loadBuffer));
    return pendingLoad;
}

function rampTo(param, value, time = FADE_TIME) {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + time);
}

function startLoop(name, initialVol) {
    const buffer = buffers[name];
    if (!buffer) return null;
    const existing = loops[name];
    if (existing && existing.playing) return existing;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(gain);
    gain.connect(ambGain);
    source.start(0);

    const entry = { source, gain, playing: true, targetVol: initialVol };
    loops[name] = entry;
    rampTo(gain.gain, initialVol, FADE_TIME);
    return entry;
}

function setLoopVolume(name, target, fade = FADE_TIME) {
    const entry = loops[name];
    if (!entry) {
        if (target > 0.001) startLoop(name, target);
        return;
    }
    entry.targetVol = target;
    rampTo(entry.gain.gain, target, fade);
}

function setLoopRate(name, rate) {
    const entry = loops[name];
    if (entry && entry.source) entry.source.playbackRate.value = rate;
}

function unlock() {
    if (unlocked) return;
    if (!ensureContext()) return;
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
    loadAll().then(() => {
        if (menuMusicWanted) startMenuMusic();
    });
}

window.addEventListener('pointerdown', unlock, { once: false });
window.addEventListener('keydown', unlock, { once: false });

try {
    if (ensureContext()) loadAll();
} catch (_) { /* ignore — full unlock will retry on first gesture */ }

// ---- Public API ----

export function playMenuMusic() {
    menuMusicWanted = true;
    if (!unlocked || !buffers.menuMusic) return;
    startMenuMusic();
}

function startMenuMusic() {
    const buffer = buffers.menuMusic;
    if (!buffer) return;
    const entry = loops.menuMusic;
    if (entry && entry.playing) {
        rampTo(entry.gain.gain, MUSIC_TARGET_VOL, FADE_TIME);
        return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(musicGain);
    source.start(0);
    loops.menuMusic = { source, gain, playing: true, targetVol: MUSIC_TARGET_VOL };
    rampTo(gain.gain, MUSIC_TARGET_VOL, 0.8);
}

export function stopMenuMusic(fade = 0.6) {
    menuMusicWanted = false;
    const entry = loops.menuMusic;
    if (!entry || !entry.playing) return;
    rampTo(entry.gain.gain, 0, fade);
    const src = entry.source;
    setTimeout(() => {
        try { src.stop(); } catch (_) {}
        entry.playing = false;
        loops.menuMusic = null;
    }, fade * 1000 + 50);
}

export function playUiClick() {
    if (!unlocked || !buffers.uiClick) return;
    const source = ctx.createBufferSource();
    source.buffer = buffers.uiClick;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    source.connect(gain);
    gain.connect(sfxGain);
    source.start(0);
}

export function playCoinPickup(count = 1) {
    if (!unlocked || !buffers.coinPickup) return;
    const n = Math.min(count, 3);
    for (let i = 0; i < n; i++) {
        const source = ctx.createBufferSource();
        source.buffer = buffers.coinPickup;
        // Small ascending pitch sweep when several coins are grabbed at once
        source.playbackRate.value = 1.0 + i * 0.08 + (Math.random() - 0.5) * 0.04;
        const gain = ctx.createGain();
        gain.gain.value = 0.55;
        source.connect(gain);
        gain.connect(sfxGain);
        source.start(ctx.currentTime + i * 0.04);
    }
}

// Stop all looping gameplay sounds (called on returnToMenu / gameover overlay).
export function stopGameplayLoops(fade = 0.5) {
    for (const name of ['velocityWind', 'softWind', 'forestDay', 'forestNight', 'blizzardBase', 'blizzardStorm']) {
        const entry = loops[name];
        if (!entry || !entry.playing) continue;
        rampTo(entry.gain.gain, 0, fade);
        const src = entry.source;
        setTimeout(() => {
            try { src.stop(); } catch (_) {}
            entry.playing = false;
            loops[name] = null;
        }, fade * 1000 + 50);
    }
}

export function updateGameAudio({
    gameState,       // 'menu' | 'intro' | 'playing' | 'falling' | 'gameover'
    gameSpeed,       // m/s
    boostAmount,     // 0..1 (W held)
    biomeName,       // string, current biome under the skier
    nightFactor,     // 0 (day) .. 1 (night)
    blizzardFactor,  // 0..1, smooth blend used by the visual blizzard
    windGustStrength,// 0..1, only > 0 during the actual gust phase (not telegraph)
}) {
    if (!unlocked || !ctx) return;

    const isLive = gameState === 'playing' || gameState === 'intro' || gameState === 'falling';

    // -- Velocity wind + skiing scrape: both always on while alive --
    if (isLive) {
        const speedT = Math.max(0, Math.min(1,
            (gameSpeed - VELOCITY_WIND_MIN) / (VELOCITY_WIND_MAX - VELOCITY_WIND_MIN)));
        // Power curve: silent at low speeds, ramps up sharply once you're really moving
        const windT = Math.pow(speedT, VELOCITY_WIND_CURVE);

        const windTarget = windT * VELOCITY_WIND_PEAK + boostAmount * VELOCITY_WIND_BOOST * windT;
        setLoopVolume('velocityWind', windTarget, 0.15);
        // Slight pitch lift with speed so the wind reads as faster, not just louder
        setLoopRate('velocityWind', 0.9 + windT * 0.4);

        // Skiing scrape sits at a constant base and lifts slightly with speed so
        // accelerating still feels textured under the wind layer
        const skiingTarget = SKIING_BASE_VOL + SKIING_SPEED_BONUS * speedT;
        setLoopVolume('skiing', skiingTarget, 0.20);
        setLoopRate('skiing', 0.95 + speedT * 0.20);
    } else {
        setLoopVolume('velocityWind', 0, 0.4);
        setLoopVolume('skiing', 0, 0.4);
    }

    const inBase     = isLive && biomeName === BIOME_BASE;
    const inForest   = isLive && biomeName === BIOME_FOREST;
    const blizzardMix = isLive ? blizzardFactor : 0;

    setLoopVolume('softWind',    inBase ? SOFT_WIND_TARGET : 0);
    setLoopVolume('forestDay',   inForest ? FOREST_DAY_TARGET * (1 - nightFactor) : 0);
    setLoopVolume('forestNight', inForest ? FOREST_NIGHT_TARGET * nightFactor : 0);

    setLoopVolume('blizzardBase', BLIZZARD_BASE_TARGET * blizzardMix);

    const stormBase = BLIZZARD_STORM_BASE * blizzardMix;
    const stormGust = (BLIZZARD_STORM_PEAK - BLIZZARD_STORM_BASE) * blizzardMix
                        * Math.pow(Math.max(0, Math.min(1, windGustStrength || 0)), 1.5);
    setLoopVolume('blizzardStorm', stormBase + stormGust, 0.20);
}

// Convenience: explicit call from scene.js the very first frame after PLAY
// so an unlock that arrived between menu and playing flushes pending starts.
export function resumeAudioIfSuspended() {
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
}
