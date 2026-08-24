import * as THREE from 'three';

// ============================================================
// ENVIRONMENT
// Everything that makes the arena read as a PLACE 
// ============================================================

const BOUNDARY = 24;           // matches the movement clamp in updateGame() (main.js)
const WALL_DISTANCE = 25.5;    // just outside BOUNDARY so the player's own model never clips into the wall mesh
const GROUND_HALF_SIZE = 27;   // extends a little past the walls so there's no visible gap/void at their base

// Small tileable canvas texture: dark panel base + a bright teal grid
// line per cell
function createGridTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a0a16';
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
    texture.repeat.set(13, 13); // ~4-unit cells across the 54-unit ground
    texture.colorSpace = THREE.SRGBColorSpace; // this is a color/diffuse map, unlike normal/roughness maps
    return texture;
}

function createGround(scene) {
    const groundGeo = new THREE.PlaneGeometry(GROUND_HALF_SIZE * 2, GROUND_HALF_SIZE * 2);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x111122,
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
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x15151f, roughness: 0.6, metalness: 0.4 });
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
// Returns one {x, z, radius} collision circle per pillar (see
// collidesWithObstacle() in main.js) -- radius is a bit larger than the
// pillar's own base (0.45) to leave room for the glow sphere on top.
function createCornerBeacons(scene) {
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.5, metalness: 0.5 });
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

        obstacles.push({ x, z, radius: 0.5 });
    }
    return obstacles;
}

// A handful of hand-placed crates scattered around the arena -- pure
// set dressing (no collision, same as everything else in this project
// that isn't the player/enemy hit-radius checks), just enough visual
// clutter that the floor doesn't read as one huge empty square.
// Returns one {x, z, radius} collision circle per crate -- radius is
// the box's half-diagonal, so the circle fully contains its footprint
// no matter which way the crate's random yaw rotation points its corners
// (see collidesWithObstacle() in main.js).
function createProps(scene) {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x2a2a1a, roughness: 0.7, metalness: 0.2 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0xffaa00, emissiveIntensity: 1.2 });

    const cratePositions = [
        [8, 6], [8.8, 8.4], [-10, -5], [-9, 4.2], [5, -12],
        [-14, 12], [13, -8], [-6, 15], [16, 3], [-17, -10]
    ];

    const obstacles = [];
    for (const [x, z] of cratePositions) {
        const size = 1.3 + Math.random() * 0.7;

        const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
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

        obstacles.push({ x, z, radius: (size / 2) * Math.SQRT2 });
    }
    return obstacles;
}

// Single entry point -- called once from init() (see main.js). Builds
// the ground, walls, beacons and props, tints the scene with fog
// matching the background color so the arena's far edges (and the void
// beyond the walls) fade out softly instead of clipping abruptly, and
// returns the collision circles main.js needs to keep the player from
// walking through the beacons/crates (the perimeter walls don't need
// one of their own -- they sit just past the existing movement clamp in
// updateGame(), see WALL_DISTANCE above, so the player never reaches them).
export function createEnvironment(scene) {
    scene.fog = new THREE.Fog(0x050510, 30, 85);
    createGround(scene);
    createPerimeterWalls(scene);
    const beaconObstacles = createCornerBeacons(scene);
    const crateObstacles = createProps(scene);
    return { obstacles: [...beaconObstacles, ...crateObstacles] };
}
