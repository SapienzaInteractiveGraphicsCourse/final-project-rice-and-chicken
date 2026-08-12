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

// THREE.Clock lets us measure how much real time passed between frames.
// This is called "Delta Time" and is used below to make movement
// speed independent of frame rate (so the game runs at the same
// speed on a 60Hz and a 144Hz screen).
const clock = new THREE.Clock();
const baseSpeed = 12; // units per second the player moves


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

    // --- Player (temporary placeholder shape, to be replaced later) ---
    const playerGeo = new THREE.BoxGeometry(1, 2, 1); // width, height, depth
    const playerMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, roughness: 0.2 });
    player = new THREE.Mesh(playerGeo, playerMat);
    player.position.y = 1; // lifts the box so its BOTTOM sits on the ground (half of height=2)
    player.castShadow = true; // this object casts shadows onto other objects (like the ground)
    scene.add(player);

    updateCamera(); // position the camera correctly before the first frame renders

    // --- Event Listeners ---
    // Keyboard input: update the `keys` object whenever a key goes down/up
    window.addEventListener('keydown', (e) => handleKeyboard(e, true));
    window.addEventListener('keyup', (e) => handleKeyboard(e, false));
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
}

// ============================================================
// GAME LOGIC — runs every single frame.
// Reads current input state and moves the player accordingly.
// ============================================================
function updateGame(deltaTime) {
    let moveX = 0;
    let moveZ = 0;

    // Build a movement direction vector from whichever keys are held.
    if (keys.w) moveZ -= 1;
    if (keys.s) moveZ += 1;
    if (keys.a) moveX -= 1;
    if (keys.d) moveX += 1;

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

    // Rotate the player to visually face the direction they're moving.
    // atan2(x, z) gives the angle of the movement vector around the Y axis.
    if (moveX !== 0 || moveZ !== 0) {
        const targetRotation = Math.atan2(moveX, moveZ);
        player.rotation.y = targetRotation;
    }

    updateCamera(); // keep camera locked to the player every frame
}

// ============================================================
// CAMERA — fixed isometric-style "chase" camera.
// Every frame, snap the camera to a fixed offset above/behind
// the player, and point it at the player.
// ============================================================
function updateCamera() {
    camera.position.set(player.position.x, player.position.y + 6, player.position.z + 8);
    camera.lookAt(player.position);
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

    renderer.render(scene, camera); // actually draw everything to the canvas
}

// Fire it up: build the scene once, then start the loop
init();
animate();