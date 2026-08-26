import * as THREE from 'three';
import { Assault } from './playerClasses/Assault.js';
import { Sniper } from './playerClasses/Sniper.js';
import { Grunt } from './enemies/Grunt.js';
import { Shooter } from './enemies/Shooter.js';
import { Boss } from './enemies/Boss.js';
import { createEnvironment } from './environment.js';
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

// Every bullet currently flying through the arena. Each entry is a
// { mesh, velocity, age } object. We need our own array because
// Three.js doesn't track "your game objects" for you -- the scene
// just holds meshes, it has no concept of "bullet" or "enemy".
let bullets = [];

let shotCooldown = 0;          // counts down to 0, then the player can fire again

// --- Aim indicator ---
// A diegetic aiming aid: a thin beam + end marker showing exactly where
// the NEXT shot will land -- see createAimIndicator()/updateAimIndicator()
// below). Built once in init(), repositioned every frame in updateGame().
let aimBeam, aimMarker;

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
const enemySpawnInterval = 4;   // seconds between spawns
const maxConcurrentEnemies = 8; // hard cap on how many can be alive AT ONCE, regardless of wave size -- paces out even a big wave instead of dumping it all in one place
const arenaSpawnRadius = 22;    // just inside the movement boundary (limit = 24 in updateGame())

// --- Waves ---
// 9 regular waves of increasing size/difficulty, then a single boss
// (DOOMHORN, see enemies/Boss.js) on wave 10 -- see startWave().
// Enemy count per regular wave, tuned by hand rather than a formula so
// the pacing is easy to eyeball/adjust; index 0 = wave 1 ... index 8 = wave 9.
const waveSizes = [5, 6, 8, 9, 11, 12, 14, 15, 17];
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
    { Type: StrengthPickup, weight: 2 }
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
// The camera orbits the player at a constant distance, driven by yaw
// (left/right) and pitch (up/down) angles that the mouse updates.
let cameraYaw = 0;
let cameraPitch = Math.asin(0.6); // ~0.6435 rad
const cameraDistance = 10;
const mouseSensitivity = 0.0025;
const minPitch = 0.25; // radians (~14°) -- fairly level, avoids an almost-flat view
const maxPitch = 0.85; // radians (~49°) -- a comfortable "over the shoulder" max, avoids a jarring near-top-down swing

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
    playerGroup.userData.muzzle = gun.userData.muzzle; // barrel tip, used as the bullet spawn point
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
const pauseMenuEl = document.getElementById('pause-menu');
const victoryScreenEl = document.getElementById('victory-screen');
const waveValueEl = document.getElementById('wave-value');
const waveTotalEl = document.getElementById('wave-total');
waveTotalEl.textContent = totalWaves; // static -- set once, matches waveSizes.length + the boss wave
const waveBannerEl = document.getElementById('wave-banner');
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
        updateHealthUI();
        updateArmorUI();
        updateWeaponSelectorUI();
        startWave(1);
        gamePaused = false;
        pauseMenuEl.classList.add('hidden');
        gameOverEl.classList.add('hidden');
        victoryScreenEl.classList.add('hidden');
        aimBeam.visible = true;
        aimMarker.visible = true;
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

    // Victory's own way back in -- same reload-based reasoning as restart-button.
    document.getElementById('victory-button').addEventListener('click', () => {
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
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

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
    dirLight.shadow.camera.left = -32;
    dirLight.shadow.camera.right = 32;
    dirLight.shadow.camera.top = 32;
    dirLight.shadow.camera.bottom = -32;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.bias = -0.0015; // the much larger frustum above needs a bit of bias to avoid shadow-acne artifacts
    scene.add(dirLight);

    // Cool, low-intensity point light from the opposite side of the main
    // directional light 
    const fillLight = new THREE.PointLight(0x0088ff, 0.4, 60);
    fillLight.position.set(-18, 10, -18);
    scene.add(fillLight);

    // --- Post-processing ---
    // Runs the rendered frame through extra passes instead of drawing
    // straight to the screen (see animate()).
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

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
    environmentObstacles = createEnvironment(scene).obstacles;

    // --- Player ---
    player = createPlayer(playerClasses[currentClassIndex]);
    scene.add(player);

    createAimIndicator();
    createStrengthAura();

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

        cameraYaw -= e.movementX * mouseSensitivity;
        cameraPitch += e.movementY * mouseSensitivity; 
        // Clamp so the camera can't flip upside down or dive underground
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
        if (document.pointerLockElement !== renderer.domElement && gameStarted) {
            gamePaused = true;
            pauseMenuEl.classList.remove('hidden');
        }
    });

    // Keep the render correct if the browser window is resized
    window.addEventListener('resize', onWindowResize);
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
    if (key === ' ') {
        event.preventDefault(); // stop the browser from scrolling the page on spacebar
        // event.repeat is true when the browser auto-fires keydown while
        // a key is held. We only want ONE jump per physical press.
        if (isKeyDown && !event.repeat) {
            jump();
        }
    }
}

