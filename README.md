# Echoes of Snow

An infinite downhill skiing game built with Three.js. The player descends a procedurally generated mountain through different biomes, dodging obstacles, collecting coins, surviving avalanches, and customizing the skier through an in-game shop.

---

## Core Game Mechanics

- **Endless downhill run**: the terrain scrolls beneath the skier and is generated chunk by chunk, with difficulty and speed increasing over time.
- **Skier control**: side-to-side steering with lean animations, tuck for extra speed, and a snowplow for braking. The skier reacts to collisions with a crash animation and ragdoll-style released equipment (skis, poles, hat).
- **Biomes**: three biomes with distinct gameplay parameters:
  - *Base* — balanced obstacle placement.
  - *Forest* — higher tree density and tighter spacing.
  - *Blizzard* — reduced visibility, wind, fog, and shifted obstacle weights.
  Biome selection is weighted and the span of each biome grows with the current game speed.
- **Day / night cycle**: lighting, fog and obstacle weights change between day and night; some props (lanterns, lit windows) only glow at night.
- **Obstacles**: trees, rocks, signs, fences, ramps, and biome-specific props, spawned per chunk with minimum spacing.
- **Coins**: vertical snowflake-shaped coins with a subtle emissive glow (stronger at night). Collected coins feed the shop economy.
- **Avalanche event**: a periodic threat that closes in from behind, forcing the player to push speed and dodge cleanly.
- **Shop**: lets the player preview and equip cosmetic variants for the skier (hats, goggles, skis/planks, jacket colors). Clicking an item only previews it on the model; an explicit BUY / EQUIP button confirms the change.
- **Menus & HUD**: main menu, pause, game-over, score, coin counter, and first-person/third-person camera anchors.

---

## Technical Implementation

The project is a vanilla JavaScript application using [Three.js](https://threejs.org/) loaded via an import map — no build step, no bundler. Everything runs directly from `index.html`.

### Project structure

```
index.html        Entry point + Three.js import map
js/
  scene.js        Main loop, renderer, camera, game state, lighting, day/night
  skier.js        Skier model, animations, equipment, crash physics
  terrain.js      Procedural chunked terrain, snow surface, scrolling
  biomes.js       Biome registry and weighted selection
  obstacles.js    Obstacle definitions, spawning and per-chunk placement
  collision.js    AABB / cylinder collision tests, normals and impact response
  coins.js        Coin spawning, animation and pickup logic
  avalanche.js   Avalanche event behaviour and visuals
  snow-trails.js  Ski tracks left on the terrain
  scenery.js      Decorative props (lanterns, fences, background mountains, etc.)
  textures.js     Shared materials and texture management
  audio.js        Sound effects and music
  shop.js         Shop UI, preview/confirm flow, persistence
  menu.js         Menus, HUD, pause/game-over screens
```

### Chunked terrain

The slope is divided into a small number of fixed-size chunks held in a recycling pool ([terrain.js](js/terrain.js)). Each frame the chunks slide along `-Z` at the current `gameSpeed`. Once a chunk falls behind the camera, it is moved to the front of the queue and repopulated through `onRecycle`, which clears its previous obstacles and asks [obstacles.js](js/obstacles.js) to place new ones based on the active biome and time of day.

The skier itself does not translate in world space; only the world moves underneath it.

### Shadows

This is one of the parts of the project I'm most happy with. Trees, rocks, fences, signs, snowmen, ramps, the skier, the coins, and the equipment released after a crash all cast real-time shadows, and the framerate still holds up.

The scene uses a single shadow-casting `DirectionalLight` ([scene.js:244](js/scene.js:244)). Its shadow camera is an orthographic box of `±150` on X/Y, sized to cover only the playable area, so the mountains, sky, and distant scenery are excluded from the shadow map. The light's position is offset by the skier's position each frame so the frustum stays centered on the player throughout the run.

The visible sun and moon meshes sit roughly 520 units out so they read as distant, while the shadow-casting light stays close to keep the frustum small. The shadow map is `8192²` with `PCFSoftShadowMap`. A high resolution on a small frustum produces crisp edges without shadow acne; lower resolutions on the same frustum looked blocky, and wider frustums at the same resolution looked blurry.

Only meshes that contribute meaningfully to the silhouette have `castShadow = true`. Decorative scenery, lantern glow geometry, and fog volumes are excluded ([scenery.js:130](js/scenery.js:130)). Because obstacles are built once and reused through chunk recycling, the renderer sees the same set of casters every frame.

### Lights at night

Night lighting uses a fixed-size pool of `PointLight`s ([scene.js:292](js/scene.js:292)): 16 lights are reassigned each frame to the highest-priority lit obstacles, such as lanterns and lit windows. Creating one light per lit prop would not scale, so the pool keeps the active light count constant regardless of how many lit obstacles are on screen.

Priority is not raw Euclidean distance: forward distance (obstacles ahead of the skier) is heavily discounted while obstacles behind are penalized. At high speeds this lets slots be claimed ~50m ahead of the player, giving the light enough time to fade in smoothly before the obstacle is in close range. Without the forward bias, slots only opened up once an obstacle was already near, causing visible pop-ins as chunks recycled quickly. A small hysteresis margin on the keep limit prevents slots from churning between candidates of similar rank.

The pool lights do not cast shadows; only the sun does. Adding more shadow casters was the main source of frame drops during early tests, so the project keeps shadows restricted to the single directional light.

### Other techniques

- **Weighted biome system** ([biomes.js](js/biomes.js)): each biome stores density, spacing, and obstacle weights for day and night. Biome span scales with `gameSpeed` so longer stretches appear as the run progresses.
- **Collision response** ([collision.js](js/collision.js)): primitive colliders (boxes and cylinders) with computed contact normals, used to push the skier away from the obstacle and select the matching crash variant.
- **Released-equipment physics** ([skier.js](js/skier.js)): after a crash, individual pieces (skis, poles, hat) detach from the skier's group, switch to world space, and use simple gravity, bounce, drag, and angular velocity to settle on the slope.
- **Three.js primitives over imported models**: the skier and most props are built from grouped primitive meshes (`BoxGeometry`, `CylinderGeometry`, `ConeGeometry`) organized as parent/child groups for animation. Shared geometries and materials reduce per-mesh setup cost.
- **Shared materials** ([textures.js](js/textures.js)): a central module owns the materials so colors and textures can be swapped from the shop by reassigning material properties, without rebuilding geometry.
- **Camera anchors**: third-person and first-person rigs are attached as children of skier sub-groups and switchable at runtime.
- **No bundler**: ES modules and an import map are enough to serve the project as static files.

### Play

Available online at [tfdmendes.github.io/echoesOfSnow](https://tfdmendes.github.io/echoesOfSnow).

---

## Use of AI

**General approach:** AI was used as technical support during development — mainly to discuss architecture, organize code, and validate specific solutions. Every suggestion was reviewed, adapted and integrated manually; the gameplay design, tuning and final implementation are my own work.

Individual source files contain header notes pointing out where AI assistance was used and what was done manually.

- **ChatGPT** — focus on logic and technical explanation:
  - Discussion of the main loop structure and game states.
  - Help with collision logic, normal computation, and impact response.

- **Claude** — focus on architecture and refactoring:
  - Suggestions for organizing systems such as audio, avalanche, snow trails, and terrain.
  - Help with CSS / UI for menus, shop, and visual presentation.

---

*Tiago Mendes — 119378*
