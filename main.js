import * as THREE from 'three';
import { Assault } from './playerClasses/Assault.js';
import { Sniper } from './playerClasses/Sniper.js';
import { Grunt } from './enemies/Grunt.js';
import { Shooter } from './enemies/Shooter.js';
import { Brute } from './enemies/Brute.js';
import { Marksman } from './enemies/Marksman.js';
import { Boss } from './enemies/Boss.js';
import { createEnvironment, getGroundHeightAt, getClimbableHeightAt } from './environment.js';
import { HealthPickup } from './powerups/HealthPickup.js';
import { SmallArmorPickup } from './powerups/SmallArmorPickup.js';
import { LargeArmorPickup } from './powerups/LargeArmorPickup.js';
import { StrengthPickup } from './powerups/StrengthPickup.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BrightnessContrastShader } from 'three/addons/shaders/BrightnessContrastShader.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import {
    initDimensionShift, toggleDimensionShift, syncSceneToCurrentDimension,
    updateDimensionShiftTimers, resetDimensionShift, getDimensionShiftStatus, isToonDimension
} from './dimensionShift.js';
import { DimensionCachePickup } from './powerups/DimensionCachePickup.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ============================================================
// GLOBAL VARIABLES
// These need to be accessible from multiple functions (init,
// animate, resize handler, etc.) so they live outside of any
// single function.
// ============================================================

let scene, camera, renderer;   // The 3 core Three.js pieces:
                                //   scene    = the 3D world (holds all objects)
                                //   camera   = the "eye" that looks at the scene
                                //   renderer = draws the scene+camera onto the <canvas>

// Post-processing pipeline (see init()'s "Post-processing" section and
// animate()) -- bloomPass is kept as its own reference so onWindowResize()
// can keep its internal render targets sized to match the canvas.
let composer, bloomPass;

// Fill light that follows the camera every frame (see updateCamera())
// instead of sitting at a fixed world position, so whichever side of
// the player/enemies the camera is currently looking at always gets a
// bit of light, regardless of where in the arena they are relative to
// the fixed DirectionalLight.
let cameraFillLight;

let player;                    // Reference to the object we'll move/interact with

// Collision circles for the environment's beacons/crates (see
// environment.js's createEnvironment()), filled in once during init().
// Checked every frame in updateGame() via collidesWithObstacle() so the
// player can't just walk through them. Kept as flat {x, z, radius}
// objects rather than real THREE meshes/raycasting -- same lightweight
// distance-check style already used for bullet/enemy collisions.
let environmentObstacles = [];
const playerCollisionRadius = 0.4; // rough half-width of the player's own model

// Tracks which movement keys are currently held down.
// Instead of reacting once per keypress, we check this every frame,
// so movement is smooth and multiple keys can be held at once.
const keys = { w: false, a: false, s: false, d: false };

// True while the left mouse button is held down -> continuous fire, but
// only for automatic weapons (see Weapon.js's `automatic` flag). Semi-
// auto weapons also check shotFiredThisPress
// below to cap themselves at one shot per press.
let isMouseDown = false;

// True once a semi-auto weapon has fired during the CURRENT mouse press;
// reset back to false on mouseup. Ignored entirely for automatic weapons
// (see the shooting block in updateGame()) -- only exists so a held-down
// semi-auto weapon doesn't just fire again the instant its cooldown ends.
let shotFiredThisPress = false;

// False while the main menu is showing: the player model still renders
// (slowly turning, for the class-preview) but updateGame()/updateBullets()
// don't run, so movement, shooting and pointer-lock stay inactive until
// PLAY is pressed (see initMenu() and animate()).
let gameStarted = false;

// True while the pause menu is showing mid-run (see the pointerlockchange
// listener in init() and the resume-button handler in initMenu()).
// Separate from gameStarted: gameStarted stays true the whole time so a
// paused run still counts as "in progress" (e.g. [C] class-switching
// stays locked out, see handleKeyboard()) -- only animate()'s per-frame
// updates actually check gamePaused (see animate() below).
let gamePaused = false;

// True from the moment the boss dies until the auto-reload back to the
// main menu (see triggerVictory()) -- freezes the game loop in place
// (animate()) so the player stays standing right where they won,
// instead of the game cutting to a separate screen.
let victoryActive = false;
const VICTORY_DISPLAY_TIME = 4.5; // seconds the "VICTORY" banner stays up before reloading back to the menu

// Every bullet currently flying through the arena. Each entry is a
// { mesh, velocity, age } object. We need our own array because
// Three.js doesn't track "your game objects" for you -- the scene
// just holds meshes, it has no concept of "bullet" or "enemy".
let bullets = [];

let shotCooldown = 0;          // counts down to 0, then the player can fire again

// --- Aim indicator ---
// A plain 2D HUD crosshair (#crosshair in index.html), always dead
// center on screen -- see updateAimIndicator() below, which just toggles
// its "hit" CSS class depending on whether an enemy is currently under
// it. A 3D world-space beam/marker used to do this job instead, but a
// screen-space crosshair is simpler AND more honest: it's the camera's
// own screen center by construction, so it can never visually disagree
// with "where you're looking" the way a beam drawn from the (slightly
// off-camera) muzzle could at close range.
const crosshairEl = document.getElementById('crosshair');

// Glowing rings around the player's feet, shown only while the
// strength buff (see powerups/StrengthPickup.js) is active. Built once
// in init(), repositioned/animated every frame in updateGame() via
// updateStrengthAura().
let strengthAura;

// --- Enemies ---
// Every enemy currently alive in the arena (see enemies/Enemy.js and its
// subclasses). Same idea as `bullets` below -- Three.js doesn't track
// "this is an enemy" for us, so we keep our own array of Enemy instances
// (each one already wraps its own THREE.Group -- see Enemy.mesh -- plus
// its own stats and AI).
let enemies = [];

// Bullets fired BY enemies, kept in a SEPARATE array from the player's
// own `bullets` below -- enemy fire only ever collides with the player,
// player fire only ever collides with enemies (see updateEnemies() /
// updateEnemyBullets()), so there's no risk of enemies damaging each
// other by a stray bullet check.
let enemyBullets = [];

let enemySpawnTimer = 0;
const enemySpawnInterval = 2.2;   // seconds between spawns -- was 4, arena was reading as empty/slow between fights
const maxConcurrentEnemies = 14;  // hard cap on how many can be alive AT ONCE, regardless of wave size -- was 8, raised to actually let that faster spawn rate fill the arena instead of just queueing behind the cap
const arenaSpawnRadius = 29;    // just inside the movement boundary (limit = 32 in updateGame()) -- widened along with the arena, see environment.js's BOUNDARY
const bulletWallLimit = 33.5;   // matches environment.js's WALL_DISTANCE -- stops a long-range shot (e.g. the sniper) from sailing straight through the perimeter wall (see updateBullets()/updateEnemyBullets())

// --- Waves ---
// 9 regular waves of increasing size/difficulty, then a single boss
// (DOOMHORN, see enemies/Boss.js) on wave 10 -- see startWave().
// Enemy count per regular wave, tuned by hand rather than a formula so
// the pacing is easy to eyeball/adjust; index 0 = wave 1 ... index 8 = wave 9.
// Brute/Marksman
// (see spawnEnemy() below) now take a slice of every wave's pool too,
// and the whole point was to add them WITHOUT reducing how often
// Grunt/Shooter actually show up, so the pool needs to be bigger to
// have room for both.
const waveSizes = [8, 11, 14, 17, 20, 22, 25, 28, 31];
const totalWaves = waveSizes.length + 1; // + the boss wave
let currentWave = 0;             // set for real by startWave(1) on PLAY
let waveSpawnQueue = 0;          // enemies still waiting to be spawned this wave
let waveEnemiesRemaining = 0;    // enemies not yet KILLED this wave (spawned or not) -- hits 0 => wave cleared
let waveTransitioning = false;   // true during the pause between clearing a wave and starting the next
let waveTransitionTimer = 0;
let isBossWave = false;
let boss = null;                 // the current Boss instance, only set during wave 10

// --- Player health ---
const playerMaxHealth = 100;
let playerHealth = playerMaxHealth;

// --- Player armor ---
// A second, separate pool that absorbs incoming damage before health
// does (see damagePlayer()) -- starts empty, only filled up by armor
// power-ups (see powerups/ArmorPickup.js), unlike health which starts full.
const playerMaxArmor = 100;
let playerArmor = 0;

// --- Strength buff ---
// Temporary damage + move-speed boost from StrengthPickup (see
// powerups/StrengthPickup.js) -- counts down every frame in updateGame()
// once active; shootBullet() and updateGame()'s own speed calculation
// both just check "is this timer > 0" rather than needing their own
// separate on/off flag.
let strengthBuffTimer = 0;
const strengthBuffDuration = 15;   // seconds
const strengthDamageMultiplier = 1.6;
const strengthSpeedMultiplier = 1.3;

// Dimension Shift's "weak point" hook (see updateEnemies() below): every
// enemy takes bonus damage while the player is in Toon dimension, giving
// the timed shift window (see dimensionShift.js) a real combat reason to
// use, on top of revealing DimensionCachePickup.
const TOON_DAMAGE_MULTIPLIER = 1.5;

// --- Power-ups ---
// Every power-up currently sitting in the arena, waiting to be picked
// up (see powerups/PowerUp.js and its subclasses). Same "our own array,
// Three.js doesn't know what a power-up is" idea as bullets/enemies.
let powerUps = [];
let powerUpSpawnTimer = 0;
const powerUpSpawnInterval = 6;   // seconds between spawn ATTEMPTS -- not every attempt succeeds, see maxPowerUpsOnField
const maxPowerUpsOnField = 8;     // hard cap so the arena never gets cluttered with pickups
// Weighted random pick (see spawnPowerUp()) -- health and small armor
// are common, the full armor refill and the strength buff are rarer,
// so different power-up TYPES effectively spawn at different rates
// even though they all share one spawn timer.
const powerUpTypes = [
    { Type: HealthPickup, weight: 4 },
    { Type: SmallArmorPickup, weight: 4 },
    { Type: LargeArmorPickup, weight: 1.5 },
    { Type: StrengthPickup, weight: 2 },
    // Spawns like any other type, but sits invisible/uncollectable until
    // the player shifts to Toon dimension -- see requiresToon in
    // powerups/PowerUp.js and the visibility gate in updatePowerUps().
    { Type: DimensionCachePickup, weight: 1.5 }
];

// --- Player classes ---
// Every loadout the player can play as (see playerClasses/PlayerClass.js
// and its subclasses). Each one owns its own weapons array and its own
// body colors -- main.js just asks the CURRENT class for materials and
// for its weapons, it doesn't know or care which concrete class
// (Assault, Sniper, ...) that is.
const playerClasses = [new Assault(), new Sniper()];
let currentClassIndex = 0;
let currentWeaponIndex = 0; // index into playerClasses[currentClassIndex].weapons

// --- Jump physics ---
// Simple vertical motion: velocityY changes over time due to gravity,
// and player.position.y changes over time due to velocityY.
let velocityY = 0;
let isGrounded = true;         // true while standing on the ground (y = 0)
const gravity = -25;           // units per second^2 (negative = pulls down)
const jumpForce = 10;          // initial upward velocity when jumping

// --- Mouse-controlled camera ---
// orbit-camera design: the camera sits at
// (cameraYaw, cameraPitch, cameraDistance) in spherical coordinates
// around a pivot point near the player, and always looks back at that
// SAME pivot -- see updateCamera(). This is what actually gives a good
// sense of scale (character AND environment both comfortably in view,
// from a bit above and behind)

let cameraYaw = 0;
let cameraPitch = Math.asin(0.6); // ~0.6435 rad -- same comfortable resting angle the original camera used
const cameraDistance = 7; 
// Eye/head height (see createPlayer(): the head sits at about 1.67) --
// used for BOTH the orbit's center and its look-at target (see above).
const cameraPivotHeight = 1.6;