// True if a point at (x, z) -- with `entityRadius` added on top -- would
// overlap any environment obstacle (beacons, crates, see environment.js).
// Used to keep both the player (updateGame(), with playerCollisionRadius)
// and every enemy (updateEnemies()'s attackContext.checkObstacle, with
// that enemy's own hitRadius) from walking through them; same flat
// distance-check style as the bullet/enemy hit tests elsewhere, just
// against static circles instead of moving ones.
function collidesWithObstacle(x, z, entityRadius) {
    for (const obstacle of environmentObstacles) {
        const dx = x - obstacle.x;
        const dz = z - obstacle.z;
        if (Math.hypot(dx, dz) < obstacle.radius + entityRadius) return true;
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

    // Arena boundary: player can't walk past +/- 24 on X or Z
    const limit = 24;
    let nextX = player.position.x + moveX * currentSpeed;
    let nextZ = player.position.z + moveZ * currentSpeed;

    // Only apply the movement if it stays inside the boundary AND
    // doesn't walk the player into an obstacle (see collidesWithObstacle()
    // above). Resolved as two SEPARATE axis checks rather than one
    // combined (nextX, nextZ) check: that way, bumping into an obstacle
    // along one axis only cancels movement along that axis, so moving
    // diagonally into the corner of a crate slides you along its edge
    // instead of just stopping dead.
    if (nextX > -limit && nextX < limit && !collidesWithObstacle(nextX, player.position.z, playerCollisionRadius)) {
        player.position.x = nextX;
    }
    if (nextZ > -limit && nextZ < limit && !collidesWithObstacle(player.position.x, nextZ, playerCollisionRadius)) {
        player.position.z = nextZ;
    }

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

    updateAimIndicator(deltaTime); // redraw the aim beam/marker for wherever the next shot would actually go

    // --- Strength buff countdown ---
    if (strengthBuffTimer > 0) {
        strengthBuffTimer = Math.max(0, strengthBuffTimer - deltaTime);
        strengthBuffLineEl.classList.remove('hidden');
        strengthBuffTimerEl.textContent = Math.ceil(strengthBuffTimer);
        if (strengthBuffTimer === 0) strengthBuffLineEl.classList.add('hidden');
    }
    updateStrengthAura(deltaTime);

    updateCamera(); // keep camera locked to the player every frame
}

// ============================================================
// JUMP / GRAVITY
// Simple arcade physics, no physics engine needed:
// - jump() just gives the player an upward velocity, but only if
//   they're currently on the ground (no mid-air double jumps).
// - updateVerticalMovement() runs every frame: gravity constantly
//   pulls velocityY down, and velocityY moves the player up/down.
//   When the player reaches the ground again, we clamp position
//   back to y=0 and mark them as grounded.
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

    if (player.position.y <= 0) {
        player.position.y = 0;  // don't let the player fall through the floor
        velocityY = 0;
        isGrounded = true;
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

// ============================================================
// SHOOTING
// Delegates to the current weapon's own shoot() (see Weapon.js):
// it builds the bullet mesh, spawns it at the gun's muzzle, and
// aims it along the direction the camera is aiming (cameraYaw).
// player.rotation.y drives the LEGS (movement direction), while
// the torso/gun stay aimed at cameraYaw (see updateGame) -- so
// shooting always follows where you're actually aiming, not where
// you're walking.
// ============================================================
function shootBullet() {
    const weapon = player.userData.playerClass.weapons[currentWeaponIndex];
    const bulletEntry = weapon.shoot(scene, player.userData.muzzle, cameraYaw);
    // Strength buff (see powerups/StrengthPickup.js) temporarily hits harder.
    if (strengthBuffTimer > 0) bulletEntry.damage = Math.round(bulletEntry.damage * strengthDamageMultiplier);
    bullets.push(bulletEntry);
}

// Moves every active bullet forward and removes the ones that have
// existed longer than their own weapon's bulletLifetime, so the
// array (and the scene) don't grow forever.
function updateBullets(deltaTime) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.mesh.position.addScaledVector(b.velocity, deltaTime);
        b.age += deltaTime;

        if (b.age > b.lifetime) {
            scene.remove(b.mesh); // stop rendering it
            bullets.splice(i, 1); // remove it from our tracking array
        }
    }
}

