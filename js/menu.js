import { playUiClick, playMenuMusic, stopMenuMusic } from './audio.js';
import {
    CHARACTERS, JACKETS, SKIS,
    isOwned, isEquipped, buyItem, equipItem,
    getEquippedIds, buildAppearance,
} from './shop.js';

const STYLE_ID = 'menu-styles';

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        @keyframes snowflakeSpin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
        }
        .menu-btn {
            display:block; width:280px; margin:0 auto;
            padding:14px 20px;
            font-family:sans-serif; font-size:16px; letter-spacing:4px;
            color:#c0d0e8; background:rgba(0,0,0,0.30);
            border:1px solid rgba(160,184,208,0.30); border-radius:6px;
            cursor:pointer; user-select:none;
            transition:background 0.18s, color 0.18s, border-color 0.18s, transform 0.12s;
        }
        .menu-btn:hover {
            background:rgba(40,60,100,0.55); color:#ffffff;
            border-color:rgba(200,220,255,0.55);
        }
        .menu-btn:active { transform:translateY(1px); }
        .menu-btn + .menu-btn { margin-top:12px; }
        .menu-btn-primary {
            color:#ffffff; background:rgba(60,100,170,0.55);
            border-color:rgba(180,210,255,0.55);
        }
        .menu-back {
            position:absolute; top:24px; left:24px;
            font-family:sans-serif; font-size:13px; letter-spacing:3px;
            color:#a0b8d0; cursor:pointer; user-select:none;
            padding:8px 14px; border-radius:4px;
            transition:color 0.15s, background 0.15s;
        }
        .menu-back:hover { color:#ffffff; background:rgba(0,0,0,0.35); }
        .menu-panel-title {
            font-family:Georgia,serif; font-size:clamp(28px,6vw,52px);
            letter-spacing:8px; color:#e4edf5;
            text-shadow:0 0 18px rgba(150,200,255,0.4);
            margin-bottom:32px; user-select:none;
        }
        .shop-tabs {
            display:flex; gap:8px; margin-bottom:18px;
        }
        .shop-tab {
            padding:8px 16px; font-family:sans-serif; font-size:12px;
            letter-spacing:3px; color:#a0b8d0;
            background:rgba(10,14,28,0.45);
            border:1px solid rgba(160,184,208,0.25); border-radius:5px;
            cursor:pointer; user-select:none;
            transition:background 0.15s, color 0.15s, border-color 0.15s;
        }
        .shop-tab:hover { color:#ffffff; }
        .shop-tab.active {
            color:#ffffff; background:rgba(60,100,170,0.55);
            border-color:rgba(180,210,255,0.55);
        }
        .shop-grid {
            display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr));
            gap:12px; max-height:60vh; overflow-y:auto;
            padding:14px; background:rgba(10,14,28,0.55);
            border:1px solid rgba(160,184,208,0.25); border-radius:10px;
        }
        .shop-grid::-webkit-scrollbar { width:8px; }
        .shop-grid::-webkit-scrollbar-thumb {
            background:rgba(160,184,208,0.30); border-radius:4px;
        }
        .shop-item {
            display:flex; flex-direction:column; align-items:stretch;
            padding:12px; background:rgba(20,28,48,0.85);
            border:1px solid rgba(160,184,208,0.25); border-radius:8px;
            font-family:sans-serif; color:#c0d0e8;
            cursor:pointer; user-select:none;
            transition:transform 0.12s, border-color 0.15s, background 0.15s;
        }
        .shop-item:hover {
            transform:translateY(-2px);
            border-color:rgba(200,220,255,0.55);
        }
        .shop-item.locked { opacity:0.85; }
        .shop-item.equipped {
            border-color:#a8cce8;
            box-shadow:0 0 14px rgba(168,204,232,0.35);
        }
        .shop-item.selected {
            border-color:#ffd060;
            box-shadow:0 0 16px rgba(255,208,96,0.45);
            transform:translateY(-2px);
        }
        .shop-confirm {
            margin-top:14px; padding:14px 18px;
            background:rgba(15,22,40,0.85);
            border:1px solid rgba(160,184,208,0.30); border-radius:10px;
            display:flex; align-items:center; gap:18px;
            font-family:sans-serif; color:#c0d0e8;
            min-height:62px;
        }
        .shop-confirm-info { flex:1; }
        .shop-confirm-name {
            font-size:14px; letter-spacing:3px; color:#e4edf5; margin-bottom:4px;
        }
        .shop-confirm-sub {
            font-size:11px; letter-spacing:2px; color:#a0b8d0;
        }
        .shop-confirm-btn {
            padding:10px 22px; font-family:sans-serif; font-size:13px;
            letter-spacing:3px; cursor:pointer; user-select:none;
            background:rgba(60,100,170,0.55); color:#ffffff;
            border:1px solid rgba(180,210,255,0.55); border-radius:6px;
            transition:background 0.15s, transform 0.12s;
        }
        .shop-confirm-btn:hover { background:rgba(80,130,210,0.75); }
        .shop-confirm-btn:active { transform:translateY(1px); }
        .shop-confirm-btn.disabled {
            background:rgba(40,46,60,0.55); color:#7890a8;
            border-color:rgba(120,140,160,0.35); cursor:not-allowed;
        }
        .shop-confirm-btn.disabled:hover { background:rgba(40,46,60,0.55); }
        .shop-swatch {
            height:50px; border-radius:6px; margin-bottom:10px;
            display:flex; align-items:center; justify-content:center;
            border:1px solid rgba(0,0,0,0.4);
        }
        .shop-swatch-stripe {
            width:60%; height:8px; border-radius:3px;
            box-shadow:0 0 6px rgba(255,255,255,0.15);
        }
        .shop-item-name {
            font-size:13px; letter-spacing:2px; color:#e4edf5;
            text-align:center; margin-bottom:6px;
        }
        .shop-item-status {
            font-size:11px; letter-spacing:2px; text-align:center;
            padding:4px 0; border-radius:4px;
        }
        .status-equipped { color:#a8cce8; }
        .status-owned    { color:#8ab09a; }
        .status-buy      { color:#e4edf5; background:rgba(60,100,170,0.55); }
        .status-locked   { color:#a08080; }
    `;
    document.head.appendChild(style);
}

function timeLabelFor(t) {
    if (t < 0.06) return 'Midnight';
    if (t < 0.10) return 'Pre-dawn';
    if (t < 0.16) return 'Dawn';
    if (t < 0.38) return 'Morning';
    if (t < 0.52) return 'Midday';
    if (t < 0.62) return 'Afternoon';
    if (t < 0.68) return 'Sunset';
    if (t < 0.76) return 'Dusk';
    if (t < 0.95) return 'Night';
    return 'Late night';
}

function buildTitle() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; align-items:flex-start;';

    const line1 = document.createElement('div');
    line1.style.cssText =
        'font-family:Georgia,serif; font-size:clamp(18px,4vw,32px);' +
        'letter-spacing:10px; color:#c0d0e8; opacity:0.8;' +
        'text-shadow:0 0 15px rgba(140,180,255,0.4); user-select:none;';
    line1.textContent = 'ECHOES OF';
    wrap.appendChild(line1);

    const line2 = document.createElement('div');
    line2.style.cssText =
        'font-family:Georgia,serif; font-size:clamp(48px,12vw,96px);' +
        'font-weight:bold; letter-spacing:14px; color:#e4edf5;' +
        'text-shadow:0 0 30px rgba(150,200,255,0.5), 0 2px 6px rgba(0,0,0,0.8);' +
        'margin-top:4px; user-select:none;';
    line2.innerHTML =
        'SN<span style="display:inline-block; color:#a8cce8;' +
        'animation:snowflakeSpin 10s linear infinite;' +
        'text-shadow:0 0 18px rgba(160,200,255,0.7);">&#10052;</span>W';
    wrap.appendChild(line2);

    return wrap;
}

function buildMainScreen(handlers) {
    const screen = document.createElement('div');
    screen.style.cssText =
        'display:flex; flex-direction:column; align-items:flex-start;' +
        'pointer-events:none;';

    screen.appendChild(buildTitle());

    const buttons = document.createElement('div');
    buttons.style.cssText =
        'margin-top:48px; padding:24px 28px;' +
        'background:rgba(10,14,28,0.35);' +
        'backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);' +
        'border-radius:12px;' +
        'pointer-events:auto;';

    const playBtn = document.createElement('button');
    playBtn.className = 'menu-btn menu-btn-primary';
    playBtn.textContent = 'PLAY';
    playBtn.addEventListener('click', () => { playUiClick(); handlers.onPlay(); });

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'menu-btn';
    settingsBtn.textContent = 'SETTINGS';
    settingsBtn.addEventListener('click', () => { playUiClick(); handlers.onSettings(); });

    const shopBtn = document.createElement('button');
    shopBtn.className = 'menu-btn';
    shopBtn.textContent = 'SHOP';
    shopBtn.addEventListener('click', () => { playUiClick(); handlers.onShop(); });

    buttons.appendChild(playBtn);
    buttons.appendChild(settingsBtn);
    buttons.appendChild(shopBtn);
    screen.appendChild(buttons);

    const hint = document.createElement('div');
    hint.style.cssText =
        'position:absolute; bottom:32px; left:0; right:0;' +
        'font-family:monospace; font-size:clamp(10px,1.4vw,14px);' +
        'color:#7890a8; opacity:0.7; letter-spacing:2px;' +
        'text-align:center; user-select:none; pointer-events:none;' +
        'text-shadow:0 1px 3px rgba(0,0,0,0.6);';
    hint.innerHTML =
        'A / &#8592; &mdash; Left &nbsp;&nbsp;&nbsp;' +
        'D / &#8594; &mdash; Right &nbsp;&nbsp;&nbsp;' +
        'W / &#8593; &mdash; Tuck &nbsp;&nbsp;&nbsp;' +
        'S / &#8595; &mdash; Snowplow &nbsp;&nbsp;&nbsp;' +
        'T &mdash; Camera';
    screen.appendChild(hint);

    return screen;
}

function buildSettingsScreen({ getStartCycleOffset, setStartCycleOffset, onBack }) {
    const screen = document.createElement('div');
    screen.style.cssText =
        'display:flex; flex-direction:column; align-items:flex-start;' +
        'width:min(420px,90vw); pointer-events:auto;';

    const back = document.createElement('div');
    back.className = 'menu-back';
    back.textContent = '< BACK';
    back.addEventListener('click', () => { playUiClick(); onBack(); });
    screen.appendChild(back);

    const title = document.createElement('div');
    title.className = 'menu-panel-title';
    title.textContent = 'SETTINGS';
    screen.appendChild(title);

    const panel = document.createElement('div');
    panel.style.cssText =
        'width:100%; padding:22px 26px;' +
        'background:rgba(15,22,40,0.85);' +
        'border:1px solid rgba(160,184,208,0.25); border-radius:10px;' +
        'color:#c0d0e8; font-family:sans-serif;' +
        'box-shadow:0 4px 24px rgba(0,0,0,0.55);';
    panel.innerHTML = `
        <div style="font-size:11px; opacity:0.55; letter-spacing:2px; text-transform:uppercase; margin-bottom:6px;">Start of run</div>
        <div class="time-label" style="font-size:22px; font-weight:bold; color:#e4edf5; margin-bottom:14px; letter-spacing:1px;"></div>
        <input class="time-slider" type="range" min="0" max="1000" style="width:100%; cursor:pointer; accent-color:#a0b8d0;">
        <div style="display:flex; justify-content:space-between; font-size:10px; opacity:0.5; margin-top:4px; letter-spacing:1px;">
            <span>00:00</span><span>12:00</span><span>24:00</span>
        </div>
    `;
    screen.appendChild(panel);

    const slider = panel.querySelector('.time-slider');
    const label  = panel.querySelector('.time-label');
    const initial = getStartCycleOffset();
    slider.value = Math.round(initial * 1000);
    label.textContent = timeLabelFor(initial);
    slider.addEventListener('input', () => {
        const t = parseInt(slider.value, 10) / 1000;
        setStartCycleOffset(t);
        label.textContent = timeLabelFor(t);
    });

    return screen;
}

function hexToCss(n) {
    return '#' + n.toString(16).padStart(6, '0');
}

function buildSwatch(type, item) {
    const swatch = document.createElement('div');
    swatch.className = 'shop-swatch';

    if (type === 'character') {
        swatch.style.background =
            `linear-gradient(135deg, ${hexToCss(item.jacketColor)} 0%, ` +
            `${hexToCss(item.jacketColor)} 55%, ` +
            `${hexToCss(item.skiColor)} 55%, ` +
            `${hexToCss(item.skiColor)} 100%)`;
    } else if (type === 'jacket' || type === 'ski') {
        if (item.color === null) {
            swatch.style.background =
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 8px, rgba(255,255,255,0.02) 8px 16px)';
            const label = document.createElement('div');
            label.style.cssText = 'font-size:10px; letter-spacing:2px; color:#a0b8d0;';
            label.textContent = 'PRESET';
            swatch.appendChild(label);
        } else if (type === 'ski' && item.model === 'planks') {
            swatch.style.background =
                'repeating-linear-gradient(90deg,' +
                ' #6f5532 0 8px, #4d3a20 8px 12px,' +
                ' #6f5532 12px 26px, #5a4322 26px 30px,' +
                ' #7a5e38 30px 44px, #4d3a20 44px 48px)';
        } else {
            swatch.style.background = hexToCss(item.color);
            if (type === 'ski' && item.accent != null) {
                const stripe = document.createElement('div');
                stripe.className = 'shop-swatch-stripe';
                stripe.style.background = hexToCss(item.accent);
                swatch.appendChild(stripe);
            }
        }
    }
    return swatch;
}

function buildShopItem(type, item, ctx) {
    const owned     = isOwned(type, item.id);
    const equipped  = isEquipped(type, item.id);
    const selected  = (ctx.selectedId === item.id);

    const card = document.createElement('div');
    card.className = 'shop-item'
        + (equipped ? ' equipped' : '')
        + (selected ? ' selected' : '');

    card.appendChild(buildSwatch(type, item));

    const name = document.createElement('div');
    name.className = 'shop-item-name';
    name.textContent = item.name;
    card.appendChild(name);

    const status = document.createElement('div');
    status.className = 'shop-item-status';
    if (equipped) {
        status.classList.add('status-equipped');
        status.textContent = 'EQUIPPED';
    } else if (owned) {
        status.classList.add('status-owned');
        status.textContent = 'OWNED';
    } else {
        status.classList.add('status-locked');
        status.innerHTML = '&#10052; ' + item.price;
    }
    card.appendChild(status);

    card.addEventListener('click', () => {
        playUiClick();
        ctx.onSelect(item.id);
    });

    return card;
}

function buildShopScreen({ onBack, getWallet, spend, onAppearanceChange, applyAppearance, refreshWallet }) {
    const screen = document.createElement('div');
    screen.style.cssText =
        'display:flex; flex-direction:column; align-items:flex-start;' +
        'width:min(760px,92vw); pointer-events:auto;';

    const back = document.createElement('div');
    back.className = 'menu-back';
    back.textContent = '< BACK';
    back.addEventListener('click', () => {
        playUiClick();
        previewState = { character: null, jacket: null, ski: null };
        onAppearanceChange();
        onBack();
    });
    screen.appendChild(back);

    const title = document.createElement('div');
    title.className = 'menu-panel-title';
    title.textContent = 'SHOP';
    screen.appendChild(title);

    const tabs = document.createElement('div');
    tabs.className = 'shop-tabs';

    const tabDefs = [
        { id: 'character', label: 'CHARACTERS', items: CHARACTERS },
        { id: 'jacket',    label: 'JACKETS',    items: JACKETS },
        { id: 'ski',       label: 'SKIS',       items: SKIS },
    ];

    let activeTab = 'character';
    // Per-tab in-shop selection (preview override). Resets when closing the shop.
    let previewState = { character: null, jacket: null, ski: null };

    const grid = document.createElement('div');
    grid.className = 'shop-grid';

    const confirmBar = document.createElement('div');
    confirmBar.className = 'shop-confirm';

    function findItem(type, id) {
        const list = type === 'character' ? CHARACTERS : type === 'jacket' ? JACKETS : SKIS;
        return list.find(c => c.id === id);
    }

    function refreshPreview() {
        const equipped = getEquippedIds();
        const charId   = previewState.character ?? equipped.character;
        const jacketId = previewState.jacket    ?? equipped.jacket;
        const skiId    = previewState.ski       ?? equipped.ski;
        applyAppearance(buildAppearance(charId, jacketId, skiId));
    }

    function refreshConfirmBar() {
        confirmBar.innerHTML = '';
        const selectedId = previewState[activeTab];
        if (!selectedId) {
            const info = document.createElement('div');
            info.className = 'shop-confirm-info';
            info.innerHTML =
                '<div class="shop-confirm-name">SELECT AN ITEM</div>' +
                '<div class="shop-confirm-sub">Click a card to preview it on your skier.</div>';
            confirmBar.appendChild(info);
            return;
        }

        const item = findItem(activeTab, selectedId);
        if (!item) return;
        const owned    = isOwned(activeTab, item.id);
        const equipped = isEquipped(activeTab, item.id);
        const wallet   = getWallet();
        const canAfford = wallet >= item.price;

        const info = document.createElement('div');
        info.className = 'shop-confirm-info';
        const sub = equipped
            ? 'Currently equipped.'
            : owned
                ? 'Owned. Confirm to equip.'
                : (canAfford
                    ? 'Available for purchase.'
                    : `Need ${item.price - wallet} more snowflakes.`);
        info.innerHTML =
            `<div class="shop-confirm-name">${item.name}</div>` +
            `<div class="shop-confirm-sub">${sub}</div>`;
        confirmBar.appendChild(info);

        const btn = document.createElement('div');
        btn.className = 'shop-confirm-btn';
        if (equipped) {
            btn.classList.add('disabled');
            btn.textContent = 'EQUIPPED';
        } else if (owned) {
            btn.textContent = 'EQUIP';
            btn.addEventListener('click', () => {
                playUiClick();
                equipItem(activeTab, item.id);
                previewState[activeTab] = null;
                refreshWallet();
                onAppearanceChange();
                rebuildGrid();
            });
        } else if (canAfford) {
            btn.innerHTML = 'BUY &nbsp;&#10052; ' + item.price;
            btn.addEventListener('click', () => {
                playUiClick();
                if (buyItem(activeTab, item.id, spend)) {
                    equipItem(activeTab, item.id);
                    previewState[activeTab] = null;
                    refreshWallet();
                    onAppearanceChange();
                    rebuildGrid();
                }
            });
        } else {
            btn.classList.add('disabled');
            btn.innerHTML = '&#10052; ' + item.price;
        }
        confirmBar.appendChild(btn);
    }

    function rebuildGrid() {
        grid.innerHTML = '';
        const def = tabDefs.find(t => t.id === activeTab);
        const ctx = {
            selectedId: previewState[activeTab],
            onSelect: (id) => {
                previewState[activeTab] = (previewState[activeTab] === id) ? null : id;
                refreshPreview();
                rebuildGrid();
            },
        };
        for (const item of def.items) {
            grid.appendChild(buildShopItem(def.id, item, ctx));
        }
        refreshConfirmBar();
    }

    for (const def of tabDefs) {
        const btn = document.createElement('div');
        btn.className = 'shop-tab' + (def.id === activeTab ? ' active' : '');
        btn.textContent = def.label;
        btn.addEventListener('click', () => {
            if (activeTab === def.id) return;
            playUiClick();
            activeTab = def.id;
            for (const el of tabs.children) el.classList.toggle('active', el.textContent === def.label);
            rebuildGrid();
        });
        tabs.appendChild(btn);
    }

    screen.appendChild(tabs);
    screen.appendChild(grid);
    screen.appendChild(confirmBar);
    rebuildGrid();

    screen._refresh = () => {
        previewState = { character: null, jacket: null, ski: null };
        onAppearanceChange();
        rebuildGrid();
    };
    return screen;
}

export function createMenu({
    onPlay,
    getStartCycleOffset,
    setStartCycleOffset,
    getWallet,
    spend,
    onAppearanceChange,
    applyAppearance,
    onShopStateChange,
}) {
    injectStyles();

    const overlay = document.createElement('div');
    overlay.style.cssText =
        'position:fixed; inset:0; display:flex; flex-direction:column;' +
        'align-items:flex-start; justify-content:center;' +
        'padding-left:16vw; box-sizing:border-box;' +
        'z-index:30; overflow:hidden; transition:opacity 0.8s;' +
        'pointer-events:none;';

    const walletChip = document.createElement('div');
    walletChip.style.cssText =
        'position:absolute; top:24px; right:24px;' +
        'font-family:sans-serif; font-size:15px; letter-spacing:3px;' +
        'color:#e4edf5; padding:10px 16px;' +
        'background:rgba(10,14,28,0.55);' +
        'border:1px solid rgba(168,204,232,0.35); border-radius:6px;' +
        'backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);' +
        'user-select:none; pointer-events:none;';
    overlay.appendChild(walletChip);
    function refreshWallet() {
        const n = getWallet ? getWallet() : 0;
        walletChip.innerHTML =
            '<span style="display:inline-block; color:#a8cce8;' +
            'animation:snowflakeSpin 10s linear infinite;' +
            'text-shadow:0 0 10px rgba(168,204,232,0.7); margin-right:8px;">&#10052;</span>' +
            n;
    }
    refreshWallet();

    const screens = {
        main:     null,
        settings: null,
        shop:     null,
    };

    function showScreen(name) {
        for (const key in screens) {
            if (screens[key]) screens[key].style.display = (key === name) ? 'flex' : 'none';
        }
        if (name === 'shop' && screens.shop && screens.shop._refresh) {
            screens.shop._refresh();
        }
        if (onShopStateChange) onShopStateChange(name === 'shop');
    }

    screens.main = buildMainScreen({
        onPlay:     () => onPlay(),
        onSettings: () => showScreen('settings'),
        onShop:     () => showScreen('shop'),
    });
    screens.settings = buildSettingsScreen({
        getStartCycleOffset,
        setStartCycleOffset,
        onBack: () => showScreen('main'),
    });
    screens.shop = buildShopScreen({
        onBack: () => showScreen('main'),
        getWallet,
        spend,
        onAppearanceChange: onAppearanceChange || (() => {}),
        applyAppearance:    applyAppearance    || (() => {}),
        refreshWallet,
    });

    overlay.appendChild(screens.main);
    overlay.appendChild(screens.settings);
    overlay.appendChild(screens.shop);
    showScreen('main');

    document.body.appendChild(overlay);

    return {
        show() {
            overlay.style.opacity = '1';
            overlay.style.visibility = 'visible';
            refreshWallet();
            showScreen('main');
            playMenuMusic();
        },
        hide() {
            overlay.style.opacity = '0';
            overlay.style.visibility = 'hidden';
            stopMenuMusic();
            if (onShopStateChange) onShopStateChange(false);
        },
    };
}