const cameraShoulderRight = 1.2;
const cameraShoulderDown = 0.5;
const mouseSensitivity = 0.0025;
// True right after Pointer Lock is (re)acquired, until the next mousemove
// event consumes and clears it -- see the pointerlockchange/mousemove
// listeners in init(). Works around a browser quirk where that first
// event's movementX/movementY isn't a real mouse gesture.
let ignoreNextMouseDelta = false;
const minPitch = -0.3; // radians (~-17°) -- lets you tilt the view (and shots) somewhat upward, e.g. at an enemy standing on a jump-platform
const maxPitch = 0.85; // radians (~49°) -- same generous downward range the original camera always had

// --- Menu character-preview rotation ---
// True while the left mouse button is held down over the menu (see the
// mousedown/mouseup listeners in init()). Click-and-drag: the character only spins while menuDragging is true, by
// however far the mouse actually moved that frame (see the mousemove
// listener's "not locked" branch below) -- release the button and it
// just stays put wherever you left it.
let menuDragging = false;

// THREE.Clock lets us measure how much real time passed between frames.
// This is called "Delta Time" and is used below to make movement
// speed independent of frame rate (so the game runs at the same
// speed on a 60Hz and a 144Hz screen).
const clock = new THREE.Clock();
const baseSpeed = 12; // units per second the player moves

// Accumulates time only while the player is actually moving.
// Used as input to Math.sin() to drive the walk-cycle animation below.
let walkTime = 0;

// Player velocity, recomputed every frame from how far position.js
// actually moved since last frame (see updateEnemies() below) -- fed to
// ranged enemies (Shooter/Boss) via attackContext.playerVelocity so
// they can LEAD a moving target instead of aiming at where the player
// used to be (see Enemy.leadTarget()).
let previousPlayerPosition = new THREE.Vector3();
let playerVelocity = new THREE.Vector3();


// ============================================================
// PLAYER MODEL
// Instead of a single mesh, the player is built as a small
// hierarchy (a "scene graph" within the scene graph):
//
//   playerGroup                <- this is what we store in `player`,
//     |                           it's what moves/rotates as a whole
//     +-- torso (main body)
//           |
//           +-- head       (child of torso)
//           +-- leftArm    (child of torso)
//           +-- rightArm   (child of torso)
//
// Head and arms are added as children of the TORSO, not of the
// group directly. That means their position values (e.g. head's
// y = 0.95) are RELATIVE to the torso's own origin, not to the
// world. When the torso (or the whole group) moves or rotates,
// everything attached to it follows automatically — we don't have
// to manually update the head/arms position every frame.
// ============================================================
function createPlayer(playerClass) {
    const playerGroup = new THREE.Group(); // an empty container, just holds child objects

    // Body colors/materials come from the active PlayerClass (see
    // playerClasses/PlayerClass.js) -- this is the "texture" that
    // varies between Assault, Sniper, etc. The geometry/hierarchy
    // below stays identical across classes; only these materials
    // (and the weapon attached further down) change.
    const materials = playerClass.createBodyMaterials();

    // --- Torso ---
    // Height stays such that the bottom still sits at y=0.6, so the
    // legs below don't need to change length.
    // RoundedBoxGeometry instead of a flat BoxGeometry 
    const torsoGeo = new RoundedBoxGeometry(0.7, 0.9, 0.45, 2, 0.06); // width, height, depth, segments, radius
    const torso = new THREE.Mesh(torsoGeo, materials.torso);
    torso.position.y = 1.05; // half-height (0.45) above the legs' top (0.6) -> 1.05
    torso.castShadow = true;
    playerGroup.add(torso);

    // --- Head ---
    const headGeo = new RoundedBoxGeometry(0.46, 0.42, 0.42, 2, 0.05);
    const head = new THREE.Mesh(headGeo, materials.head);
    head.position.y = 0.62; // torso half-height (0.45) + half the head's height, small overlap = no visible gap/neck seam
    head.castShadow = true;
    torso.add(head); // head is a CHILD of torso, not of playerGroup

    // --- Visor ---
    // Thin glowing strip across the upper-front of the head -- Child of
    // head, so it stays glued to the face no matter how the head/torso
    // rotates.
    const visorGeo = new THREE.BoxGeometry(0.34, 0.09, 0.06);
    const visor = new THREE.Mesh(visorGeo, materials.visor);
    visor.position.set(0, 0.03, 0.21 + 0.02); // just off the head's front face (half-depth 0.21)
    head.add(visor);

    // --- Backpack ---
    // Small sci-fi detail on the back. Child of the torso, so it
    // automatically follows the torso's rotation (stays "on the back"
    // no matter which way the player is facing).
    // Positioned on the -Z side because that's the model's local "back"
    // (rotation.y = 0 means facing +Z, see updateGame's atan2 logic).
    const backpackGeo = new RoundedBoxGeometry(0.45, 0.5, 0.2, 2, 0.04);
    const backpack = new THREE.Mesh(backpackGeo, materials.backpack);
    backpack.position.set(0, 0.05, -(0.225 + 0.1)); // just behind the torso's back face, no z-fighting overlap
    backpack.castShadow = true;
    torso.add(backpack);

    // --- Chest-core accent ---
    // Small glow panel on the front, same emissive "tech" material as the
    // visor -- gives the eye a focal point and reinforces the sci-fi read
    // instead of a plain armor panel.
    const chestCoreGeo = new THREE.BoxGeometry(0.28, 0.32, 0.05);
    const chestCore = new THREE.Mesh(chestCoreGeo, materials.visor);
    chestCore.position.set(0, 0.05, 0.225 + 0.03); // just off the torso's front face (half-depth 0.225)
    torso.add(chestCore);

    // --- Arms ---
    const armGeo = new RoundedBoxGeometry(0.18, 0.7, 0.18, 2, 0.035);

    const leftArm = new THREE.Mesh(armGeo, materials.arm);
    leftArm.position.set(-0.44, 0.15, 0); // relative to torso: left side, near shoulder height
    leftArm.castShadow = true;
    torso.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, materials.arm);
    rightArm.position.set(0.44, 0.15, 0); // mirrored on the right side
    rightArm.castShadow = true;
    torso.add(rightArm);

    // --- Pauldrons (shoulder armor) ---
    // Caps the top of each arm for a more "armored" silhouette. Children
    // of the TORSO (not the arm): a rigid shoulder plate that stays put
    // rather than swinging through the walk-cycle arm rotation reads more
    // like actual shoulder armor than a sleeve patch would.
    const pauldronGeo = new RoundedBoxGeometry(0.28, 0.16, 0.28, 2, 0.04);
    const leftPauldron = new THREE.Mesh(pauldronGeo, materials.trim);
    leftPauldron.position.set(-0.44, 0.47, 0); // arm top is around local y=0.5 (0.15 origin + 0.35 half-height)
    leftPauldron.castShadow = true;
    torso.add(leftPauldron);

    const rightPauldron = new THREE.Mesh(pauldronGeo, materials.trim);
    rightPauldron.position.set(0.44, 0.47, 0);
    rightPauldron.castShadow = true;
    torso.add(rightPauldron);

    // --- Gun ---
    // Built by the class's starting weapon (index 0 of playerClass.weapons)
    // as its own small Group of parts, then attached as a child of the
    // RIGHT ARM (not the torso), so it's carried by the hand: it follows
    // both the torso's rotation AND the arm's own walk-cycle swing.
    // Position is relative to the arm's local origin. The arm is a
    // vertical box (height 0.7) hanging down, so "the hand" is roughly
    // its bottom end -> y = -0.35 (half the arm's height).
    const gun = playerClass.weapons[currentWeaponIndex].createModel();
    gun.position.set(0, -0.35, 0.25); // at the hand, extending forward (+Z = local "front")
    rightArm.add(gun);

    // --- Legs ---
    // Added as children of playerGroup (not torso): the torso still
    // sits with its bottom at y=0.6, so the legs fill the gap from
    // the ground (y=0) up to that point -> height 0.6, centered at y=0.3.
    const legGeo = new RoundedBoxGeometry(0.25, 0.6, 0.25, 2, 0.04);

    const leftLeg = new THREE.Mesh(legGeo, materials.leg);
    leftLeg.position.set(-0.16, 0.3, 0);
    leftLeg.castShadow = true;
    playerGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, materials.leg);
    rightLeg.position.set(0.16, 0.3, 0);
    rightLeg.castShadow = true;
    playerGroup.add(rightLeg);

    // --- Boot guards ---
    // Small trim accent at the bottom of each leg. Children of the LEG
    // (not playerGroup), so they inherit the walk-cycle swing correctly
    // and read as part of the boot rather than floating separately.
    const bootGeo = new RoundedBoxGeometry(0.27, 0.14, 0.29, 2, 0.035);
    const leftBoot = new THREE.Mesh(bootGeo, materials.trim);
    leftBoot.position.set(0, -0.3 + 0.07, 0.02); // leg bottom is at local y=-0.3 (half-height); slight forward toe offset
    leftBoot.castShadow = true;
    leftLeg.add(leftBoot);

    const rightBoot = new THREE.Mesh(bootGeo, materials.trim);
    rightBoot.position.set(0, -0.3 + 0.07, 0.02);
    rightBoot.castShadow = true;
    rightLeg.add(rightBoot);

    // Save direct references to the animatable parts on the group itself
    // (in userData, a free-form object Three.js reserves for exactly this).
    playerGroup.userData.leftArm = leftArm;
    playerGroup.userData.rightArm = rightArm;
    playerGroup.userData.torso = torso; // needed so we can counter-rotate it to always face the aim direction
    playerGroup.userData.leftLeg = leftLeg;
    playerGroup.userData.rightLeg = rightLeg;
    playerGroup.userData.head = head;
    playerGroup.userData.gun = gun;
    playerGroup.userData.muzzle = gun.userData.muzzle; // barrel tip -- kept as a marker of where the gun visually is, though bullets themselves now spawn from getBulletSpawnPoint() instead (see shootBullet()), not from here
    playerGroup.userData.playerClass = playerClass; // so switchWeapon() knows this class's loadout

    return playerGroup;
}

// ============================================================
// WEAPON SWITCHING
// Swaps the gun model carried by the right arm for weapon `index`
// in the CURRENT player class's loadout. Because every weapon
// exposes the same interface (createModel(), userData.muzzle,
// fireRate, shoot()), this function doesn't need to know which
// concrete weapon it's switching to or from.
// ============================================================
function switchWeapon(index) {
    const classWeapons = player.userData.playerClass.weapons;
    if (index === currentWeaponIndex || index < 0 || index >= classWeapons.length) return;
    currentWeaponIndex = index;

    const rightArm = player.userData.rightArm;
    rightArm.remove(player.userData.gun);

    const gun = classWeapons[currentWeaponIndex].createModel();
    gun.position.set(0, -0.35, 0.25); // same anchor point used in createPlayer()
    rightArm.add(gun);

    player.userData.gun = gun;
    player.userData.muzzle = gun.userData.muzzle;

    shotCooldown = classWeapons[currentWeaponIndex].fireRate; // no instant shot right after switching
    updateWeaponSelectorUI();
}

// ============================================================
// PLAYER CLASS SWITCHING
// Rebuilds the whole player model from scratch using a different
// PlayerClass (different body colors AND a different weapon
// loadout), then restores position/facing so switching mid-arena
// doesn't teleport or disorient the player.
// ============================================================
function switchPlayerClass(index) {
    if (index === currentClassIndex || index < 0 || index >= playerClasses.length) return;
    currentClassIndex = index;
    currentWeaponIndex = 0; // start back on the new class's primary weapon

    const { x, y, z } = player.position;
    const facing = player.rotation.y;

    scene.remove(player);
    player = createPlayer(playerClasses[currentClassIndex]);
    player.position.set(x, y, z);
    player.rotation.y = facing;
    scene.add(player);

    shotCooldown = playerClasses[currentClassIndex].weapons[currentWeaponIndex].fireRate;
    refreshClassSelectorUI(); // keep the menu's class box in sync, whether triggered by [C] or the menu arrows
    updateWeaponSelectorUI(); // the new class brings its own weapon loadout, so refresh the HUD too
}

