import * as THREE from 'three';

// ============================================================
// DIMENSION SHIFT
// The game's core mechanic (see README): pressing TAB instantly swaps
// the WHOLE arena between two visual "dimensions" 
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
    // On the toon look the hemilight is a warm sunlit sky (light sky blue)
    hemiSky: 0x8fd3ff,
    // On the toon look the hemilight's ground color is a warm grassy green, giving the scene a more vibrant and lively feel.
    hemiGround: 0x6b8f4a,
    // The intensity of the hemilight on the toon look is duplicated from the realistic look to let the environment feel more like a bright sunny day
    hemiIntensity: 1.05,
    // The directional light on the toon look is a warm yellowish color, simulating sunlight and creating a more natural and inviting atmosphere.
    // On the realistic look the directional light is a cooler color, simulating moonlight and creating a more mysterious and eerie atmosphere.
    dirColor: 0xfff2d0,
    // The intensity of the directional light on the toon look is duplicated from the realistic look to maintain a consistent lighting environment
    dirIntensity: 1.5,
    // The sky gradient on the toon look is a bright blue at the top, fading to a lighter blue at the bottom, simulating a clear sunny day. This creates a more cheerful and uplifting atmosphere.
    skyTop: 0x2e8fe0,
    skyBottom: 0xcdeeff,
    // The color into which distant objects fade; during the day, it is a light haze.
    fogColor: 0xcdeeff,
    fogNear: 45,   // a bright clear day should read as seeing much further than a moody night, the fog will start further than the realistic look
    fogFar: 110 // Distance by which the fog is total
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
// is built around).
function createToonGradientMap() {

    // distinct light layers
    const steps = 4;

    // Create a small canvas (4x1) to draw the gradient for toon shading.
    const canvas = document.createElement('canvas');
    canvas.width = steps;
    canvas.height = 1;

    // Get the 2D drawing context of the canvas to draw the gradient.
    const ctx = canvas.getContext('2d');

    // Here we re filling the 4 pixels with 4 equidistant greys
    // rgb(0,0,0)
    // rgb(85,85,85)
    // rgb(170,170,170)
    // rgb(255,255,255)
    for (let i = 0; i < steps; i++) {

        // (i / (steps - 1)) scales the index in [0,1], divided by 3 so that the last index goes to 1
        const v = Math.round((i / (steps - 1)) * 255);
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;

        // Painting a rectangle 1x1 on column i row 0. (that pixel)
        ctx.fillRect(i, 0, 1, 1);
    }

    // Canvas in a texture so that the GPU can sample it
    const texture = new THREE.CanvasTexture(canvas);

    // When the GPU sample a texture in a coordinate that is in between two pixel we take the nearest pixel (without any gradient)

    // reduced texture
    texture.minFilter = THREE.NearestFilter;
    // enlarged texture 
    texture.magFilter = THREE.NearestFilter;

    // useless in our case
    texture.generateMipmaps = false;

    return texture;
}

// lookup table How enlightened you are -> what grey 
const toonGradientMap = createToonGradientMap();

// Builds a MeshToonMaterial that mirrors a MeshStandardMaterial's
// color/map/emissive -- deliberately does NOT carry over
// roughness/metalness/normalMap/roughnessMap, since dropping the PBR
// surface response entirely (flat color + banded lighting instead) is
// exactly what "toon" is supposed to look like next to "realistic".

// Takes as input an existing PBR material and create the toon version
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
// already-correct objects are a couple of cheap property
// checks and nothing else, so running this unconditionally every frame
// costs essentially nothing even with dozens of enemies/bullets alive.
export function syncSceneToCurrentDimension(scene) {

    // Traverse sees every node of the tree scene (mesh, lights,...)
    scene.traverse((object) => {

        // We have to change only the mesh
        if (!object.isMesh) return;

        // We retrieve the material
        const material = object.material;
        if (!material || Array.isArray(material)) return;

        // Custom shader materials (the skybox's gradient) aren't part of
        // the per-mesh shift -- toggleDimensionShift() repaints the sky
        // directly instead (see below).
        if (material.isShaderMaterial) return;

        if (isToonMode) {
            if (material.isMeshToonMaterial) return; // already converted, nothing to do

            // If we are here the material is not toon
            object.userData.realisticMaterial = material;

            // The first time that we are here we create the material
            if (!object.userData.toonMaterial) {
                object.userData.toonMaterial = buildToonMaterial(material);
            }

            // Set the toon material
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

// toon is a boolean, TRUE: toon, FALSE: realistic
function applyLook(toon) {
    const { renderer, bloomPass, renderPass, pixelatedPass, hemiLight, dirLight, sky, stars, fog } = refs;

    // Snapshot (only the first time)
    if (!realisticLook) {

        // Saved apart because is not a color 
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

    // what look we r currently in?
    const look = toon ? TOON_LOOK : realisticLook;

    // Renderer and post processing
    renderer.toneMapping = toon ? THREE.NoToneMapping : realisticToneMapping;
    bloomPass.enabled = !toon;
    renderPass.enabled = !toon;
    pixelatedPass.enabled = toon;

    // Lights
    hemiLight.color.setHex(look.hemiSky);
    hemiLight.groundColor.setHex(look.hemiGround);
    hemiLight.intensity = look.hemiIntensity;

    dirLight.color.setHex(look.dirColor);
    dirLight.intensity = look.dirIntensity;

    // Sky
    sky.material.uniforms.topColor.value.setHex(look.skyTop);
    sky.material.uniforms.bottomColor.value.setHex(look.skyBottom);

    // Fog
    fog.color.setHex(look.fogColor);
    fog.near = look.fogNear;
    fog.far = look.fogFar;

    // Stars
    stars.visible = !toon; // no stars in broad daylight
}

// Tries to flip the active dimension. Leaving toon (going back to
// realistic) is always allowed; ENTERING toon is refused while
// cooldownTimer is still running, so the bonus-damage/hidden-cache
// window (see TOON_DURATION above) can't just be left on permanently.
// Returns { success, isToonMode } -- main.js uses `success` to decide
// whether to show the shift flash or a "still on cooldown" denial cue.
export function toggleDimensionShift() {

    // You cannot shift from realistic if is not available
    if (!isToonMode && cooldownTimer > 0) {
        return { success: false, isToonMode };
    }

    // We invert the flag (Realistic -> Toon, Toon -> Realistic)
    isToonMode = !isToonMode;
    applyLook(isToonMode);

    // If we are just entered in toon mode
    if (isToonMode) {   
        // We apply the timer
        toonTimer = TOON_DURATION;
    } else { // You have just left the toon dimension
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

    // If we are in toonMode then we have to update the timer
    if (isToonMode) {
        toonTimer -= deltaTime;

        // The toon mode is elapsed
        if (toonTimer <= 0) {
            isToonMode = false;
            applyLook(false);
            // Reset the timer
            cooldownTimer = SHIFT_COOLDOWN;
        }
    } else if (cooldownTimer > 0) { // We are not in toonMode

        // We update the cooldown if is not 0
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

// isToonMode used to show (TOON or REALISTIC)
export function getDimensionShiftStatus() {
    return { isToonMode, toonTimer, cooldownTimer };
}

// Cheap boolean check for gameplay code that needs to know the current
// dimension but has no reason to import the whole status object (see
// the enemy damage multiplier in updateEnemies(), main.js).
export function isToonDimension() {
    return isToonMode;
}
