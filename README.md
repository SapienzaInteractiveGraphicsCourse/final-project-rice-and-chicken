# Dimension Shift: Sci-Fi Arena 🚀

**Final project for the Interactive Graphics course (A.Y. 2025/2026)**
*Sapienza University of Rome*

---

## 👥 Student Information
- **Name:** Mattia
- **Surname:** Cosimi
- **Student ID (Matricola):** 2278125
- **GitHub Repository:** (https://github.com/SapienzaInteractiveGraphicsCourse/final-project-rice-and-chicken.git)
- **Live Demo (GitHub Pages):** 👉 [Play now](https://sapienzainteractivegraphicscourse.github.io/final-project-rice-and-chicken/)

---

## 🎮 Project Description
**Dimension Shift: Sci-Fi Arena** is a 3D third-person shooter with a mouse-controlled camera, built entirely with **Three.js** (WebGL) — every model, animation and shader in it is generated procedurally in code, with no imported meshes, textures or pre-made animations. The player picks a class, then has to survive an escalating series of enemy waves in a sci-fi arena and defeat a final boss.

### 🌀 Dimension Shift
The signature mechanic, toggled with **TAB**: the whole scene re-renders in a completely different visual style, and that shift has real gameplay stakes, not just a cosmetic filter.

- **Realistic** (default) — PBR materials, bloom, ACES Filmic tone mapping.
- **Toon** — flat-shaded cel materials with a pixelation + black-outline post-process pass, daytime cartoon look.

Shifting to Toon **reveals hidden power-ups** (Dimension Caches, invisible in Realistic mode) and makes enemies **take extra damage** — but it's **timed** (15s active, 25s cooldown), so it's a resource to manage, not a mode to leave on forever.

### ⚔️ Combat & Enemies
- Two player classes (**Assault**, **Sniper**), each with its own two-weapon loadout and stats.
- Five enemy types — **Grunt** (melee), **Shooter** and **Marksman** (ranged, predictive/lead-aim), **Brute** (heavy melee), and the final boss **Doomhorn** — plus a 10-wave scaling difficulty curve (9 regular waves + the boss).
- Enemies steer around obstacles, flank instead of all beelining to the same point, kite at range, aim up/down at the player in true 3D (not just flat shots), and can jump onto crates/platforms when the path calls for it.
- The player can likewise aim up/down (mouse-driven, with a light auto-aim assist), so elevated or lowered targets are actually hittable, not just ones at eye level.
- Health/armor pickups, a temporary strength buff, and the dimension-locked power-up above.

### 🗺️ Environment
A widened arena with scattered crates, four corner beacons, and dedicated glowing jump-platforms the player (and now enemies) can climb on top of — real jump physics (gravity + a fixed jump force), not just a flag. Bullets from both sides collide with the environment (crates, pillars, platform tops, the ground, the perimeter wall) instead of passing through it.

## 🕹️ Controls

| Action | Key/Input |
|---|---|
| Move | `W A S D` or Arrow keys |
| Look / Aim | Mouse |
| Jump | `Space` |
| Shoot | Left Mouse Button (hold for automatic weapons) |
| Switch weapon | `1` / `2` |
| Dimension Shift (Realistic ↔ Toon) | `TAB` |
| Pause | `Esc` |
| Skip current wave (dev/testing) | `N` |

## 🚀 How to Run the Project Locally

Since this project uses modern ES Modules (imported via CDN, see the importmap in `index.html`), it does not require complex build tools like Webpack or Vite. However, due to browser security restrictions (CORS) when loading modules from `file://`, you must serve it over a local web server rather than opening `index.html` directly:

1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Install a lightweight static file server (e.g., `http-server`, or use the *Live Server* extension in VS Code):
   ```bash
   npm install -g http-server
   ```
3. From the project's root folder, run:
   ```bash
   http-server .
   ```
4. Open the URL it prints (typically `http://127.0.0.1:8080`) in a browser.

Alternatively, just use the **Live Demo** link above — no setup needed.

## 🧱 Project Structure

The code follows a class + subclass pattern throughout, so adding a new weapon/enemy/power-up/class never touches the shared game loop:

```
index.html, style.css   UI/menu screens (main menu, HUD, pause, game over, victory)
main.js                 Game loop, input, camera, waves, collisions, HUD wiring
environment.js          Arena, ground, walls, crates, beacons, jump-platforms
dimensionShift.js       Realistic <-> Toon material/rendering swap
weapons/                Weapon (base) -> Rifle, Pistol, SniperRifle
playerClasses/          PlayerClass (base) -> Assault, Sniper
enemies/                Enemy (base) -> Grunt, Shooter, Brute, Marksman, Boss
powerups/               PowerUp (base) -> Health, Armor (Small/Large), Strength, DimensionCache
```

## 📚 Libraries Used

- **[Three.js](https://threejs.org/) r160** (core + `examples/jsm` addons: `RoundedBoxGeometry`, `EffectComposer`/`RenderPass`/`UnrealBloomPass`/`RenderPixelatedPass`/`OutputPass`/`ShaderPass` for the post-processing pipeline).

No other runtime libraries, physics engines, or asset packs are used — geometry, materials, animation and the environment are all generated in code.