// ============================================================
// MAIN MENU
// The menu overlay (index.html #main-menu) sits on top of the
// three.js canvas, which keeps rendering underneath it -- the player
// model is visible through the transparent parts of the overlay, and
// can be click-and-dragged to spin around so its class-specific colors
// act as a live preview from any angle (see the mousemove listener in
// init()). The class arrows just call the same switchPlayerClass()
// gameplay uses; PLAY flips `gameStarted` so animate() switches from
// the preview camera to real gameplay.
// ============================================================
const menuEl = document.getElementById('main-menu');
const classNameEl = document.getElementById('class-name');
const classSwatchEl = document.getElementById('class-swatch');
const uiOverlayEl = document.getElementById('ui-overlay');
const hudBottomRightEl = document.getElementById('hud-bottom-right');
const healthFillEl = document.getElementById('health-bar-fill');
const healthValueEl = document.getElementById('health-value');
const armorFillEl = document.getElementById('armor-bar-fill');
const armorValueEl = document.getElementById('armor-value');
const strengthBuffLineEl = document.getElementById('strength-buff-line');
const strengthBuffTimerEl = document.getElementById('strength-buff-timer');
const gameOverEl = document.getElementById('game-over');
const gameOverWaveEl = document.getElementById('game-over-wave');
const pauseMenuEl = document.getElementById('pause-menu');
const victoryBannerEl = document.getElementById('victory-banner');
const waveValueEl = document.getElementById('wave-value');
const waveTotalEl = document.getElementById('wave-total');
waveTotalEl.textContent = totalWaves; // static -- set once, matches waveSizes.length + the boss wave
const waveBannerEl = document.getElementById('wave-banner');
const dimensionValueEl = document.getElementById('dimension-value');
const dimensionStatusEl = document.getElementById('dimension-status');
const dimensionFlashEl = document.getElementById('dimension-flash');
const bossBarContainerEl = document.getElementById('boss-bar-container');
const bossNameEl = document.getElementById('boss-name');
const bossHealthFillEl = document.getElementById('boss-health-fill');
const weaponBoxEls = [document.getElementById('weapon-box-0'), document.getElementById('weapon-box-1')];
const weaponIconEls = [document.getElementById('weapon-icon-0'), document.getElementById('weapon-icon-1')];
const weaponNameEls = [document.getElementById('weapon-name-0'), document.getElementById('weapon-name-1')];

// Fills in the bottom-right weapon-select HUD (icon, name, and which of
// the two boxes is highlighted as "equipped") from the CURRENT player
// class's weapons -- called whenever that could have changed: switching
// weapon, switching class, and once on PLAY. Reads weapon.name/icon
// (see weapons/Weapon.js and its subclasses) rather than hardcoding
// per-weapon-type logic here.
function updateWeaponSelectorUI() {
    const classWeapons = player.userData.playerClass.weapons;
    for (let i = 0; i < weaponBoxEls.length; i++) {
        const weapon = classWeapons[i];
        weaponIconEls[i].innerHTML = weapon.icon;
        weaponNameEls[i].textContent = weapon.name;
        weaponBoxEls[i].classList.toggle('active', i === currentWeaponIndex);
    }
}

function refreshClassSelectorUI() {
    const cls = playerClasses[currentClassIndex];
    classNameEl.textContent = cls.name.toUpperCase();
    const hex = '#' + cls.bodyColor.toString(16).padStart(6, '0');
    classSwatchEl.style.backgroundColor = hex;
    classSwatchEl.style.boxShadow = `0 0 12px ${hex}`;
}

function initMenu() {
    document.getElementById('class-prev').addEventListener('click', () => {
        switchPlayerClass((currentClassIndex - 1 + playerClasses.length) % playerClasses.length);
    });
    document.getElementById('class-next').addEventListener('click', () => {
        switchPlayerClass((currentClassIndex + 1) % playerClasses.length);
    });

    document.getElementById('play-button').addEventListener('click', () => {
        // Defensive resets (harmless on a fresh page load, matter if this
        // ever runs again without a full reload): a clean run always
        // starts at full health with no leftover enemies/bullets/timers.
        playerHealth = playerMaxHealth;
        enemies.forEach((e) => scene.remove(e.mesh));
        enemies = [];
        enemyBullets.forEach((b) => scene.remove(b.mesh));
        enemyBullets = [];
        enemySpawnTimer = 0;
        boss = null;
        waveTransitioning = false;
        bossBarContainerEl.classList.add('hidden');
        waveBannerEl.classList.remove('visible');
        playerArmor = 0;
        strengthBuffTimer = 0;
        strengthBuffLineEl.classList.add('hidden');
        powerUps.forEach((p) => scene.remove(p.group));
        powerUps = [];
        powerUpSpawnTimer = 3; // small head start before the first pickup can appear
        resetDimensionShift(); // a fresh run always starts in realistic mode, off cooldown
        dimensionValueEl.textContent = 'REALISTIC';
        previousPlayerPosition.copy(player.position);
        playerVelocity.set(0, 0, 0);
        updateHealthUI();
        updateArmorUI();
        updateWeaponSelectorUI();
        startWave(1);
        gamePaused = false;
        victoryActive = false;
        pauseMenuEl.classList.add('hidden');
        gameOverEl.classList.add('hidden');
        victoryBannerEl.classList.remove('visible');
        crosshairEl.classList.add('visible');
        strengthAura.visible = false; // only turned on again once a strength pickup is actually collected

        gameStarted = true;
        menuEl.classList.add('hidden');
        uiOverlayEl.style.display = 'block';
        hudBottomRightEl.style.display = 'flex';
        renderer.domElement.requestPointerLock(); // the click is a user gesture, so this is allowed here
    });

    // Game over's only way back in -- see triggerGameOver(). Reloading is
    // simpler and far less error-prone than hand-resetting every piece of
    // mutable state (player position/rotation, cooldowns, arrays...).
    document.getElementById('restart-button').addEventListener('click', () => {
        location.reload();
    });

    // Only way back in from the pause menu (see the pointerlockchange
    // listener in init()) -- re-requesting the lock from this click is
    // fine since a button click is itself a user gesture, same as PLAY.
    document.getElementById('resume-button').addEventListener('click', () => {
        gamePaused = false;
        pauseMenuEl.classList.add('hidden');
        renderer.domElement.requestPointerLock();
    });

    // Leaves the run entirely and returns to the initial screen. Same
    // reasoning as restart-button: reloading lands back on #main-menu
    // with every piece of state (health, enemies, cooldowns, position...)
    // fresh, which is simpler and far less error-prone than resetting it
    // all by hand.
    document.getElementById('quit-button').addEventListener('click', () => {
        location.reload();
    });

    refreshClassSelectorUI();
}

// Runs every frame while the menu is showing: frames the player with a
// fixed "character select" camera, instead of the mouse-driven orbit cam
// used once gameplay starts, and gives it a slow idle spin (paused while
// dragging -- see below -- since a click-drag should fully own the
// rotation while it's happening, see the mousemove listener in init()).
function updateMenuPreview(deltaTime) {
    // Only auto-spins when nobody's actively dragging, and resumes from
    // wherever the drag left the character (no snap back to a fixed
    // angle) --
    if (!menuDragging) {
        player.rotation.y += deltaTime * 0.35; // ~17°/s, full turn every ~21s 
    }

    camera.position.set(0, 1.3, 4.5);
    camera.lookAt(0, 1.0, 0);
    cameraFillLight.position.copy(camera.position); // keeps the menu preview's character consistently lit too, same reasoning as updateCamera()
}


