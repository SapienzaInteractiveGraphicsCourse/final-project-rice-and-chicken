import * as THREE from 'three';

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

let player, ground;            // References to the objects we'll move/interact with

// Tracks which movement keys are currently held down.
// Instead of reacting once per keypress, we check this every frame,
// so movement is smooth and multiple keys can be held at once.
const keys = { w: false, a: false, s: false, d: false };

// True while the left mouse button is held down -> continuous fire.
let isMouseDown = false;

// Every bullet currently flying through the arena. Each entry is a
// { mesh, velocity, age } object. We need our own array because
// Three.js doesn't track "your game objects" for you -- the scene
// just holds meshes, it has no concept of "bullet" or "enemy".
let bullets = [];

let shotCooldown = 0;          // counts down to 0, then the player can fire again
const fireRate = 0.2;          // seconds between shots (lower = faster fire rate)
const bulletSpeed = 40;        // units per second
const bulletLifetime = 1.5;    // seconds before a bullet is removed, even if it hit nothing

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
// GUN MODEL
// A small hierarchy of its own, built from simple primitives laid
// out along the local Z axis (front = +Z, same "forward" convention
// as the rest of the player).


// All parts are added to one Group so the whole gun can be positioned
// and carried by the hand as a single unit (see createPlayer()).
// ============================================================
function createGun() {
    const gunGroup = new THREE.Group();

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.35, metalness: 0.75 });
    const metalMatLight = new THREE.MeshStandardMaterial({ color: 0x33333d, roughness: 0.4, metalness: 0.6 }); // slightly lighter, for the magazine
    // Emissive strip = glows on its own regardless of scene lighting.
    // Color matches the player's teal accent, ties the weapon visually
    // to the character and hints at "sci-fi energy" tech.
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x003322, emissive: 0x00ffcc, emissiveIntensity: 2 });

    // --- Stock (rear, braces against the shoulder) ---
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.22), metalMat);
    stock.position.set(0, -0.01, -0.19); // slightly lower than the receiver, angled look without actual rotation
    stock.castShadow = true;
    gunGroup.add(stock);

    // --- Receiver (main body, houses the mechanism) ---
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.35), metalMat);
    receiver.position.set(0, 0, 0.1);
    receiver.castShadow = true;
    gunGroup.add(receiver);

    // --- Handguard (covers the rear part of the barrel) ---
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.25), metalMatLight);
    handguard.position.set(0, -0.01, 0.4);
    handguard.castShadow = true;
    gunGroup.add(handguard);

    // --- Barrel (thin cylinder, extends past the handguard) ---
    const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8);
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.rotation.x = Math.PI / 2; // cylinders default to standing on Y -- rotate 90° to point along Z (forward)
    barrel.position.set(0, 0.01, 0.68);
    barrel.castShadow = true;
    gunGroup.add(barrel);

    // --- Muzzle marker ---
    // An empty Object3D (no geometry, never rendered) placed exactly at
    // the barrel's tip: barrel center z=0.68, half-length 0.175 -> tip
    // at z=0.855. This is the point bullets should actually spawn from,
    // as opposed to gunGroup's own origin (which sits back near the grip).
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.01, 0.855);
    gunGroup.add(muzzle);
    gunGroup.userData.muzzle = muzzle; // so createPlayer() can grab it below

    // --- Magazine ---
    // The AK-47's signature trait: a magazine that curves forward and
    // down instead of hanging straight. We fake the curve cheaply with
    // a single rotated box rather than modeling an actual curved mesh --
    // reads correctly from a normal play-camera distance.
    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.09), metalMatLight);
    magazine.position.set(0, -0.19, 0.08);
    magazine.rotation.x = 0.35; // tilts the bottom of the magazine forward
    magazine.castShadow = true;
    gunGroup.add(magazine);

    // --- Pistol grip ---
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.08), metalMat);
    grip.position.set(0, -0.13, -0.05);
    grip.rotation.x = -0.2; // angled back slightly, like a real grip
    grip.castShadow = true;
    gunGroup.add(grip);

    // --- Sci-fi energy strip ---
    // Thin glowing accent along the top of the receiver -- the "modified"
    // sci-fi touch that separates this from a plain realistic AK-47.
    const energyStrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.3), glowMat);
    energyStrip.position.set(0, 0.075, 0.1); // sits right on top of the receiver
    gunGroup.add(energyStrip);

    return gunGroup;
}

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
function createPlayer() {
    const playerGroup = new THREE.Group(); // an empty container, just holds child objects

    // --- Torso ---
    // Height stays such that the bottom still sits at y=0.6, so the
    // legs below don't need to change length.
    const torsoGeo = new THREE.BoxGeometry(0.7, 0.9, 0.45); // width, height, depth
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, roughness: 0.2 });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.05; // half-height (0.45) above the legs' top (0.6) -> 1.05
    torso.castShadow = true;
    playerGroup.add(torso);

    // --- Head ---
    const headGeo = new THREE.SphereGeometry(0.28, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.62; // torso half-height (0.45) + most of the head radius, small overlap = no visible gap/neck seam
    head.castShadow = true;
    torso.add(head); // head is a CHILD of torso, not of playerGroup

    // --- Backpack ---
    // Small sci-fi detail on the back. Child of the torso, so it
    // automatically follows the torso's rotation (stays "on the back"
    // no matter which way the player is facing).
    // Positioned on the -Z side because that's the model's local "back"
    // (rotation.y = 0 means facing +Z, see updateGame's atan2 logic).
    const backpackGeo = new THREE.BoxGeometry(0.45, 0.5, 0.2);
    const backpackMat = new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.4, metalness: 0.6 }); 
    const backpack = new THREE.Mesh(backpackGeo, backpackMat);
    backpack.position.set(0, 0.05, -(0.225 + 0.1)); // just behind the torso's back face, no z-fighting overlap
    backpack.castShadow = true;
    torso.add(backpack);

    // --- Arms ---
    const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.18);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, roughness: 0.2 });

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.44, 0.15, 0); // relative to torso: left side, near shoulder height
    leftArm.castShadow = true;
    torso.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.44, 0.15, 0); // mirrored on the right side
    rightArm.castShadow = true;
    torso.add(rightArm);

    // --- Gun ---
    // Built by createGun() as its own small Group of parts, then attached
    // as a child of the RIGHT ARM (not the torso), so it's carried by the
    // hand: it follows both the torso's rotation AND the arm's own
    // walk-cycle swing. Position is relative to the arm's local origin.
    // The arm is a vertical box (height 0.7) hanging down, so "the hand"
    // is roughly its bottom end -> y = -0.35 (half the arm's height).
    const gun = createGun();
    gun.position.set(0, -0.35, 0.25); // at the hand, extending forward (+Z = local "front")
    rightArm.add(gun);

    // --- Legs ---
    // Added as children of playerGroup (not torso): the torso still
    // sits with its bottom at y=0.6, so the legs fill the gap from
    // the ground (y=0) up to that point -> height 0.6, centered at y=0.3.
    const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x009980, roughness: 0.2 }); // slightly darker than torso, for contrast

    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.16, 0.3, 0);
    leftLeg.castShadow = true;
    playerGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.16, 0.3, 0);
    rightLeg.castShadow = true;
    playerGroup.add(rightLeg);

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

    return playerGroup;
}