// ============================================================
// AIM INDICATOR
// A diegetic aiming aid instead of a flat 2D crosshair: a thin glowing
// beam plus an end marker, both repositioned every frame along the
// EXACT same ray Weapon.shoot() actually fires along -- same origin
// (muzzle world position) and direction (cameraYaw), see Weapon.js.
// Because it's driven by the real shot math instead of a fixed screen
// position, it's always truthful about where the next bullet goes, and
// the marker flags a guaranteed hit before you even pull the trigger.
// ============================================================
function createAimIndicator() {
    // Unit-height cylinder, stretched via scale.y and rotated via
    // quaternion every frame to span from the muzzle to the impact
    // point (see updateAimIndicator()).
    const beamGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
    const beamMat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.5,
        depthWrite: false // a half-see-through beam shouldn't hide the enemy/marker it's pointing at
    });
    aimBeam = new THREE.Mesh(beamGeo, beamMat);
    aimBeam.frustumCulled = false; // its footprint changes every frame as it stretches -- skip culling rather than fight stale bounds
    aimBeam.visible = false; // shown once PLAY is pressed -- see the play-button handler
    scene.add(aimBeam);

    // Small glowing marker right at the impact point -- grows and turns
    // white when it currently lands on an enemy, a clear "this will hit"
    // signal at a glance, on top of just tracing the shot's path.
    const markerGeo = new THREE.OctahedronGeometry(0.12, 0);
    const markerMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 2.2 });
    aimMarker = new THREE.Mesh(markerGeo, markerMat);
    aimMarker.frustumCulled = false;
    aimMarker.visible = false;
    scene.add(aimMarker);
}

// Called every frame from updateGame(). Casts the same ray Weapon.shoot()
// would fire along, tests it against every enemy with the same
// ray-vs-circle math updateEnemies() uses for real bullet hits, then redraws the beam/marker to match.
function updateAimIndicator(deltaTime) {
    const weapon = player.userData.playerClass.weapons[currentWeaponIndex];

    const origin = new THREE.Vector3();
    player.userData.muzzle.getWorldPosition(origin);

    const dirX = Math.sin(cameraYaw);
    const dirZ = Math.cos(cameraYaw);

    // Never claims a longer reach than this weapon's own bullets actually
    // have (see Weapon.shoot()/updateBullets()), capped to the same ring
    // distance enemies spawn at (arenaSpawnRadius) so it never trails off
    // into empty space past where an enemy could even be standing.
    const maxDistance = Math.min(weapon.bulletSpeed * weapon.bulletLifetime, arenaSpawnRadius);

    let hitDistance = maxDistance;
    let hitEnemy = false;
    for (const enemy of enemies) {
        const ex = enemy.mesh.position.x - origin.x;
        const ez = enemy.mesh.position.z - origin.z;
        const t = ex * dirX + ez * dirZ; // distance along the ray to this enemy's closest approach
        if (t < 0 || t > hitDistance) continue;

        const perpDist = Math.hypot(ex - dirX * t, ez - dirZ * t);
        if (perpDist >= enemy.hitRadius) continue;

        // Back up from the closest-approach point to where the ray
        // actually enters the enemy's hit circle, so the marker sits on
        // its front edge instead of floating at its center.
        const entry = t - Math.sqrt(enemy.hitRadius * enemy.hitRadius - perpDist * perpDist);
        if (entry >= 0 && entry < hitDistance) {
            hitDistance = entry;
            hitEnemy = true;
        }
    }

    const endX = origin.x + dirX * hitDistance;
    const endZ = origin.z + dirZ * hitDistance;

    // Stretch+orient the unit cylinder so it spans exactly from the
    // muzzle to the impact point.
    aimBeam.position.set((origin.x + endX) / 2, origin.y, (origin.z + endZ) / 2);
    aimBeam.scale.set(1, hitDistance, 1);
    aimBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dirX, 0, dirZ));

    aimMarker.position.set(endX, origin.y, endZ);
    aimMarker.rotation.y += deltaTime * 2.5; // slow tumble -- reads as an active "scanner", not a static decal
    aimMarker.rotation.x += deltaTime * 1.6;
    aimMarker.scale.setScalar(hitEnemy ? 1.6 : 1);

    // Same color/emissive pairing as the real bullet mesh (see
    // Weapon.createBulletMesh()) -- the beam and marker always match
    // whatever's actually about to be fired. Flips to plain white on a
    // confirmed hit as an extra "locked on" cue on top of the size bump.
    aimBeam.material.color.setHex(weapon.bulletColor);
    aimBeam.material.emissive.setHex(weapon.bulletEmissive);
    aimMarker.material.color.setHex(hitEnemy ? 0xffffff : weapon.bulletColor);
    aimMarker.material.emissive.setHex(hitEnemy ? 0xffffff : weapon.bulletEmissive);
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

