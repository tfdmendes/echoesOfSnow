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
    playBtn.addEventListener('click', handlers.onPlay);

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'menu-btn';
    settingsBtn.textContent = 'SETTINGS';
    settingsBtn.addEventListener('click', handlers.onSettings);

    const shopBtn = document.createElement('button');
    shopBtn.className = 'menu-btn';
    shopBtn.textContent = 'SHOP';
    shopBtn.addEventListener('click', handlers.onShop);

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
    back.addEventListener('click', onBack);
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

function buildShopScreen({ onBack }) {
    const screen = document.createElement('div');
    screen.style.cssText =
        'display:flex; flex-direction:column; align-items:flex-start;' +
        'width:min(420px,90vw); pointer-events:auto;';

    const back = document.createElement('div');
    back.className = 'menu-back';
    back.textContent = '< BACK';
    back.addEventListener('click', onBack);
    screen.appendChild(back);

    const title = document.createElement('div');
    title.className = 'menu-panel-title';
    title.textContent = 'SHOP';
    screen.appendChild(title);

    const placeholder = document.createElement('div');
    placeholder.style.cssText =
        'padding:32px 40px; color:#a0b8d0; font-family:sans-serif;' +
        'font-size:15px; letter-spacing:2px; text-align:center;' +
        'background:rgba(15,22,40,0.7);' +
        'border:1px dashed rgba(160,184,208,0.30); border-radius:10px;';
    placeholder.textContent = 'COMING SOON';
    screen.appendChild(placeholder);

    return screen;
}

export function createMenu({
    onPlay,
    getStartCycleOffset,
    setStartCycleOffset,
    getWallet,
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
        },
        hide() {
            overlay.style.opacity = '0';
            overlay.style.visibility = 'hidden';
        },
    };
}
