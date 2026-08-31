import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ============================================================
// ENVIRONMENT
// Everything that makes the arena read as a PLACE 
// ============================================================

const BOUNDARY = 32;           // matches the movement clamp in updateGame() (main.js)
const WALL_DISTANCE = 33.5;    // just outside BOUNDARY so the player's own model never clips into the wall mesh
const GROUND_HALF_SIZE = 36;   // extends a little past the walls so there's no visible gap/void at their base

// How high (in world Y) the player can actually jump -- see jumpForce/
// gravity in main.js: v^2 / (2*|g|) = 100/50 = 2.0 units. Every
// jump-platform below is built well under this so clearing one is
// reliable, not a pixel-perfect edge case.
const MAX_JUMP_HEIGHT = 2.0;

// Small tileable canvas texture: dark panel base + a bright teal grid
// line per cell
function createGridTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1c2036'; 
    ctx.fillRect(0, 0, size, size);

    // Faint inner subdivision first, so the brighter cell border draws on top
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 16); // ~4.5-unit cells across the now-72-unit ground
    texture.colorSpace = THREE.SRGBColorSpace; // this is a color/diffuse map, unlike normal/roughness maps
    return texture;
}

function createGround(scene) {
    const groundGeo = new THREE.PlaneGeometry(GROUND_HALF_SIZE * 2, GROUND_HALF_SIZE * 2);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x2a2f4a, 
        roughness: 0.8,
        map: createGridTexture()
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2; // planes face up (Z) by default -- rotate flat onto the XZ plane
    ground.receiveShadow = true;
    scene.add(ground);
    return ground;
}

// Low wall ring right at the arena's actual boundary 
function createPerimeterWalls(scene) {
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x2c2c3d, roughness: 0.6, metalness: 0.4 }); 
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x003322, emissive: 0x00ffcc, emissiveIntensity: 1.4 });

    const wallHeight = 2.2;
    const wallThickness = 0.6;
    // Slightly longer than the boundary span so adjacent walls overlap a
    // little at the corners instead of leaving a gap.
    const segmentLength = WALL_DISTANCE * 2 + wallThickness;

    function addWall(x, z, rotationY) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(segmentLength, wallHeight, wallThickness), panelMat);
        wall.position.set(x, wallHeight / 2, z);
        wall.rotation.y = rotationY;
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);

        const trim = new THREE.Mesh(new THREE.BoxGeometry(segmentLength, 0.12, wallThickness + 0.05), trimMat);
        trim.position.set(x, wallHeight + 0.06, z);
        trim.rotation.y = rotationY;
        scene.add(trim);
    }

    addWall(0, -WALL_DISTANCE, 0);              // north
    addWall(0, WALL_DISTANCE, 0);               // south
    addWall(-WALL_DISTANCE, 0, Math.PI / 2);    // west
    addWall(WALL_DISTANCE, 0, Math.PI / 2);     // east
}

// A pillar + glowing sphere + a real point light at each corner --
// landmarks that make the four corners visually distinct (useful for
// orientation) and add some warm accent light against the otherwise
// cool teal/blue palette everywhere else.
// Returns one {x, z, radius, height} collision circle per pillar (see
// collidesWithObstacle() in main.js) -- radius is a bit larger than the
// pillar's own base (0.45) to leave room for the glow sphere on top.
// `height` (unlike crates/platforms' `topY`) doesn't mark a climbable
// surface -- these aren't jumpable -- it's just how tall a solid body
// bullets need to check against (see bulletBlockedByObstacle() in main.js).
function createCornerBeacons(scene) {
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x33333f, roughness: 0.5, metalness: 0.5 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3344, emissiveIntensity: 2.5 });

    const pillarHeight = 4.5;
    const corners = [
        [WALL_DISTANCE, WALL_DISTANCE], [WALL_DISTANCE, -WALL_DISTANCE],
        [-WALL_DISTANCE, WALL_DISTANCE], [-WALL_DISTANCE, -WALL_DISTANCE]
    ];

    const obstacles = [];
    for (const [x, z] of corners) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, pillarHeight, 8), pillarMat);
        pillar.position.set(x, pillarHeight / 2, z);
        pillar.castShadow = true;
        scene.add(pillar);

        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), glowMat);
        beacon.position.set(x, pillarHeight + 0.2, z);
        scene.add(beacon);

        const beaconLight = new THREE.PointLight(0xff3344, 6, 16);
        beaconLight.position.set(x, pillarHeight + 0.2, z);
        scene.add(beaconLight);

        obstacles.push({ x, z, radius: 0.5, height: pillarHeight });
    }
    return obstacles;
}