// Picks a random enemy type and drops it at a random point on a ring
// just inside the arena boundary, so enemies visibly walk in from the
// edges instead of popping up next to the player. Stats scale up a
// little every wave (see `scale` below) so later waves are tougher, not
// just more crowded.
function spawnEnemy() {
    // More Shooters mixed in as the waves progress (30% -> up to 55%),
    // so later waves bring more ranged pressure instead of just more
    // Grunts rushing in the same way.
    const shooterChance = Math.min(0.3 + currentWave * 0.03, 0.55);
    const enemy = Math.random() < shooterChance ? new Shooter() : new Grunt();

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
    const attackContext = {
        dealDamageToPlayer: damagePlayer,
        spawnEnemyBullet: (entry) => enemyBullets.push(entry),
        playerPosition: player.position,
        checkObstacle: collidesWithObstacle, // lets Enemy.update() (enemies/Enemy.js) avoid crates/pillars, same check the player's own movement uses
        scene
    };

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.update(deltaTime, player.position, attackContext);

        // Player bullets vs. this enemy: a simple XZ-plane distance check
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            const dx = b.mesh.position.x - enemy.mesh.position.x;
            const dz = b.mesh.position.z - enemy.mesh.position.z;
            if (Math.hypot(dx, dz) < enemy.hitRadius) {
                scene.remove(b.mesh);
                bullets.splice(j, 1);

                if (enemy.takeDamage(b.damage)) {
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
// distance-check style as above), and removes it on a hit or once it
// outlives its lifetime.
function updateEnemyBullets(deltaTime) {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.mesh.position.addScaledVector(b.velocity, deltaTime);
        b.age += deltaTime;

        const dx = b.mesh.position.x - player.position.x;
        const dz = b.mesh.position.z - player.position.z;
        const hitPlayer = Math.hypot(dx, dz) < 0.6; // rough player hit radius

        if (hitPlayer || b.age > b.lifetime) {
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
        const x = (Math.random() * 2 - 1) * 20;
        const z = (Math.random() * 2 - 1) * 20;
        if (!collidesWithObstacle(x, z, 0.5)) return { x, z };
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
    aimBeam.visible = false;
    aimMarker.visible = false;
    strengthAura.visible = false;
    gameOverEl.classList.remove('hidden');
}

// Same idea as triggerGameOver(), but for actually winning -- called
// from updateEnemies() once the boss (wave 10) is defeated. PLAY AGAIN
// just reloads the page, same reasoning as RESTART.
function triggerVictory() {
    gameStarted = false;
    gamePaused = false;
    pauseMenuEl.classList.add('hidden');
    document.exitPointerLock();
    uiOverlayEl.style.display = 'none';
    hudBottomRightEl.style.display = 'none';
    bossBarContainerEl.classList.add('hidden');
    aimBeam.visible = false;
    aimMarker.visible = false;
    strengthAura.visible = false;
    victoryScreenEl.classList.remove('hidden');
}

// ============================================================
// CAMERA — mouse-controlled, follows behind the player.
// Since player.rotation.y is also set to cameraYaw (see updateGame),
// the character's "front" direction is (sin(yaw), cos(yaw)) -- so we
// use the NEGATIVE of that for the camera offset, placing it on the
// opposite side (behind the character), looking the way they face.
// ============================================================
function updateCamera() {
    const offsetX = -cameraDistance * Math.sin(cameraYaw) * Math.cos(cameraPitch);
    const offsetY = cameraDistance * Math.sin(cameraPitch);
    const offsetZ = -cameraDistance * Math.cos(cameraYaw) * Math.cos(cameraPitch);

    camera.position.set(
        player.position.x + offsetX,
        player.position.y + offsetY,
        player.position.z + offsetZ
    );
    camera.lookAt(player.position.x, player.position.y + 0.9, player.position.z); // aim slightly above the feet, roughly chest height
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
        updateGame(deltaTime); // move player, update camera
        updateBullets(deltaTime); // move active bullets, remove expired ones
        updateEnemies(deltaTime); // spawn/move/attack enemies, check player bullets against them
        updateEnemyBullets(deltaTime); // move enemy bullets, check them against the player
        updatePowerUps(deltaTime); // spawn/animate power-ups, pick up any the player is standing on
    } else if (!gameStarted) {
        updateMenuPreview(deltaTime); // idle turntable + camera framing behind the main menu
    }
    // else: gameStarted && gamePaused -- render the frozen scene as-is,
    // no updates (see the pointerlockchange listener in init())

    composer.render(); // draw the scene through the post-processing pipeline (bloom, etc.) 
}

// Fire it up: build the scene once, wire up the menu, then start the loop
init();
initMenu();
animate();