// ============================================================
// INIT — runs once at the start. Sets up everything needed
// before the game loop can begin.
// ============================================================
function init() {

    // --- Scene setup ---
    // No flat background color -- environment.js's createEnvironment()
    // adds a gradient skybox + starfield mesh that fills this role instead
    // (see createSkybox() there).
    scene = new THREE.Scene();

    // --- Camera setup ---
    // PerspectiveCamera(fov, aspectRatio, near, far)
    // fov = field of view in degrees, near/far = clipping distances
    // (anything closer than "near" or farther than "far" won't be drawn)
    camera = new THREE.PerspectiveCamera(63, window.innerWidth / window.innerHeight, 0.1, 1000);

    // --- Renderer setup ---
    // This creates the actual <canvas> element and draws to it.
    renderer = new THREE.WebGLRenderer({ antialias: true }); // antialias = smoother edges
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // turns on shadow rendering globally
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // softer shadow edges than the default hard-edged PCF
    // ACES Filmic: highlights roll off smoothly instead of clipping to
    // solid white. 
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement); // add the <canvas> to the page

    // --- Lights ---
    // HemisphereLight: like AmbientLight, but blends a "sky" color and a
    // "ground" color based on each surface's normal 
    const hemiLight = new THREE.HemisphereLight(0x44598a, 0x3a3228, 0.6);
    scene.add(hemiLight);

    // DirectionalLight: parallel rays, like sunlight (here, a cold
    // moonlight-ish blue tint to match the sci-fi/night arena mood). Has
    // a direction (from its position toward the origin/target) and CAN
    // cast shadows.
    const dirLight = new THREE.DirectionalLight(0xccddff, 1.0);
    dirLight.position.set(25, 45, 15);
    dirLight.castShadow = true;
    // Shadow map resolution: higher = sharper shadows but more GPU cost
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    // The default shadow-camera frustum is only +/-5 units across --
    // fine for a tiny demo scene, but this arena is ~54 units wide, so
    // almost everything would fall outside it and simply not cast a
    // shadow at all. Widened to cover the whole playable area (see
    // WALL_DISTANCE in environment.js) plus some margin.
    dirLight.shadow.camera.left = -42;
    dirLight.shadow.camera.right = 42;
    dirLight.shadow.camera.top = 42;
    dirLight.shadow.camera.bottom = -42;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.bias = -0.0015; // the much larger frustum above needs a bit of bias to avoid shadow-acne artifacts
    scene.add(dirLight);

    // Cool, low-intensity point light from the opposite side of the main
    // directional light 
    const fillLight = new THREE.PointLight(0x0088ff, 0.4, 60);
    fillLight.position.set(-18, 10, -18);
    scene.add(fillLight);

    // A second fill light that isn't fixed in place -- see updateCamera(),
    // which keeps it glued to the camera every frame. Neutral white and
    // fairly soft/short-range: it's there to keep the side of the
    // character/enemies the player is actually LOOKING AT from going
    // completely dark, not to relight the whole arena.
    cameraFillLight = new THREE.PointLight(0xffffff, 0.6, 14);
    scene.add(cameraFillLight);

    // --- Post-processing ---
    // Runs the rendered frame through extra passes instead of drawing
    // straight to the screen (see animate()).
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Dimension Shift's "toon" look: pixelated render + thick black ink
    // outlines (from normal/depth discontinuities), built into this one
    // pass -- exactly the "comic book" read Dimension Shift needs, with
    // no custom shader of our own. Starts disabled: realistic mode (the
    // plain renderPass above) is the default -- see toggleDimensionShift()
    // in dimensionShift.js, which flips `.enabled` on both in lockstep.
    const pixelatedPass = new RenderPixelatedPass(5, scene, camera, {
        normalEdgeStrength: 0.6,
        depthEdgeStrength: 0.6
    });
    pixelatedPass.enabled = false;
    composer.addPass(pixelatedPass);

    // UnrealBloomPass finds pixels brighter than `threshold` and blurs a
    // glowing halo around them -- since nearly every sci-fi accent here
    // (visors, chest cores, weapon glow, power-ups, boss eyes, beacons)
    // is already an emissive material, this turns them from "flat bright
    // color" into an actual glow. Threshold is kept high and strength
    // moderate on purpose 
    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.2, // strength
        0.4,  // radius
        0.8   // threshold 
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass()); // converts the linear result back to display color space/tone mapping after bloom

    // Small brightness/contrast lift, applied AFTER OutputPass so it's
    // grading the final display-space image (like a light photo edit)
    // rather than the raw linear render. Contrast is kept lower than
    // earlier attempts -- ACES already does its own filmic contrast
    // shaping, so this is just a small extra push, not compensation.
    const contrastPass = new ShaderPass(BrightnessContrastShader);
    contrastPass.uniforms.brightness.value = 0.04;
    contrastPass.uniforms.contrast.value = 0.08;
    composer.addPass(contrastPass);

    // --- Environment ---
    // Ground, perimeter walls, corner beacons, crate props, and fog --
    // everything that turns the arena from a bare square into an actual
    // place (see environment.js). The obstacles it hands back are the
    // beacons'/crates' collision circles, checked against every frame in
    // updateGame() (see collidesWithObstacle() below) so the player can't
    // just walk through them.
    const environment = createEnvironment(scene);
    environmentObstacles = environment.obstacles;

    // --- Player ---
    player = createPlayer(playerClasses[currentClassIndex]);
    scene.add(player);

    createStrengthAura();

    // Hands Dimension Shift every scene-level reference it needs (see
    // dimensionShift.js) that ISN'T just a mesh material -- lights, sky,
    // stars, fog, which render pass is active. Everything else (every
    // object's own material) is derived automatically per-mesh instead.
    initDimensionShift({
        renderer, bloomPass, renderPass, pixelatedPass,
        hemiLight, dirLight,
        sky: environment.sky, stars: environment.stars,
        fog: scene.fog
    });

    updateCamera(); // position the camera correctly before the first frame renders

    // --- Event Listeners ---
    // Keyboard input: update the `keys` object whenever a key goes down/up
    window.addEventListener('keydown', (e) => handleKeyboard(e, true));
    window.addEventListener('keyup', (e) => handleKeyboard(e, false));
    // Mouse input: left button held down = firing
    window.addEventListener('mousedown', (e) => { if (e.button === 0) { isMouseDown = true; menuDragging = true; } });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) { isMouseDown = false; menuDragging = false; shotFiredThisPress = false; } });

    // Pointer Lock: clicking the canvas hides the cursor and switches
    // mouse movement to "relative" mode (movementX/movementY deltas
    // instead of absolute screen position). Gated on gameStarted: the
    // menu sits on top of this same canvas, and most of its background
    // isn't covered by a button (see #main-menu's pointer-events: none
    // in style.css), so without this check a stray click on the menu
    // background would lock the pointer and hide the cursor before the
    // player even presses PLAY. Once gameplay is running this still lets
    // a click re-acquire the lock if it was lost (e.g. after Alt-Tab).
    renderer.domElement.addEventListener('click', () => {
        if (!gameStarted) return;
        renderer.domElement.requestPointerLock();
    });

    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== renderer.domElement) {
            // Pointer isn't locked -- we're not in gameplay yet, so this is
            // the mouse moving over the main menu. Only spin the preview
            // while the button is actually held (click-and-drag, not
            // passive follow); !gameStarted guards the edge case of the
            // lock being lost mid-game while a drag happens to be active.
            // e.movementX works outside Pointer Lock too (delta since the
            // last mousemove), so no need to track a previous X ourselves.
            // A full window-width drag = one full 360° turn.
            if (menuDragging && !gameStarted) {
                player.rotation.y += (e.movementX / window.innerWidth) * Math.PI * 2;
            }
            return;
        }

        // Known Pointer Lock quirk: the FIRST mousemove event right after
        // the lock is acquired often reports a large, bogus movementX/
        // movementY (browsers differ on exactly what it reflects, but it's
        // not a real mouse gesture) -- see ignoreNextMouseDelta, set by
        // the pointerlockchange listener below whenever the lock is newly
        // acquired. Skipping that one event is what stops it from
        // yanking the view/aim on the very first frame.
        if (ignoreNextMouseDelta) {
            ignoreNextMouseDelta = false;
            return;
        }

        cameraYaw -= e.movementX * mouseSensitivity;
        cameraPitch += e.movementY * mouseSensitivity;
        cameraPitch = Math.max(minPitch, Math.min(maxPitch, cameraPitch));
    });

    // Pointer Lock exit -- fires both when WE call exitPointerLock()
    // (triggerGameOver(), see below) and when the BROWSER itself force-
    // releases the lock, which is exactly what happens when the player
    // presses Escape mid-game (a built-in browser security behavior we
    // can't intercept or preventDefault -- see the Pointer Lock spec).
    // That second case is what turns Escape into a pause: gameStarted is
    // still true at that point (triggerGameOver() always flips it to
    // false BEFORE calling exitPointerLock(), so a real death never
    // reaches this branch -- see triggerGameOver()).
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === renderer.domElement) {
            // Lock just (re)acquired -- see ignoreNextMouseDelta above,
            // consumed by the very next mousemove event.
            ignoreNextMouseDelta = true;
        } else if (gameStarted) {
            gamePaused = true;
            pauseMenuEl.classList.remove('hidden');
        }
    });

    // Keep the render correct if the browser window is resized
    window.addEventListener('resize', onWindowResize);
}

// ============================================================
// DIMENSION SHIFT (see dimensionShift.js for the actual material/
// renderer swap) -- this wrapper just also drives the couple of pieces
// that are main.js's own responsibility: the HUD label and the
// full-screen flash cue.
// ============================================================
function toggleDimension() {
    const { success, isToonMode } = toggleDimensionShift();

    if (!success) {
        // Still on cooldown from the last shift -- a denial flash on the
        // HUD label instead of the normal full-screen one, so it's clear
        // the press did NOT go through.
        dimensionValueEl.classList.remove('denied');
        void dimensionValueEl.offsetWidth;
        dimensionValueEl.classList.add('denied');
        return;
    }

    dimensionValueEl.textContent = isToonMode ? 'TOON' : 'REALISTIC';

    // Restarts the CSS flash animation even if triggered again mid-fade
    // (removing then re-adding the class doesn't restart a CSS animation
    // on its own -- forcing a reflow in between does).
    dimensionFlashEl.classList.remove('flash');
    void dimensionFlashEl.offsetWidth;
    dimensionFlashEl.classList.add('flash');
}

// Runs every frame during active gameplay (see updateGame() below):
// keeps the HUD's dimension line honest about what's actually happening
// -- time left in Toon mode, or time left before it's available again.
function updateDimensionHUD() {
    const { isToonMode, toonTimer, cooldownTimer } = getDimensionShiftStatus();
    if (isToonMode) {
        dimensionStatusEl.textContent = `— ${Math.ceil(toonTimer)}s left`;
    } else if (cooldownTimer > 0) {
        dimensionStatusEl.textContent = `— ready in ${Math.ceil(cooldownTimer)}s`;
    } else {
        dimensionStatusEl.textContent = '— [TAB] to shift';
    }
}

// ============================================================
// INPUT HANDLING
// Called every time a key is pressed or released.
// Just updates our `keys` tracking object — actual movement
// logic happens separately in updateGame(), every frame.
// ============================================================
function handleKeyboard(event, isKeyDown) {
    const key = event.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') keys.w = isKeyDown;
    if (key === 'a' || key === 'arrowleft') keys.a = isKeyDown;
    if (key === 's' || key === 'arrowdown') keys.s = isKeyDown;
    if (key === 'd' || key === 'arrowright') keys.d = isKeyDown;
    if (key === '1' && isKeyDown) switchWeapon(0); // primary (Rifle / SniperRifle, depending on class)
    if (key === '2' && isKeyDown) switchWeapon(1); // sidearm (Pistol)
    // Class switching is a pre-game loadout choice, not a mid-run mechanic
    // -- gated to the menu just like the menu's own prev/next arrows
    if (key === 'c' && isKeyDown && !gameStarted) switchPlayerClass((currentClassIndex + 1) % playerClasses.length);
    if (key === 'tab') {
        event.preventDefault(); // stop the browser from shifting focus to the next element
        // Gated to an active run -- its timers only tick inside
        // updateGame() (see updateDimensionShiftTimers()), so allowing it
        // from the menu/pause would let you "enter toon mode" with a
        // timer that never actually counts down.
        if (isKeyDown && !event.repeat && gameStarted) toggleDimension();
    }
    // DEV key -- instantly clears the current wave so it's not necessary
    // to actually fight through every one to test later waves/the boss.
    if (key === 'n' && isKeyDown && !event.repeat && gameStarted) devSkipWave();
    if (key === ' ') {
        event.preventDefault(); // stop the browser from scrolling the page on spacebar
        // event.repeat is true when the browser auto-fires keydown while
        // a key is held. We only want ONE jump per physical press.
        if (isKeyDown && !event.repeat) {
            jump();
        }
    }
}

// True if a point at (x, z, y) -- with `entityRadius` added on top --
// would overlap any environment obstacle (beacons, crates, jump-
// platforms, see environment.js). Used to keep both the player
// (updateGame(), with playerCollisionRadius) and every enemy
// (updateEnemies()'s attackContext.checkObstacle, with that enemy's own
// hitRadius) from walking through them; same flat distance-check style
// as the bullet/enemy hit tests elsewhere, just against static circles
// instead of moving ones. Jump-platforms (the ones with a `topY`, see
// createJumpPlatforms() in environment.js) are skipped once the
// checking entity's own `y` is at/above that top -- that's what lets
// the player walk freely across a platform's top instead of still being
// blocked by its own base once standing on it.
function collidesWithObstacle(x, z, y, entityRadius) {
    for (const obstacle of environmentObstacles) {
        if (obstacle.topY !== undefined && y >= obstacle.topY - 0.3) continue;
        const dx = x - obstacle.x;
        const dz = z - obstacle.z;
        if (Math.hypot(dx, dz) < obstacle.radius + entityRadius) return true;
    }
    return false;
}

// Directly pushes `position` (a THREE.Vector3 -- player.position or an
// enemy's mesh.position) straight back out of any obstacle it's still
// overlapping, by exactly the overlap amount. Called every frame AFTER
// the normal per-axis movement above (see updateGame()/Enemy.js's
// update()), which only ever produces a sideways slide if the MOVEMENT
// INPUT driving it already had a sideways component -- walking in a
// single straight line (just "W", say, no diagonal) directly at an
// obstacle has none, and the two per-axis attempts alone both just
// fail with nowhere to go, so the walker stops dead against it with no
// way to slide free. This is a plain circle-vs-circle depenetration
// instead: it doesn't care what direction anyone was trying to move in,
// it just guarantees nobody is ever left stuck exactly on an obstacle's
// boundary -- there's always a way out, straight back along the line
// from the obstacle's own center.
function resolveObstaclePenetration(position, entityRadius) {
    for (const obstacle of environmentObstacles) {
        if (obstacle.topY !== undefined && position.y >= obstacle.topY - 0.3) continue;
        const dx = position.x - obstacle.x;
        const dz = position.z - obstacle.z;
        const minDist = obstacle.radius + entityRadius;
        const dist = Math.hypot(dx, dz);
        if (dist > 0 && dist < minDist) {
            const push = (minDist - dist) / dist;
            position.x += dx * push;
            position.z += dz * push;
        }
    }
}

// True if a bullet at (x, z, y) has flown into the solid body of any
// environment obstacle -- called every frame from updateBullets()/
// updateEnemyBullets() below so shots actually stop at crates/pillars/
// jump-platforms instead of sailing straight through them. Same circle
// check as collidesWithObstacle() above, but with no entityRadius (a
// bullet is a point for this purpose) and a different height rule: a
// climbable obstacle (topY, see createProps()/createJumpPlatforms() in
// environment.js) only blocks up to its own top -- a shot arriving from
// above, over that top, is meant to be able to land ON it (see the
// getGroundHeightAt() check at each bullet's own call site, which is
// what actually stops it there) rather than being blocked early by this
// check. A non-climbable obstacle (beacons/pillars, which carry `height`
// instead) has no walkable top at all, so it blocks for its entire height.
function bulletBlockedByObstacle(x, z, y) {
    for (const obstacle of environmentObstacles) {
        const solidTop = obstacle.topY !== undefined ? obstacle.topY : obstacle.height;
        if (solidTop !== undefined && y >= solidTop) continue;
        const dx = x - obstacle.x;
        const dz = z - obstacle.z;
        if (Math.hypot(dx, dz) < obstacle.radius) return true;
    }
    return false;
}

