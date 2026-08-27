import * as THREE from 'three';

// ============================================================
// DIMENSION SHIFT
// The game's core mechanic (see README): pressing TAB instantly swaps
// the WHOLE arena between two visual "dimensions" --
//
//   - REALISTIC: the game's normal night-time PBR look 
//       -- ACES Filmic tone mapping, bloom, cool moonlit
//          lighting, starfield sky.
//   - TOON: a bright, saturated daytime COMIC-BOOK look -- flat cel-
//     shaded materials (banded lighting via a gradient map, no
//     roughness/metalness response, flat-shaded facets), warm sunlight
//     + blue sky instead of stars, and a pixelated render with thick
//     black ink outlines (via RenderPixelatedPass) instead of bloom.
//
// Rather than hand-building a second toon model/material for every
// single object, per-mesh materials are derived AUTOMATICALLY from
// whatever MeshStandardMaterial an object already has, the first time
// it's needed (see buildToonMaterial()/syncSceneToCurrentDimension()).
// Scene-level things that aren't "just a mesh material" -- the lights,
// the sky gradient, the fog, which render pass is active -- are handled
// directly in toggleDimensionShift() using the references handed in via
// initDimensionShift().
// ============================================================

// Toon isn't just a free reskin -- it's a timed tactical mode (bonus
// damage against enemies, see main.js's updateEnemies(); reveals
// dimension-locked power-ups, see powerups/DimensionCachePickup.js):
// TOON_DURATION seconds active, then an automatic revert and a longer
// SHIFT_COOLDOWN before you can shift again. Keeps it a deliberate
// "burst window" instead of something you'd just leave on forever.
const TOON_DURATION = 15;
const SHIFT_COOLDOWN = 25;

let isToonMode = false;
let toonTimer = 0;      // counts down while isToonMode is true
let cooldownTimer = 0;  // counts down while waiting to be allowed back into toon mode
let refs = null; // set once by initDimensionShift() -- renderer/passes/lights/sky/stars/fog

// The comic-book "day" look this shifts TO.
const TOON_LOOK = {
    hemiSky: 0x8fd3ff,
    hemiGround: 0x6b8f4a,
    hemiIntensity: 1.05,
    dirColor: 0xfff2d0,
    dirIntensity: 1.5,
    skyTop: 0x2e8fe0,
    skyBottom: 0xcdeeff,
    fogColor: 0xcdeeff,
    fogNear: 45,   // a bright clear day should read as seeing much further than a moody night
    fogFar: 110
};

// Cached the FIRST time toggleDimensionShift() runs, from whatever
// init() in main.js already set up -- so switching back to "realistic"
// always restores exactly what the scene looked like before Dimension
// Shift ever touched anything, with no duplicated magic numbers between
// the two files.
let realisticLook = null;
let realisticToneMapping = null;

// ---- per-mesh toon material derivation ----