// A handful of hand-placed crates scattered around the arena -- pure
// set dressing (no collision, same as everything else in this project
// that isn't the player/enemy hit-radius checks), just enough visual
// clutter that the floor doesn't read as one huge empty square. Also
// climbable, same as the dedicated jump-platforms above (their own
// height is well within jump range -- see MAX_JUMP_HEIGHT -- but a
// crate's random size can land right at the edge of it, or just past;
// that's fine, it just means not every crate is reachable). Returns one
// {x, z, radius, topY} collision circle per crate -- radius is the
// box's half-diagonal, so the circle fully contains its footprint no
// matter which way the crate's random yaw rotation points its corners
// (see collidesWithObstacle() in main.js); topY is what actually lets
// the player walk freely once standing on top instead of still being
// blocked by the crate's own base (the "invisible wall" this used to
// have before topY existed here).
function createProps(scene) {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a4632, roughness: 0.7, metalness: 0.2 }); 
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0xffaa00, emissiveIntensity: 1.2 });

    const cratePositions = [
        [8, 6], [8.8, 8.4], [-10, -5], [-9, 4.2], [5, -12],
        [-14, 12], [13, -8], [-6, 15], [16, 3], [-17, -10],
        // Extra crates further out, filling the space the wider arena
        // (see BOUNDARY above) opened up.
        [24, 18], [-24, 20], [22, -22], [-22, -18], [2, 26], [-2, -27]
    ];

    const obstacles = [];
    for (const [x, z] of cratePositions) {
        const size = 1.3 + Math.random() * 0.7;

     
        const crate = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 2, size * 0.06), crateMat);
        crate.position.set(x, size / 2, z);
        crate.rotation.y = Math.random() * Math.PI;
        crate.castShadow = true;
        crate.receiveShadow = true;
        scene.add(crate);

        // Warning stripe on one face -- child of the crate, so it's
        // carried along by that random rotation instead of needing its
        // own placement math.
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(size * 0.9, size * 0.12, 0.03), stripeMat);
        stripe.position.set(0, 0, size / 2 + 0.001);
        crate.add(stripe);

        obstacles.push({ x, z, radius: (size / 2) * Math.SQRT2, topY: size });
    }
    return obstacles;
}

// A thin glowing square outline right at a surface's edge -- same
// technique for both the jump-platforms below and (conceptually) the
// arena walls' own trim: four short boxes instead of a proper polygon
// outline, cheap and reads clearly from a normal play distance. Used
// here to mark a platform's top as "this one is walkable", something
// a plain crate doesn't advertise.
function addTopRimTrim(scene, x, y, z, halfSize, color) {
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x0a0a12, emissive: color, emissiveIntensity: 1.8 });
    const t = 0.08;
    function seg(sx, sz, w, d) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), trimMat);
        mesh.position.set(sx, y, sz);
        scene.add(mesh);
    }
    seg(x, z - halfSize, halfSize * 2 + t, t);
    seg(x, z + halfSize, halfSize * 2 + t, t);
    seg(x - halfSize, z, t, halfSize * 2 + t);
    seg(x + halfSize, z, t, halfSize * 2 + t);
}

// A handful of climbable platforms -- unlike the crates above (pure
// horizontal obstacles), these are boxes the player can actually JUMP
// ON TOP OF: they still block horizontal movement like a crate does,
// but also carry a `topY` -- see collidesWithObstacle()/
// getGroundHeightAt() below and in main.js, which is what lets the
// player's own collision check ignore a platform once they're standing
// above its top, and what tells updateVerticalMovement() (main.js) to
// treat that top as solid ground instead of just falling straight
// through it. Deliberately only SOME objects in the arena work this way
// (a plain crate stays a plain crate) -- the glowing top rim is the
// visual cue telling them apart.
function createJumpPlatforms(scene) {
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.55, metalness: 0.4 });
    const obstacles = [];

    // { x, z, size (width/depth), height, color }
    const platforms = [
        { x: 12, z: 12, size: 3.2, height: 1.5, color: 0x00ffcc },
        { x: -15, z: -6, size: 3.6, height: 1.3, color: 0x00ffcc },
        { x: 20, z: -4, size: 3, height: 1.6, color: 0xffaa00 },
        { x: -6, z: 20, size: 3.4, height: 1.4, color: 0xffaa00 },
        { x: -20, z: 14, size: 3, height: 1.5, color: 0xbb66ff },
        { x: 4, z: -20, size: 3.2, height: 1.3, color: 0xbb66ff }
    ];

    for (const p of platforms) {
        const platform = new THREE.Mesh(new RoundedBoxGeometry(p.size, p.height, p.size, 2, 0.08), platformMat);
        platform.position.set(p.x, p.height / 2, p.z);
        platform.castShadow = true;
        platform.receiveShadow = true;
        scene.add(platform);

        addTopRimTrim(scene, p.x, p.height + 0.03, p.z, p.size / 2, p.color);

        // radius slightly bigger than half the box so a straight-on
        // approach doesn't feel like it clips the corners -- same
        // reasoning as the crates' own collision circle above, just a
        // tighter multiplier since these aren't randomly rotated.
        obstacles.push({ x: p.x, z: p.z, radius: (p.size / 2) * 1.15, topY: p.height });
    }

    return obstacles;
}