// ============================================================
// GAME LOGIC — runs every single frame.
// Reads current input state and moves the player accordingly.
// ============================================================
function updateGame(deltaTime) {
    // Build a movement input in LOCAL terms first: how much forward/back
    // and how much left/right, independent of any world direction.
    let moveForward = 0; // +1 = W (forward), -1 = S (backward)
    let moveRight = 0;   // +1 = D (right),   -1 = A (left)
    if (keys.w) moveForward += 1;
    if (keys.s) moveForward -= 1;
    if (keys.d) moveRight += 1;
    if (keys.a) moveRight -= 1;

    // Normalize so diagonal movement (e.g. W+D together) isn't faster
    // than moving in a single direction (otherwise it'd be sqrt(2)x speed).
    const inputLength = Math.hypot(moveForward, moveRight);
    if (inputLength > 0) {
        moveForward /= inputLength;
        moveRight /= inputLength;
    }

    // Convert that local input into world-space X/Z using the camera's
    // yaw. This is what makes W always "the direction the camera is
    // looking" instead of a fixed world direction 
    //   forward = (sin(yaw), cos(yaw))
    //   right   = (-cos(yaw), sin(yaw)) -- 90° from forward, matched empirically to feel correct on screen
    const moveX = Math.sin(cameraYaw) * moveForward - Math.cos(cameraYaw) * moveRight;
    const moveZ = Math.cos(cameraYaw) * moveForward + Math.sin(cameraYaw) * moveRight;

    // Multiplying by deltaTime (seconds since last frame) means movement
    // is measured in "units per second", not "units per frame" —
    // so speed stays consistent no matter the frame rate. The strength
    // buff (see powerups/StrengthPickup.js) temporarily speeds this up.
    const currentSpeed = baseSpeed * (strengthBuffTimer > 0 ? strengthSpeedMultiplier : 1) * deltaTime;

    // Arena boundary: player can't walk past +/- 32 on X or Z
    const limit = 32;
    let nextX = player.position.x + moveX * currentSpeed;
    let nextZ = player.position.z + moveZ * currentSpeed;

    // Only apply the movement if it stays inside the boundary AND
    // doesn't walk the player into an obstacle (see collidesWithObstacle()
    // above). Resolved as two SEPARATE axis checks rather than one
    // combined (nextX, nextZ) check: that way, bumping into an obstacle
    // along one axis only cancels movement along that axis, so moving
    // diagonally into the corner of a crate slides you along its edge
    // instead of just stopping dead.
    if (nextX > -limit && nextX < limit && !collidesWithObstacle(nextX, player.position.z, player.position.y, playerCollisionRadius)) {
        player.position.x = nextX;
    }
    if (nextZ > -limit && nextZ < limit && !collidesWithObstacle(player.position.x, nextZ, player.position.y, playerCollisionRadius)) {
        player.position.z = nextZ;
    }

    // Belt-and-suspenders against getting stuck (see
    // resolveObstaclePenetration() above): the per-axis sliding just
    // above only helps when the input itself has a sideways component,
    // so this directly guarantees a way out regardless of which way the
    // player was actually trying to walk.
    resolveObstaclePenetration(player.position, playerCollisionRadius);
    player.position.x = Math.max(-limit, Math.min(limit, player.position.x));
    player.position.z = Math.max(-limit, Math.min(limit, player.position.z));

    const isMoving = moveForward !== 0 || moveRight !== 0;

    // --- Split rotation: legs follow movement, torso follows aim ---
    // playerGroup (the root, parent of the legs) turns toward the
    // direction you're actually walking -- this is what makes diagonal
    // movement look like a natural run instead of a robotic slide.
    // But we cap how far the legs are allowed to twist away from the
    // torso/aim direction (maxTwist): beyond that angle a real body
    // would just turn as a whole instead of contorting further, so the
    // legs stop following movement exactly and the torso "drags along".
    // When standing still there's no movement direction to use, so the
    // whole body just faces the aim direction instead (feet settle in).
    // 30° -- how far the legs can turn away from the torso. Originally 90°,
    // but that let the legs get clamped to a full 90° (perpendicular/
    // sideways-looking) for ANY movement direction between 90° and 180°
    // away from the aim -- including running straight backward, which is
    // exactly the case that looks worst. A tighter clamp keeps the legs
    // close to the torso/aim direction at all times: diagonal strafing
    // still gets a small natural lean, and backpedaling reads through the
    // walkDirSign-flipped swing (see below) instead of a leg-orientation
    // twist, so it never looks like the legs are stepping sideways.
    const maxTwist = Math.PI / 6;
    if (isMoving) {
        const moveAngle = Math.atan2(moveX, moveZ);
        // Shortest angular difference between where the legs WANT to
        // point and where the torso is aiming, wrapped to (-180°, 180°]
        // so we don't clamp the "long way around" by mistake.
        let diff = Math.atan2(Math.sin(moveAngle - cameraYaw), Math.cos(moveAngle - cameraYaw));
        diff = Math.max(-maxTwist, Math.min(maxTwist, diff));
        player.rotation.y = cameraYaw + diff;
    } else {
        player.rotation.y = cameraYaw;
    }

    // The torso is a CHILD of playerGroup, so its final world-space
    // rotation is playerGroup's rotation PLUS its own local rotation
    // (rotations around the same axis simply add up). We want the
    // torso's WORLD rotation to always equal cameraYaw (aiming stays
    // accurate no matter which way the legs are pointing), so we solve
    // for the local rotation that cancels out whatever the legs are doing:
    //   cameraYaw = player.rotation.y + torso.rotation.y
    //   => torso.rotation.y = cameraYaw - player.rotation.y
    // Since player.rotation.y is now clamped to at most maxTwist away
    // from cameraYaw, this local rotation never exceeds maxTwist either --
    // no more full 180° torso twists.
    player.userData.torso.rotation.y = cameraYaw - player.rotation.y;

    // Tilts the torso/gun up or down to hint at the current look/aim
    // pitch -- see shootBullet()/updateAimIndicator() below, which aim
    // toward the camera's own crosshair point rather than using this
    // angle directly, so this is purely cosmetic and can't desync the
    // actual shot. Sign is INVERTED relative to cameraPitch: positive
    // cameraPitch means the camera sits higher and looks further DOWN
    // (see updateCamera()), so the torso needs the opposite sign to
    // lean the same way the camera is actually looking. The torso
    // mesh's own pivot sits at its geometric center rather than at a
    // hip/neck joint (there's no separate waist bone to bend at), so
    // rotating it by the full angle reads as the whole block pivoting
    // oddly around its middle instead of a natural lean -- toning the
    // VISUAL tilt down (torsoTiltFactor) keeps the pose readable.
    const torsoTiltFactor = 0.45;
    player.userData.torso.rotation.x = -cameraPitch * torsoTiltFactor;

    // --- Walk-direction sign ---
    // animateWalk()'s swing is just a function of elapsed time, so on its
    // own it can't tell whether the legs are currently facing the same way
    // the body is actually translating. When the maxTwist clamp above is
    // maxed out (e.g. running backward while aiming forward), the legs can
    // end up pointing away from the real movement direction -- without this
    // check they'd play a "walking forward" cycle while the body slides
    // backward (moonwalk). We detect the mismatch with a dot product
    // between the world movement vector and the legs' own forward vector
    // ((sin, cos) of player.rotation.y, same convention as everywhere else)
    // and flip the swing sign when they disagree.
    let walkDirSign = 1;
    if (isMoving) {
        const legsForwardX = Math.sin(player.rotation.y);
        const legsForwardZ = Math.cos(player.rotation.y);
        const dot = moveX * legsForwardX + moveZ * legsForwardZ;
        walkDirSign = dot >= 0 ? 1 : -1;
    }

    animateWalk(isMoving, deltaTime, walkDirSign); // swing arms/legs while moving

    updateVerticalMovement(deltaTime); // apply gravity / jump

    // --- Shooting ---
    // shotCooldown counts down every frame; once it reaches 0 (and the
    // left mouse button is held) we fire and reset it to fireRate. This
    // gives a controlled, steady fire rate instead of one bullet per
    // frame (which at 60-144fps would be absurdly fast). Automatic
    // weapons (see Weapon.js) fire repeatedly for as long as the button
    // stays down; semi-auto ones also require shotFiredThisPress to
    // still be false, which caps them at one shot per press no matter
    // how long it's held -- it only goes back to false on mouseup.
    const currentWeapon = player.userData.playerClass.weapons[currentWeaponIndex];
    shotCooldown -= deltaTime;
    if (isMouseDown && shotCooldown <= 0 && (currentWeapon.automatic || !shotFiredThisPress)) {
        shootBullet();
        shotCooldown = currentWeapon.fireRate;
        if (!currentWeapon.automatic) shotFiredThisPress = true;
    }

    updateAimIndicator(); // light up the crosshair if it's currently over an enemy

    // --- Strength buff countdown ---
    if (strengthBuffTimer > 0) {
        strengthBuffTimer = Math.max(0, strengthBuffTimer - deltaTime);
        strengthBuffLineEl.classList.remove('hidden');
        strengthBuffTimerEl.textContent = Math.ceil(strengthBuffTimer);
        if (strengthBuffTimer === 0) strengthBuffLineEl.classList.add('hidden');
    }
    updateStrengthAura(deltaTime);

    // --- Dimension Shift timers ---
    updateDimensionShiftTimers(deltaTime); // counts down the active Toon window / the post-Toon cooldown, auto-reverting when the window runs out
    updateDimensionHUD();

    updateCamera(); // keep camera locked to the player every frame
}

// ============================================================
// JUMP / GRAVITY
// Simple arcade physics, no physics engine needed:
// - jump() just gives the player an upward velocity, but only if
//   they're currently on the ground (no mid-air double jumps).
// - updateVerticalMovement() runs every frame: gravity constantly
//   pulls velocityY down, and velocityY moves the player up/down.
//   "The ground" isn't always y=0 anymore -- getGroundHeightAt()
//   (environment.js) also checks the jump-platforms scattered around
//   the arena and returns THEIR top instead, if the player is over one
//   and high enough to be landing on it rather than passing through.
// ============================================================
function jump() {
    if (isGrounded) {
        velocityY = jumpForce;
        isGrounded = false;
    }
}

function updateVerticalMovement(deltaTime) {
    velocityY += gravity * deltaTime;       // gravity accelerates the fall every frame
    player.position.y += velocityY * deltaTime;

    const groundY = getGroundHeightAt(environmentObstacles, player.position.x, player.position.z, player.position.y);

    if (player.position.y <= groundY) {
        player.position.y = groundY;  // don't let the player fall through the floor (or a jump-platform's top)
        velocityY = 0;
        isGrounded = true;
    } else {
        isGrounded = false;
    }
}