// ============================================================
// INIT — runs once at the start. Sets up everything needed
// before the game loop can begin.
// ============================================================
function init() {

    // --- Scene setup ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510); 

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
    document.body.appendChild(renderer.domElement); // add the <canvas> to the page

    // --- Lights ---
    // AmbientLight: uniform light with no direction, no shadows.
    // Simulates indirect/bounced light so shadowed areas aren't pure black.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // color, intensity
    scene.add(ambientLight);

    // DirectionalLight: parallel rays, like sunlight. Has a direction
    // (from its position toward the origin/target) and CAN cast shadows.
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    // Shadow map resolution: higher = sharper shadows but more GPU cost
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // --- Ground Plane ---
    const groundGeo = new THREE.PlaneGeometry(50, 50); // flat 50x50 square
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.8 });
    ground = new THREE.Mesh(groundGeo, groundMat); // Mesh = geometry + material combined
    ground.rotation.x = -Math.PI / 2; // planes are created facing up (Z axis) by default,
                                       // this rotates it flat so it lies on the XZ plane (the "floor")
    ground.receiveShadow = true; // this object can show shadows cast onto it
    scene.add(ground);

    // --- Player ---
    player = createPlayer();
    scene.add(player);

    updateCamera(); // position the camera correctly before the first frame renders

    // --- Event Listeners ---
    // Keyboard input: update the `keys` object whenever a key goes down/up
    window.addEventListener('keydown', (e) => handleKeyboard(e, true));
    window.addEventListener('keyup', (e) => handleKeyboard(e, false));
    // Mouse input: left button held down = firing
    window.addEventListener('mousedown', (e) => { if (e.button === 0) isMouseDown = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) isMouseDown = false; });

    // Pointer Lock: clicking the canvas hides the cursor and switches
    // mouse movement to "relative" mode (movementX/movementY deltas
    // instead of absolute screen position) 
    renderer.domElement.addEventListener('click', () => {
        renderer.domElement.requestPointerLock();
    });

    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== renderer.domElement) return;

        cameraYaw -= e.movementX * mouseSensitivity;
        cameraPitch += e.movementY * mouseSensitivity; 
        // Clamp so the camera can't flip upside down or dive underground
        cameraPitch = Math.max(minPitch, Math.min(maxPitch, cameraPitch));
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
    if (key === ' ') {
        event.preventDefault(); // stop the browser from scrolling the page on spacebar
        // event.repeat is true when the browser auto-fires keydown while
        // a key is held. We only want ONE jump per physical press.
        if (isKeyDown && !event.repeat) {
            jump();
        }
    }
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
    // so speed stays consistent no matter the frame rate.
    const currentSpeed = baseSpeed * deltaTime;

    // Arena boundary: player can't walk past +/- 24 on X or Z
    const limit = 24;
    let nextX = player.position.x + moveX * currentSpeed;
    let nextZ = player.position.z + moveZ * currentSpeed;

    // Only apply the movement if it stays inside the boundary
    if (nextX > -limit && nextX < limit) player.position.x = nextX;
    if (nextZ > -limit && nextZ < limit) player.position.z = nextZ;

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
    // left mouse button is held) we fire and reset it to fireRate.
    // This gives a controlled, steady fire rate instead of one bullet
    // per frame (which at 60-144fps would be absurdly fast).
    shotCooldown -= deltaTime;
    if (isMouseDown && shotCooldown <= 0) {
        shootBullet();
        shotCooldown = fireRate;
    }

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
// Spawns a small glowing sphere at the gun's muzzle, moving in
// the direction the camera is aiming (cameraYaw).
// ============================================================
function shootBullet() {
    const bulletGeo = new THREE.SphereGeometry(0.08, 8, 8);
    // emissive = the material "glows" with its own color, independent
    // of scene lighting -- makes it read clearly as a laser/energy shot.
    const bulletMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xff6600,
        emissiveIntensity: 2
    });
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);

    // getWorldPosition() converts the muzzle's LOCAL position (relative to
    // the barrel/gun/hand/arm/torso chain) into a single world-space
    // (x, y, z) -- exactly the point at the tip of the barrel, where we
    // want the bullet to actually appear.
    const spawnPos = new THREE.Vector3();
    player.userData.muzzle.getWorldPosition(spawnPos);
    bullet.position.copy(spawnPos);

    // Forward direction from the AIM angle --
    // player.rotation.y drives the LEGS (movement direction), while
    // the torso/gun stay aimed at cameraYaw (see updateGame). Shooting
    // should always follow where you're actually aiming.
    const angle = cameraYaw;
    const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));

    bullet.castShadow = true;
    scene.add(bullet);

    bullets.push({
        mesh: bullet,
        velocity: direction.multiplyScalar(bulletSpeed),
        age: 0
    });
}

// Moves every active bullet forward and removes the ones that have
// existed longer than bulletLifetime, so the array (and the scene)
// don't grow forever.
function updateBullets(deltaTime) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.mesh.position.addScaledVector(b.velocity, deltaTime);
        b.age += deltaTime;

        if (b.age > bulletLifetime) {
            scene.remove(b.mesh); // stop rendering it
            bullets.splice(i, 1); // remove it from our tracking array
        }
    }
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

    updateGame(deltaTime); // move player, update camera
    updateBullets(deltaTime); // move active bullets, remove expired ones

    renderer.render(scene, camera); // actually draw everything to the canvas
}

// Fire it up: build the scene once, then start the loop
init();
animate();