// Shared by the player (updateVerticalMovement() in main.js) -- the
// highest climbable surface at (x, z) that's still reachable from
// `currentY` (i.e. not a top floating above where the player currently
// is). Checks every obstacle with a `topY`, which is both the dedicated
// jump-platforms above AND the regular crates (see createProps()) --
// anything without one (beacons, pillars) simply never has a walkable
// top. Falls back to 0 (the main ground) if nothing qualifies, same as
// if there were no climbable obstacles at all.
export function getGroundHeightAt(obstacles, x, z, currentY) {
    let best = 0;
    for (const o of obstacles) {
        if (o.topY === undefined) continue; // not a climbable platform -- plain crates/beacons don't have a walkable top
        const dx = x - o.x;
        const dz = z - o.z;
        if (Math.hypot(dx, dz) > o.radius) continue;
        if (o.topY <= currentY + 0.6 && o.topY > best) best = o.topY;
    }
    return best;
}

// Used by enemies (see Enemy.js's update()) to decide whether to JUMP
// over something blocking their path instead of just steering around
// it like before: unlike getGroundHeightAt() above, this ignores the
// caller's current height entirely and just answers "is there a
// climbable top at (x, z), and how high is it" -- exactly what's
// needed to decide BEFORE jumping, whereas getGroundHeightAt() is for
// landing/gravity once already airborne. Returns null if nothing
// climbable overlaps that point (a plain crate/pillar's own wall,
// or just empty ground).
export function getClimbableHeightAt(obstacles, x, z) {
    let best = null;
    for (const o of obstacles) {
        if (o.topY === undefined) continue;
        const dx = x - o.x;
        const dz = z - o.z;
        if (Math.hypot(dx, dz) > o.radius) continue;
        if (best === null || o.topY > best) best = o.topY;
    }
    return best;
}

const SKY_HORIZON_COLOR = 0x050510; // matches the fog color below so the ground fades seamlessly into the sky at the horizon

// A large inverted sphere with a vertical gradient (dark navy near the
// top, fading to the fog color at the horizon) instead of a flat
// scene.background color, plus a scattering of distant points for
// stars. Built from a custom GLSL shader rather than a downloaded
// HDRI/skybox image
function createSkybox(scene) {
    const skyGeo = new THREE.SphereGeometry(400, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        fog: false, // this IS the backdrop -- it shouldn't fog itself out
        uniforms: {
            topColor: { value: new THREE.Color(0x0a1030) },
            bottomColor: { value: new THREE.Color(SKY_HORIZON_COLOR) }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition).y * 0.5 + 0.5;
                gl_FragColor = vec4(mix(bottomColor, topColor, clamp(h, 0.0, 1.0)), 1.0);
            }
        `
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    // Stars: random points on a shell around the arena, upper hemisphere
    // only. fog:false for the same reason as the sky material -- at this
    // distance the default fog-far (85) would otherwise wash every one
    // of them out to the fog color, making them invisible.
    const starCount = 800;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        const radius = 350 + Math.random() * 40;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = Math.abs(radius * Math.cos(phi));
        positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xaaccff, size: 1.4, sizeAttenuation: false, fog: false });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    return { sky, stars };
}

// Single entry point -- called once from init() (see main.js). Builds
// the skybox, ground, walls, beacons and props, tints the scene with
// fog matching the sky's horizon color so the arena's far edges (and
// the void beyond the walls) fade out seamlessly instead of clipping
// abruptly, and returns the collision circles main.js needs to keep the
// player from walking through the beacons/crates (the perimeter walls
// don't need one of their own -- they sit just past the existing
// movement clamp in updateGame(), see WALL_DISTANCE above, so the
// player never reaches them).
export function createEnvironment(scene) {
    scene.fog = new THREE.Fog(SKY_HORIZON_COLOR, 38, 105); // pushed out from 30/85 to match the wider arena (see BOUNDARY above)
    const { sky, stars } = createSkybox(scene);
    createGround(scene);
    createPerimeterWalls(scene);
    const beaconObstacles = createCornerBeacons(scene);
    const crateObstacles = createProps(scene);
    const platformObstacles = createJumpPlatforms(scene);
    // sky/stars are handed back so main.js can pass them to
    // dimensionShift.js -- Dimension Shift repaints them for its
    // day/night look instead of just the per-mesh material swap that
    // handles everything else in the scene (see initDimensionShift()).
    return { obstacles: [...beaconObstacles, ...crateObstacles, ...platformObstacles], sky, stars };
}