// ============================================================
// WALK CYCLE ANIMATION
// Procedural animation: instead of playing back pre-made keyframes,
// we compute the pose every frame from a formula (a sine wave).
// This is only possible because the model is hierarchical — we can
// rotate just the leg/arm meshes independently, and each one carries
// its own geometry with it wherever it goes.
//
// walkTime only advances while the player is moving, so the cycle
// pauses instantly (rather than finishing mid-swing) when they stop.
// Left leg and right arm swing together, right leg and left arm swing
// together — this mimics how a real human gait alternates sides.
//
// walkDirSign (computed in updateGame, see comment there) flips the
// swing when the body is translating opposite to where the legs are
// currently facing 
// ============================================================
function animateWalk(isMoving, deltaTime, walkDirSign = 1) {
    const { leftArm, rightArm, leftLeg, rightLeg } = player.userData;

    if (isMoving) {
        walkTime += deltaTime * 8; // 8 = how fast the legs swing (frequency)
    }

    // amplitude = how far (in radians) each limb swings forward/back.
    // When not moving, amplitude is 0, so limbs snap back to resting pose.
    // walkDirSign (see updateGame) flips this when the body is actually
    // translating opposite to where the legs are currently facing.
    const amplitude = isMoving ? 0.6 * walkDirSign : 0;
    const swing = Math.sin(walkTime) * amplitude;

    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
    leftArm.rotation.x = -swing; // opposite to left leg, matches right leg's phase
    rightArm.rotation.x = swing; // opposite to right leg, matches left leg's phase
}

// How far out along the camera's forward ray to aim when nothing's
// actually under the crosshair (see getCrosshairTarget() below) -- a
// plausible mid-combat distance, NOT an arbitrary "very far away" point.
const DEFAULT_AIM_DISTANCE = 20;
// How far out to actually LOOK for an enemy to lock the aim onto --
// wider than DEFAULT_AIM_DISTANCE, past the arena's own spawn ring
// (arenaSpawnRadius), so a distant enemy still under the crosshair gets
// aimed at correctly instead of falling back to the shorter default
// (which would aim short of them, right where nothing actually is).
const AIM_SEARCH_DISTANCE = 40;

// `fromPos` is ALWAYS the actual muzzle/spawn point (see
// getBulletSpawnPoint()), even when this is called from
// getCrosshairTarget()'s camera-based search below -- travel time has
// to come from where the real bullet actually starts, not from
// wherever the search itself happens to be looking from. The camera
// sits a fixed several units behind the player regardless of how close
// an enemy is TO the player, so using the camera's own distance here
// would badly overestimate travel time for anything in melee range
// (and, with it, how far to lead them) -- the shot would aim well past
// a close, strafing enemy since it "expects" a much longer flight than
// the short hop the real muzzle-to-target distance actually is.
function predictEnemyPosition(enemy, fromPos, bulletSpeed) {
    const travelTime = enemy.mesh.position.distanceTo(fromPos) / bulletSpeed;
    return enemy.mesh.position.clone().addScaledVector(enemy.velocity, travelTime);
}

// Returns the world-space point the crosshair (screen center) is
// CURRENTLY resting on -- the closest enemy actually lined up under it
// (leading its predicted position, see predictEnemyPosition() above),
// if any, otherwise a point DEFAULT_AIM_DISTANCE out along the camera's
// own forward ray. `bulletSpeed` is the currently-equipped weapon's --
// needed to estimate travel time for that leading. Shared by
// shootBullet() and updateAimIndicator() below: aiming a weapon FROM
// its muzzle TOWARD this point (rather than just firing along some
// angle) is what makes the shot match the crosshair, regardless of the
// muzzle's own offset from the camera -- same "aim toward a target
// point" technique Boss.js's onAttack() already uses via leadTarget(),
// just sourced from the camera instead of the player's position.
// Targeting whatever's actually under the crosshair (rather than always
// a fixed far point) matters BECAUSE of that same muzzle/camera offset:
// with the over-the-shoulder framing (see updateCamera()) the two are
// now a couple of units apart, so a FIXED far-away target only pulls
// the muzzle's aim into line with the crosshair by the time the shot is
// nearly at that point -- at any normal combat range well short of it,
// the shot would still look like it's just travelling straight out of
// the barrel instead of visibly converging on the crosshair. Aiming at
// whatever's actually close by under the crosshair fixes that at the
// range that's actually relevant.
function getCrosshairTarget(bulletSpeed) {
    const camPos = camera.position;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    // For travel-time purposes ONLY (see predictEnemyPosition()) -- the
    // ray search just below still starts from the camera, matching the
    // crosshair; this is just about how far to lead a moving target.
    const spawnPos = getBulletSpawnPoint();

    let closestT = AIM_SEARCH_DISTANCE;
    let hitPoint = null;
    for (const enemy of enemies) {
        const predicted = predictEnemyPosition(enemy, spawnPos, bulletSpeed);
        const ex = predicted.x - camPos.x;
        const ez = predicted.z - camPos.z;
        const t = ex * camDir.x + ez * camDir.z; // distance along the ray to this enemy's closest approach (XZ)
        if (t < 0 || t > closestT) continue;

        const perpDist = Math.hypot(ex - camDir.x * t, ez - camDir.z * t);
        if (perpDist >= enemy.hitRadius) continue;

        // Also confirm the ray is actually near this enemy's body height
        // at that point, not just lined up in XZ -- same body-center
        // approximation used everywhere else (see updateAimIndicator()).
        // The tolerance is a generous FLOOR, not just hitRadius, for a
        // structural reason: the camera always looks at a fixed point on
        // the player (see updateCamera()) regardless of pitch, so at
        // roughly the player's OWN distance -- exactly where a melee
        // attacker standing right next to them sits -- the ray's height
        // is locked close to that fixed point (head height) no matter
        // how the player aims; pitching up/down barely moves it at that
        // specific depth. A short, ground-level enemy's own center sits
        // well below that, so a tolerance of just their hitRadius would
        // almost never actually reach them at melee range, no matter how
        // well-aimed the shot looks 
        const enemyCenterY = predicted.y + enemy.hitRadius;
        const rayY = camPos.y + camDir.y * t;
        const verticalTolerance = Math.max(enemy.hitRadius, 1.3);
        if (Math.abs(rayY - enemyCenterY) > verticalTolerance) continue;

        closestT = t;
        // The enemy's own actual (predicted) center -- 
        hitPoint = new THREE.Vector3(predicted.x, enemyCenterY, predicted.z);
    }

    return hitPoint ?? camPos.clone().addScaledVector(camDir, DEFAULT_AIM_DISTANCE);
}


function getBulletSpawnPoint() {
    const spawnPos = new THREE.Vector3();
    player.userData.muzzle.getWorldPosition(spawnPos);
    return spawnPos;
}

// ============================================================
// SHOOTING
// Delegates to the current weapon's own shoot() (see Weapon.js): it
// builds the bullet mesh, spawns it at the gun's actual muzzle (see
// getBulletSpawnPoint() above) and aims it toward the crosshair (see
// getCrosshairTarget() above) -- so shooting always lands exactly where
// the camera is looking, whether that's dead ahead, up at something on
// a platform, or down at something below. The shot's path is a straight
// LINE the entire way (see Weapon.shoot()/updateBullets()) -- velocity
// is computed once, right here, and never touched again after that.
// ============================================================
function shootBullet() {
    const weapon = player.userData.playerClass.weapons[currentWeaponIndex];
    const bulletEntry = weapon.shoot(scene, getBulletSpawnPoint(), getCrosshairTarget(weapon.bulletSpeed));
    // Strength buff (see powerups/StrengthPickup.js) temporarily hits harder.
    if (strengthBuffTimer > 0) bulletEntry.damage = Math.round(bulletEntry.damage * strengthDamageMultiplier);
    bullets.push(bulletEntry);
}

// Moves every active bullet forward and removes it once it either:
// outlives its own weapon's bulletLifetime, flies into the ground/a
// climbable obstacle's top (getGroundHeightAt -- same "floor" the
// player/enemies land on, see environment.js), flies into the solid
// body of a non-climbable obstacle (bulletBlockedByObstacle() above),
// or crosses the arena's outer wall -- so shots actually stop at
// crates/pillars/the floor instead of sailing straight through them.
function updateBullets(deltaTime) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.mesh.position.addScaledVector(b.velocity, deltaTime);
        b.age += deltaTime;
        // Keep the trailing tracer streak (see Weapon.js) glued directly
        // behind the bullet, along its own fixed direction of travel --
        // this is what makes the straight-line path plainly visible.
        b.tracer.position.copy(b.mesh.position).add(b.tracerOffset);

        const pos = b.mesh.position;
        const hitGround = pos.y <= getGroundHeightAt(environmentObstacles, pos.x, pos.z, pos.y);
        const hitWall = Math.abs(pos.x) > bulletWallLimit || Math.abs(pos.z) > bulletWallLimit;

        if (b.age > b.lifetime || hitGround || hitWall || bulletBlockedByObstacle(pos.x, pos.z, pos.y)) {
            scene.remove(b.mesh); // stop rendering it
            scene.remove(b.tracer);
            bullets.splice(i, 1); // remove it from our tracking array
        }
    }
}

// ============================================================
// AIM INDICATOR
// #crosshair (index.html) is a plain 2D HUD element, permanently dead
// center on screen via CSS -- nothing to position here. All this does
// each frame is the same ray-vs-enemy test the old 3D beam used, along
// the EXACT same ray Weapon.shoot() actually fires along (see
// getBulletSpawnPoint()/getCrosshairTarget() above shootBullet(), in
// Weapon.js), and toggles the crosshair's "hit" CSS class depending on
// whether an enemy is currently under it -- a lit-up crosshair means
// the next shot lands.
// ============================================================
function updateAimIndicator() {
    const weapon = player.userData.playerClass.weapons[currentWeaponIndex];

    const origin = getBulletSpawnPoint();
    const direction = new THREE.Vector3().subVectors(getCrosshairTarget(weapon.bulletSpeed), origin).normalize();

    // Never claims a longer reach than this weapon's own bullets actually have.
    const maxDistance = weapon.bulletSpeed * weapon.bulletLifetime;

    let hitEnemy = false;
    for (const enemy of enemies) {
        // Same leading as getCrosshairTarget() above -- keeps this "will
        // it land" cue consistent with what actually happens: a strafing
        // enemy currently dead under the crosshair but about to step out
        // from under a slow shot shouldn't light up as a sure hit.
        const predicted = predictEnemyPosition(enemy, origin, weapon.bulletSpeed);
        const ex = predicted.x - origin.x;
        const ez = predicted.z - origin.z;
        const t = ex * direction.x + ez * direction.z; // distance along the ray to this enemy's closest approach (XZ)
        if (t < 0 || t > maxDistance) continue;

        const perpDist = Math.hypot(ex - direction.x * t, ez - direction.z * t);
        if (perpDist >= enemy.hitRadius) continue;

        // Also confirm the ray is actually near this enemy's body height
        // at that point along its path, not just lined up in XZ. Enemies
        // are rooted at their feet (mesh.position.y), so their body's
        // rough vertical center sits about one hitRadius above that --
        // same approximation the real bullet-hit check uses (see
        // updateEnemies()), and same generous tolerance floor
        // getCrosshairTarget() uses above (see its own comment on this).
        const enemyCenterY = predicted.y + enemy.hitRadius;
        const rayY = origin.y + direction.y * t;
        const verticalTolerance = Math.max(enemy.hitRadius, 1.3);
        if (Math.abs(rayY - enemyCenterY) > verticalTolerance) continue;

        hitEnemy = true;
        break; // one confirmed target is enough -- nothing more to compute
    }

    crosshairEl.classList.toggle('hit', hitEnemy);
}

// ============================================================
// STRENGTH AURA
// Purely cosmetic feedback for the strength power-up buff (see
// powerups/StrengthPickup.js) -- two glowing rings around the player's
// feet, spinning in opposite directions, visible only while the buff
// timer is running.
// ============================================================
function createStrengthAura() {
    strengthAura = new THREE.Group();

    const ringMat1 = new THREE.MeshStandardMaterial({
        color: 0x331a00, emissive: 0xff8800, emissiveIntensity: 2.2,
        transparent: true, opacity: 0.6, side: THREE.DoubleSide
    });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.035, 8, 24), ringMat1);
    ring1.rotation.x = Math.PI / 2;
    strengthAura.add(ring1);

    const ringMat2 = ringMat1.clone();
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 24), ringMat2);
    ring2.rotation.x = Math.PI / 2.3;
    strengthAura.add(ring2);

    strengthAura.visible = false; // only shown while the buff is active -- see updateStrengthAura()
    scene.add(strengthAura);
}