// Small 4-step gradient (NOT smoothly interpolated -- NearestFilter is
// what actually produces the banded "cel-shading" look MeshToonMaterial
// is built around, instead of a soft gradient that would look almost
// identical to normal Lambert shading).
function createToonGradientMap() {
    const steps = 4;
    const canvas = document.createElement('canvas');
    canvas.width = steps;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < steps; i++) {
        const v = Math.round((i / (steps - 1)) * 255);
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
        ctx.fillRect(i, 0, 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return texture;
}

const toonGradientMap = createToonGradientMap();

// Builds a MeshToonMaterial that mirrors a MeshStandardMaterial's
// color/map/emissive -- deliberately does NOT carry over
// roughness/metalness/normalMap/roughnessMap, since dropping the PBR
// surface response entirely (flat color + banded lighting instead) is
// exactly what "toon" is supposed to look like next to "realistic".
function buildToonMaterial(src) {
    return new THREE.MeshToonMaterial({
        color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
        map: src.map || null,
        emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
        emissiveMap: src.emissiveMap || null,
        emissiveIntensity: src.emissiveIntensity ?? 1,
        gradientMap: toonGradientMap,
        transparent: src.transparent,
        opacity: src.opacity,
        alphaMap: src.alphaMap || null,
        flatShading: true // facets over smooth interpolation -- reads as "low-poly comic" even though the vertex count hasn't actually changed
    });
}

// Called every frame (see animate() in main.js): makes sure every mesh
// currently in `scene` matches whichever dimension is active right now.
// Idempotent -- already-correct objects are a couple of cheap property
// checks and nothing else, so running this unconditionally every frame
// costs essentially nothing even with dozens of enemies/bullets alive.
export function syncSceneToCurrentDimension(scene) {
    scene.traverse((object) => {
        if (!object.isMesh) return;
        const material = object.material;
        if (!material || Array.isArray(material)) return;
        // Custom shader materials (the skybox's gradient) aren't part of
        // the per-mesh shift -- toggleDimensionShift() repaints the sky
        // directly instead (see below).
        if (material.isShaderMaterial) return;

        if (isToonMode) {
            if (material.isMeshToonMaterial) return; // already converted, nothing to do
            object.userData.realisticMaterial = material;
            if (!object.userData.toonMaterial) {
                object.userData.toonMaterial = buildToonMaterial(material);
            }
            object.material = object.userData.toonMaterial;
        } else if (object.userData.realisticMaterial) {
            object.material = object.userData.realisticMaterial;
        }
    });
}

// Called once from init() (see main.js) after every object referenced
// below already exists -- stores them so toggleDimensionShift() doesn't
// need a long parameter list passed in on every single TAB press.
export function initDimensionShift(sceneRefs) {
    refs = sceneRefs;
}

// Repaints everything that ISN'T just a per-mesh material for whichever
// dimension `toon` says is now active: which render pass is active
// (pixelated+outlined vs the normal render), tone mapping/bloom, the
// sun/sky lights, the sky gradient, the fog, and the starfield's
// visibility. The per-mesh material swap itself happens via
// syncSceneToCurrentDimension() on the very next frame, not here.
function applyLook(toon) {
    const { renderer, bloomPass, renderPass, pixelatedPass, hemiLight, dirLight, sky, stars, fog } = refs;

    if (!realisticLook) {
        realisticToneMapping = renderer.toneMapping;
        realisticLook = {
            hemiSky: hemiLight.color.getHex(),
            hemiGround: hemiLight.groundColor.getHex(),
            hemiIntensity: hemiLight.intensity,
            dirColor: dirLight.color.getHex(),
            dirIntensity: dirLight.intensity,
            skyTop: sky.material.uniforms.topColor.value.getHex(),
            skyBottom: sky.material.uniforms.bottomColor.value.getHex(),
            fogColor: fog.color.getHex(),
            fogNear: fog.near,
            fogFar: fog.far
        };
    }

    const look = toon ? TOON_LOOK : realisticLook;

    renderer.toneMapping = toon ? THREE.NoToneMapping : realisticToneMapping;
    bloomPass.enabled = !toon;
    renderPass.enabled = !toon;
    pixelatedPass.enabled = toon;

    hemiLight.color.setHex(look.hemiSky);
    hemiLight.groundColor.setHex(look.hemiGround);
    hemiLight.intensity = look.hemiIntensity;

    dirLight.color.setHex(look.dirColor);
    dirLight.intensity = look.dirIntensity;

    sky.material.uniforms.topColor.value.setHex(look.skyTop);
    sky.material.uniforms.bottomColor.value.setHex(look.skyBottom);

    fog.color.setHex(look.fogColor);
    fog.near = look.fogNear;
    fog.far = look.fogFar;

    stars.visible = !toon; // no stars in broad daylight
}

// Tries to flip the active dimension. Leaving toon (going back to
// realistic) is always allowed; ENTERING toon is refused while
// cooldownTimer is still running, so the bonus-damage/hidden-cache
// window (see TOON_DURATION above) can't just be left on permanently.
// Returns { success, isToonMode } -- main.js uses `success` to decide
// whether to show the shift flash or a "still on cooldown" denial cue.
export function toggleDimensionShift() {
    if (!isToonMode && cooldownTimer > 0) {
        return { success: false, isToonMode };
    }

    isToonMode = !isToonMode;
    applyLook(isToonMode);

    if (isToonMode) {
        toonTimer = TOON_DURATION;
    } else {
        cooldownTimer = SHIFT_COOLDOWN;
    }

    return { success: true, isToonMode };
}

// Called every frame during active gameplay (see updateGame() in
// main.js): counts down the active toon window and the post-toon
// cooldown, auto-reverting to realistic the instant the window runs out
// (bypassing toggleDimensionShift()'s cooldown gate entirely, since
// LEAVING toon is always allowed).
export function updateDimensionShiftTimers(deltaTime) {
    if (isToonMode) {
        toonTimer -= deltaTime;
        if (toonTimer <= 0) {
            isToonMode = false;
            applyLook(false);
            cooldownTimer = SHIFT_COOLDOWN;
        }
    } else if (cooldownTimer > 0) {
        cooldownTimer = Math.max(0, cooldownTimer - deltaTime);
    }
}

// Forces an immediate, timer-free return to realistic mode -- used by
// the PLAY button handler in main.js so a fresh run never starts
// mid-toon-mode or already on cooldown from a previous run.
export function resetDimensionShift() {
    if (isToonMode) {
        isToonMode = false;
        applyLook(false);
    }
    toonTimer = 0;
    cooldownTimer = 0;
}

// Read-only status for the HUD (see main.js) -- current mode plus
// whichever timer is actually relevant right now.
export function getDimensionShiftStatus() {
    return { isToonMode, toonTimer, cooldownTimer };
}

// Cheap boolean check for gameplay code that needs to know the current
// dimension but has no reason to import the whole status object (see
// the enemy damage multiplier in updateEnemies(), main.js).
export function isToonDimension() {
    return isToonMode;
}
