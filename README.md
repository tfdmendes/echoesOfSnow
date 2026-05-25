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

### Key techniques

- **Procedural chunked terrain**: the world is split into chunks that are recycled as the skier moves forward, keeping draw distance bounded while giving an infinite feel.
- **Weighted biome system**: each biome stores density, spacing, obstacle weights and night weights; biome span scales with `gameSpeed`.
- **Collision response**: simple primitive colliders (boxes/cylinders) with computed normals so impacts push the skier in a believable direction and trigger the crash sequence.
- **Released equipment physics**: after a crash, individual equipment pieces detach and use lightweight gravity + bounce + drag + angular velocity to settle on the slope.
- **Three.js primitives**: the skier and most props are built from grouped primitive meshes rather than imported models, organized as parent/child groups for animation.
- **Materials & textures**: a central `textures.js` module shares materials so colors/textures can be swapped from the shop without rebuilding geometry.
- **Camera anchors**: third-person and first-person rigs attached to skier groups, switchable at runtime.
- **No bundler**: ES modules and an import map keep the project simple to run — open `index.html` in a modern browser (or serve it locally).

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