// Called every frame from updateGame(). Follows the player's position
// (including jump height) and keeps both rings spinning; visibility is
// just a direct reflection of whether the buff timer is still running.
function updateStrengthAura(deltaTime) {
    strengthAura.visible = strengthBuffTimer > 0;
    if (!strengthAura.visible) return;

    strengthAura.position.set(player.position.x, player.position.y + 0.1, player.position.z);
    strengthAura.children[0].rotation.z += deltaTime * 1.8;
    strengthAura.children[1].rotation.z -= deltaTime * 2.4;
}

// ============================================================
// ENEMIES / WAVES
// Spawning, AI update, both directions of bullet collision (player
// bullets vs. enemies, enemy bullets vs. the player), and the 10-wave
// structure (9 regular waves + the DOOMHORN boss on wave 10) all live
// here. See enemies/Enemy.js, Grunt.js, Shooter.js, Boss.js.
// ============================================================

// Shows a transient top-center announcement ("WAVE 3", "WAVE 3
// CLEARED", the boss warning) -- purely cosmetic text, so unlike the
// wave-transition timer below it's fine to hide it on a plain
// wall-clock setTimeout rather than a deltaTime countdown.
let waveBannerHideTimer = null;
function showWaveBanner(text, durationMs) {
    waveBannerEl.textContent = text;
    waveBannerEl.classList.add('visible');
    if (waveBannerHideTimer) clearTimeout(waveBannerHideTimer);
    waveBannerHideTimer = setTimeout(() => waveBannerEl.classList.remove('visible'), durationMs);
}

// Starts wave `waveNumber`: either queues up a batch of regular enemies
// (see spawnEnemy()/updateEnemies()) or, on the final wave, drops in
// the boss directly. Called once on PLAY (wave 1) and again every time
// updateEnemies() detects the current wave has been fully cleared.
function startWave(waveNumber) {
    currentWave = waveNumber;
    waveValueEl.textContent = waveNumber;
    isBossWave = waveNumber === totalWaves;

    if (isBossWave) {
        waveSpawnQueue = 0; // the boss is spawned directly below, not through the regular trickle-spawn queue
        waveEnemiesRemaining = 1;
        spawnBoss();
        showWaveBanner('FINAL WAVE — DOOMHORN INCOMING', 3200);
    } else {
        const count = waveSizes[waveNumber - 1];
        waveSpawnQueue = count;
        waveEnemiesRemaining = count;
        showWaveBanner(`WAVE ${waveNumber}`, 2000);
    }
}

// Wave-dependent spawn weights for the four enemy types. Brute/Marksman are layered in ON TOP,
// introduced gradually and capped, so they show up as an added threat
// rather than crowding out the other two -- the waveSizes bump above is
// what actually keeps Grunt/Shooter's ABSOLUTE spawn count from
// dropping now that there are 4 types splitting each wave's pool
// instead of 2.
function getEnemyTypeWeights(wave) {
    const shooterWeight = Math.min(30 + wave * 3, 55);
    const gruntWeight = 100 - shooterWeight;
    const bruteWeight = Math.min(5 + wave * 2, 25);
    const marksmanWeight = Math.min(5 + wave * 2, 25);
    return [
        { Type: Grunt, weight: gruntWeight },
        { Type: Shooter, weight: shooterWeight },
        { Type: Brute, weight: bruteWeight },
        { Type: Marksman, weight: marksmanWeight }
    ];
}

function pickWeightedEnemyType(wave) {
    const weights = getEnemyTypeWeights(wave);
    const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
    let r = Math.random() * total;
    for (const entry of weights) {
        if (r < entry.weight) return entry.Type;
        r -= entry.weight;
    }
    return weights[weights.length - 1].Type; // floating-point fallback, practically never hit
}

// Picks a random enemy type (see getEnemyTypeWeights() above) and drops
// it at a random point on a ring just inside the arena boundary, so
// enemies visibly walk in from the edges instead of popping up next to
// the player. Stats scale up a little every wave (see `scale` below) so
// later waves are tougher, not just more crowded.
function spawnEnemy() {
    const EnemyType = pickWeightedEnemyType(currentWave);
    const enemy = new EnemyType();

    const scale = 1 + (currentWave - 1) * 0.1; // +10% health/damage per wave past the first
    enemy.maxHealth *= scale;
    enemy.health = enemy.maxHealth;
    enemy.damage = Math.round(enemy.damage * scale);

    const angle = Math.random() * Math.PI * 2;
    enemy.mesh.position.set(Math.cos(angle) * arenaSpawnRadius, 0, Math.sin(angle) * arenaSpawnRadius);

    scene.add(enemy.mesh);
    enemies.push(enemy);
}

function spawnBoss() {
    boss = new Boss();
    boss.mesh.position.set(0, 0, arenaSpawnRadius); // +Z is "forward" at the player's default facing (see updateCamera()) -- the boss is visible immediately, not spawned behind them
    scene.add(boss.mesh);
    enemies.push(boss); // same array as everything else -- the collision loop below doesn't need to know it's special

    bossNameEl.textContent = boss.name;
    bossBarContainerEl.classList.remove('hidden');
    updateBossBarUI();
}

function updateBossBarUI() {
    if (!boss) return;
    bossHealthFillEl.style.width = `${Math.max(0, boss.health / boss.maxHealth) * 100}%`;
}

// Runs every frame: handles the spawn timer (regular waves) or the
// inter-wave pause, updates every enemy's AI (movement/facing/attack --
// see Enemy.update()), and checks player bullets against every enemy
// for a hit. Wave-clear detection lives at the bottom: once every
// enemy queued for the current wave has been killed, either starts the
// next wave or -- if this was the boss -- triggers victory.

// DEV-ONLY convenience, bound to [N] (see handleKeyboard()): instantly
// clears every enemy from -- and still queued for -- the current wave,
// so the very next updateEnemies() call sees waveEnemiesRemaining hit 0
// on its own and naturally advances to the next wave (or triggers
// victory, if this was wave 10) through the exact same path a real
// clear would. Lets every wave/the boss be reached and tested quickly
// without actually fighting through each one first.
function devSkipWave() {
    if (gamePaused || victoryActive || waveTransitioning) return;
    enemies.forEach((e) => scene.remove(e.mesh));
    enemies = [];
    boss = null;
    waveSpawnQueue = 0;
    waveEnemiesRemaining = 0;
}

function updateEnemies(deltaTime) {
    if (waveTransitioning) {
        waveTransitionTimer -= deltaTime;
        if (waveTransitionTimer <= 0) {
            waveTransitioning = false;
            startWave(currentWave + 1);
        }
        return; // arena is momentarily clear between waves -- nothing else to do this frame
    }

    if (!isBossWave) {
        enemySpawnTimer -= deltaTime;
        if (enemySpawnTimer <= 0 && waveSpawnQueue > 0 && enemies.length < maxConcurrentEnemies) {
            spawnEnemy();
            waveSpawnQueue--;
            enemySpawnTimer = enemySpawnInterval;
        }
    }

    // Rebuilt fresh every frame and handed to each enemy's onAttack() (see
    // enemies/Enemy.js) -- melee enemies call dealDamageToPlayer directly,
    // ranged ones use scene/playerPosition/spawnEnemyBullet to fire at the
    // player instead. This is what lets Enemy.update() stay completely
    // generic: it doesn't need to know HOW a given enemy type attacks.
    // Recomputed every frame from the actual change in position since
    // last frame -- see Enemy.leadTarget() (enemies/Enemy.js), which
    // ranged enemies use to aim ahead of a moving player instead of
    // straight at their current spot.
    playerVelocity.subVectors(player.position, previousPlayerPosition).divideScalar(Math.max(deltaTime, 0.0001));
    previousPlayerPosition.copy(player.position);

    const attackContext = {
        dealDamageToPlayer: damagePlayer,
        spawnEnemyBullet: (entry) => enemyBullets.push(entry),
        playerPosition: player.position,
        playerVelocity,
        checkObstacle: collidesWithObstacle, // lets Enemy.update() (enemies/Enemy.js) avoid crates/pillars, same check the player's own movement uses
        // Same "push straight back out of whatever's still overlapped"
        // depenetration the player's own updateGame() applies -- lets an
        // enemy that got stuck (its own obstacle-avoidance steering, see
        // Enemy.js, mostly prevents this, but not for every approach
        // angle) actually get free again instead of just sitting there.
        resolvePenetration: resolveObstaclePenetration,
        // Both reused from the exact same jump-platform/crate system the
        // player's own jump() uses (see environment.js) -- getGroundHeight
        // is for landing/gravity once an enemy is airborne, getClimbableHeight
        // is for deciding whether to jump in the first place (see Enemy.js's update()).
        getGroundHeight: (x, z, y) => getGroundHeightAt(environmentObstacles, x, z, y),
        getClimbableHeight: (x, z) => getClimbableHeightAt(environmentObstacles, x, z),
        scene
    };

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.update(deltaTime, player.position, attackContext);

        // Player bullets vs. this enemy: an XZ-plane distance check, plus
        // (now that bullets can travel up/down too -- see
        // getCrosshairTarget() near shootBullet()) a vertical check
        // against the enemy's rough body center, same
        // enemy.mesh.position.y + hitRadius approximation
        // updateAimIndicator() uses for its own hit prediction.
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            const dx = b.mesh.position.x - enemy.mesh.position.x;
            const dz = b.mesh.position.z - enemy.mesh.position.z;
            const dy = b.mesh.position.y - (enemy.mesh.position.y + enemy.hitRadius);
            if (Math.hypot(dx, dz) < enemy.hitRadius && Math.abs(dy) < enemy.hitRadius) {
                scene.remove(b.mesh);
                scene.remove(b.tracer);
                bullets.splice(j, 1);

                // Dimension Shift's "weak point" bonus -- see TOON_DAMAGE_MULTIPLIER above.
                const damage = isToonDimension() ? b.damage * TOON_DAMAGE_MULTIPLIER : b.damage;
                if (enemy.takeDamage(damage)) {
                    scene.remove(enemy.mesh);
                    enemies.splice(i, 1);
                    waveEnemiesRemaining--;
                    if (enemy === boss) boss = null;
                }
                break; // this enemy is dead or already hit this frame either way, stop checking its remaining bullets
            }
        }
    }

    if (isBossWave && boss) updateBossBarUI();

    if (waveEnemiesRemaining <= 0) {
        if (isBossWave) {
            triggerVictory();
        } else {
            showWaveBanner(`WAVE ${currentWave} CLEARED`, 2200);
            waveTransitioning = true;
            waveTransitionTimer = 3;
        }
    }
}

// Moves every enemy bullet forward, checks it against the player (same
// distance-check style as above), and removes it on a hit, once it
// outlives its lifetime, or -- same as updateBullets() above -- once it
// flies into the ground/a climbable obstacle's top, the solid body of a
// non-climbable obstacle, or the arena's outer wall.
function updateEnemyBullets(deltaTime) {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.mesh.position.addScaledVector(b.velocity, deltaTime);
        b.age += deltaTime;

        const pos = b.mesh.position;
        const dx = pos.x - player.position.x;
        const dz = pos.z - player.position.z;
        // Ranged enemies now aim up/down too (see Shooter.js/Marksman.js's
        // onAttack()), so also check the shot's height against a rough
        // vertical span for the player's body -- centered a bit above
        // player.position (their feet) at roughly chest height.
        const dy = pos.y - (player.position.y + 0.9);
        const hitPlayer = Math.hypot(dx, dz) < 0.6 && Math.abs(dy) < 1.1; // rough player hit radius

        const hitGround = pos.y <= getGroundHeightAt(environmentObstacles, pos.x, pos.z, pos.y);
        const hitWall = Math.abs(pos.x) > bulletWallLimit || Math.abs(pos.z) > bulletWallLimit;

        if (hitPlayer || b.age > b.lifetime || hitGround || hitWall || bulletBlockedByObstacle(pos.x, pos.z, pos.y)) {
            scene.remove(b.mesh);
            enemyBullets.splice(i, 1);
            if (hitPlayer) damagePlayer(b.damage);
        }
    }
}

// ============================================================
// PLAYER HEALTH / ARMOR
// Armor is a second pool that soaks up damage BEFORE health does --
// any amount left over after armor is depleted spills onto health, in
// the same hit. See powerups/ArmorPickup.js for how armor gets filled.
// ============================================================
function damagePlayer(amount) {
    if (playerHealth <= 0) return; // already dead -- ignore further hits until the page reloads (see triggerGameOver())

    let remaining = amount;
    if (playerArmor > 0) {
        const absorbed = Math.min(playerArmor, remaining);
        playerArmor -= absorbed;
        remaining -= absorbed;
        updateArmorUI();
    }

    if (remaining > 0) {
        playerHealth = Math.max(0, playerHealth - remaining);
        updateHealthUI();
    }

    if (playerHealth <= 0) triggerGameOver();
}

function updateHealthUI() {
    const pct = playerHealth / playerMaxHealth;
    healthFillEl.style.width = `${pct * 100}%`;
    healthValueEl.textContent = Math.ceil(playerHealth);
    // Shifts green -> yellow -> red as health drops
    healthFillEl.style.backgroundColor = pct > 0.5 ? '#00ffcc' : pct > 0.25 ? '#ffcc00' : '#ff3344';
}

function updateArmorUI() {
    const pct = playerArmor / playerMaxArmor;
    armorFillEl.style.width = `${pct * 100}%`;
    armorValueEl.textContent = Math.ceil(playerArmor);
}

// ============================================================
// POWER-UPS
// Spawning (weighted-random type, capped concurrent count), floating/
// spinning animation, and pickup-by-proximity all live here. See
// powerups/PowerUp.js and its subclasses.
// ============================================================

// Weighted random pick from powerUpTypes (see the globals above) --
// higher weight = more likely, but every type can still show up any
// time there's room on the field.
function pickWeightedPowerUpType() {
    const total = powerUpTypes.reduce((sum, entry) => sum + entry.weight, 0);
    let r = Math.random() * total;
    for (const entry of powerUpTypes) {
        if (r < entry.weight) return entry.Type;
        r -= entry.weight;
    }
    return powerUpTypes[powerUpTypes.length - 1].Type; // floating-point fallback, practically never hit
}

// Finds a random spot inside the arena that isn't inside a crate/beacon
// (reuses the same obstacle check the player's own movement uses, see
// collidesWithObstacle() above updateGame()) -- a few retries are enough
// since obstacles only cover a small fraction of the arena's area; the
// fallback (dead center) is only ever reached if every attempt is
// unlucky enough to land inside something, which is exceedingly rare.
function findPowerUpSpawnPosition() {
    for (let attempt = 0; attempt < 8; attempt++) {
        const x = (Math.random() * 2 - 1) * 26; 
        const z = (Math.random() * 2 - 1) * 26;
        if (!collidesWithObstacle(x, z, 0, 0.5)) return { x, z };
    }
    return { x: 0, z: 0 };
}

function spawnPowerUp() {
    if (powerUps.length >= maxPowerUpsOnField) return;

    const Type = pickWeightedPowerUpType();
    const powerUp = new Type();
    const { x, z } = findPowerUpSpawnPosition();
    powerUp.group.position.x = x;
    powerUp.group.position.z = z;

    scene.add(powerUp.group);
    powerUps.push(powerUp);
}

// Runs every frame: handles the spawn timer, animates every power-up
// currently on the field (see PowerUp.update()), and picks up any that
// the player is standing close enough to.
function updatePowerUps(deltaTime) {
    powerUpSpawnTimer -= deltaTime;
    if (powerUpSpawnTimer <= 0) {
        spawnPowerUp();
        powerUpSpawnTimer = powerUpSpawnInterval;
    }

    // Built fresh every frame and handed to whichever power-up gets
    // picked up (see PowerUp.apply()) -- same "generic hook + context
    // object" pattern as enemies' attackContext above.
    const pickupContext = {
        healToFull: () => { playerHealth = playerMaxHealth; updateHealthUI(); },
        addArmor: (amount) => { playerArmor = Math.min(playerMaxArmor, playerArmor + amount); updateArmorUI(); },
        armorToFull: () => { playerArmor = playerMaxArmor; updateArmorUI(); },
        activateStrengthBuff: () => { strengthBuffTimer = strengthBuffDuration; }
    };

    for (let i = powerUps.length - 1; i >= 0; i--) {
        const powerUp = powerUps[i];
        powerUp.update(deltaTime);

        if (powerUp.isExpired()) {
            scene.remove(powerUp.group);
            powerUps.splice(i, 1);
            continue;
        }

        // Dimension-locked pickups (see requiresToon in powerups/PowerUp.js,
        // powerups/DimensionCachePickup.js): invisible AND uncollectable
        // outside Toon dimension -- overrides whatever update() just
        // decided about the despawn-warning blink.
        if (powerUp.requiresToon && !isToonDimension()) {
            powerUp.group.visible = false;
            continue;
        }

        const dx = player.position.x - powerUp.group.position.x;
        const dz = player.position.z - powerUp.group.position.z;
        if (Math.hypot(dx, dz) < powerUp.pickupRadius) {
            powerUp.apply(pickupContext);
            scene.remove(powerUp.group);
            powerUps.splice(i, 1);
        }
    }
}

// Freezes gameplay, releases the pointer lock (so the cursor + RESTART
// button are usable again), and shows the game-over overlay. Restarting
// just reloads the page (see the restart-button listener in initMenu())
// rather than hand-resetting every piece of mutable state (enemies,
// bullets, cooldowns, position...) 
function triggerGameOver() {
    gameStarted = false; // set BEFORE exitPointerLock() so the resulting
                          // pointerlockchange event doesn't also open the pause menu
    gamePaused = false;
    pauseMenuEl.classList.add('hidden');
    document.exitPointerLock();
    uiOverlayEl.style.display = 'none';
    hudBottomRightEl.style.display = 'none';
    bossBarContainerEl.classList.add('hidden');
    crosshairEl.classList.remove('visible');
    strengthAura.visible = false;
    gameOverWaveEl.textContent = currentWave; // "WAVE REACHED" readout on the game-over panel
    gameOverEl.classList.remove('hidden');
}

// Unlike triggerGameOver(), this deliberately does NOT cut to a
// separate screen -- called from updateEnemies() once the boss (wave
// 10) is defeated, it leaves the player standing right where they won,
// in the arena, HUD and all, and just adds a big "VICTORY" banner over
// the top for a few seconds before reloading back to the main menu on
// its own (no button to press).
function triggerVictory() {
    // Deliberately does NOT touch gameStarted, pointer lock, aim beam/
    // marker, or the strength aura -- the player keeps playing
    // completely normally (moving, looking around, shooting) for the
    // few seconds the banner is up, right where they beat the boss.
    // victoryActive only gates OUT the wave/enemy simulation (see
    // animate()) -- everything player-driven keeps running.
    gamePaused = false;
    victoryActive = true;
    pauseMenuEl.classList.add('hidden');
    bossBarContainerEl.classList.add('hidden');

    victoryBannerEl.classList.add('visible');

    setTimeout(() => location.reload(), VICTORY_DISPLAY_TIME * 1000);
}

// ============================================================
// CAMERA — mouse-controlled, orbits a pivot near the player.
// ============================================================
function updateCamera() {
    const pivotX = player.position.x;
    const pivotY = player.position.y + cameraPivotHeight;
    const pivotZ = player.position.z;

    // The one true look/aim direction 
    const forward = new THREE.Vector3(
        Math.sin(cameraYaw) * Math.cos(cameraPitch),
        -Math.sin(cameraPitch),
        Math.cos(cameraYaw) * Math.cos(cameraPitch)
    );
    // Real camera-relative right/up (cross products, not a flat
    // horizontal guess) -- this is what keeps the shoulder offset below
    // looking like a consistent SCREEN-SPACE shift no matter how much
    // cameraPitch is currently tilting the view up or down.
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    const orbitOffset = new THREE.Vector3(pivotX, pivotY, pivotZ)
        .addScaledVector(forward, -cameraDistance)
        .addScaledVector(right, cameraShoulderRight) // moving the CAMERA right makes the character appear LEFT on screen
        .addScaledVector(up, cameraShoulderDown);    // moving the CAMERA up makes the character appear LOWER on screen

    camera.position.set(
        orbitOffset.x,
        // Safety floor: minPitch allows tilting the orbit far enough that,
        // at extreme angles, the raw formula could dip the camera very
        // low (or, on paper, below the ground) -- this simply refuses to
        // render from underground. It doesn't affect aim at all: shots
        // still fire toward wherever the camera ACTUALLY ends up looking
        // (see getCrosshairTarget()), clamped position included.
        Math.max(orbitOffset.y, 0.5),
        orbitOffset.z
    );
    camera.lookAt(camera.position.x + forward.x, camera.position.y + forward.y, camera.position.z + forward.z);

    // Camera-following fill light: the scene's one shadow-casting
    // DirectionalLight always lights the same world-space side of
    // whatever it hits, so as the player walks/turns around the arena,
    // the side facing away from it goes dark regardless of which side
    // the camera happens to be looking at. Keeping a light glued to the
    // camera's own position guarantees the side the PLAYER actually sees
    // is always reasonably lit, no matter where they are or which way
    // they're facing.
    cameraFillLight.position.copy(camera.position);
}

// Keeps the rendering correct (no stretching) if the browser window changes size
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix(); // must be called after changing aspect
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight); // keep the post-processing render targets matched to the new canvas size
}

// ============================================================
// ANIMATION LOOP
// requestAnimationFrame asks the browser to call this function
// again right before the next screen repaint (usually 60-144 times/sec).
// This is what makes the game "run" continuously.
// ============================================================
function animate() {
    requestAnimationFrame(animate); // schedule the next frame

    const deltaTime = clock.getDelta(); // seconds elapsed since the last frame

    if (gameStarted && !gamePaused) {
        updateGame(deltaTime); // move player, update camera -- keeps running during the post-victory epilogue too, see below
        updateBullets(deltaTime); // move the player's own bullets, remove expired ones -- also kept running post-victory, purely cosmetic once there's nothing left to hit
        if (!victoryActive) {
            // Wave/enemy simulation stops the instant the boss dies
            // (triggerVictory() sets victoryActive) -- without this
            // guard, updateEnemies() would notice waveEnemiesRemaining
            // is still 0 on EVERY subsequent frame and call
            // triggerVictory() again each time, endlessly re-arming its
            // reload timer so it would never actually fire.
            updateEnemies(deltaTime); // spawn/move/attack enemies, check player bullets against them
            updateEnemyBullets(deltaTime); // move enemy bullets, check them against the player
            updatePowerUps(deltaTime); // spawn/animate power-ups, pick up any the player is standing on
        }
    } else if (!gameStarted) {
        updateMenuPreview(deltaTime); // idle turntable + camera framing behind the main menu
    }
    // else: gameStarted && gamePaused -- render the frozen scene as-is,
    // no updates (see the pointerlockchange listener in init())

    // Re-applies whichever dimension (realistic/toon) is currently
    // active to every mesh in the scene -- unconditional and every
    // frame so anything spawned mid-toon-mode (a new bullet, enemy,
    // power-up) gets converted automatically instead of appearing in
    // the wrong style (see dimensionShift.js).
    syncSceneToCurrentDimension(scene);

    composer.render(); // draw the scene through the post-processing pipeline (bloom, etc.)
}

// Fire it up: build the scene once, wire up the menu, then start the loop
init();
initMenu();
animate();