import * as THREE from 'three';

// ============================================================
// WEAPON (base class)
// Everything weapons have in common lives here: fire rate,
// bullet stats, and the actual shooting logic. A concrete weapon
// (see Rifle.js, Pistol.js) only needs to provide its own 3D
// model and its own stats via the constructor.
//
// A subclass can still override createBulletMesh() or shoot()
// if it needs a fundamentally different attack (e.g. a shotgun
// firing several pellets in a spread instead of one bullet).
// ============================================================
export class Weapon {
    constructor({ fireRate, bulletSpeed, bulletLifetime, damage = 10, bulletRadius = 0.08, bulletColor = 0xffaa00, bulletEmissive = 0xff6600, name = 'Weapon', icon = '', automatic = true }) {
        this.fireRate = fireRate;             // seconds between shots
        this.bulletSpeed = bulletSpeed;       // units per second
        this.bulletLifetime = bulletLifetime; // seconds before a bullet despawns
        this.damage = damage;                 // HP removed from whatever a bullet hits (see enemies/Enemy.js)
        this.bulletRadius = bulletRadius;
        this.bulletColor = bulletColor;
        this.bulletEmissive = bulletEmissive;
        this.name = name;                     // shown in the in-game weapon-select HUD (see updateWeaponSelectorUI() in main.js)
        this.icon = icon;                     // inline SVG markup for the same HUD box
        this.automatic = automatic;           // false = fires once per click, must release and click again (see updateGame() in main.js)
    }

    // Must be overridden by every subclass: builds the THREE.Group
    // for this weapon's visual model. The returned group's
    // userData.muzzle MUST be set to an Object3D marking the exact
    // point bullets should spawn from.
    createModel() {
        throw new Error('createModel() must be implemented by the Weapon subclass');
    }

    // Default bullet look: a small glowing sphere. 
    createBulletMesh() {
        const geo = new THREE.SphereGeometry(this.bulletRadius, 8, 8);
        const mat = new THREE.MeshStandardMaterial({
            color: this.bulletColor,
            emissive: this.bulletEmissive,
            emissiveIntensity: 2
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        return mesh;
    }

    // A short glowing streak trailing directly behind the bullet, same
    // color/emissive as the bullet itself. Purely visual, but it's what
    // makes a shot's path read unambiguously as a straight line at a
    // glance -- a single small, fast-moving sphere sampled once per
    // frame is easy to misjudge as curving even when its path is
    // perfectly straight; a continuous streak along that same path removes any doubt.
    createTracerMesh(direction) {
        const length = 1.6;
        const geo = new THREE.CylinderGeometry(this.bulletRadius * 0.35, this.bulletRadius * 0.35, length, 6);
        const mat = new THREE.MeshStandardMaterial({
            color: this.bulletColor,
            emissive: this.bulletEmissive,
            emissiveIntensity: 2,
            transparent: true,
            opacity: 0.5,
            depthWrite: false // a see-through streak shouldn't hide whatever's behind it
        });
        const tracer = new THREE.Mesh(geo, mat);
        // Cylinders are built standing along +Y by default -- rotate so
        // it lies along the bullet's actual direction of travel instead.
        tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        return { tracer, length };
    }

    // Spawns one bullet at `spawnPos` (a THREE.Vector3 world-space
    // point -- see getBulletSpawnPoint() in main.js, the gun's actual
    // muzzle), aimed toward `aimTarget` (another world-space point --
    // see getCrosshairTarget() in main.js: whatever's actually under
    // the crosshair). Aiming FROM one point TOWARD the other, rather
    // than firing along a fixed angle, is the same "aim toward a
    // target point" technique Boss.js's onAttack() uses via
    // leadTarget(). Adds the bullet (and its trailing tracer streak,
    // see createTracerMesh() above) to `scene` and returns the tracking
    // entry updateBullets() expects.
    shoot(scene, spawnPos, aimTarget) {
        const bullet = this.createBulletMesh();
        bullet.position.copy(spawnPos);

        const direction = new THREE.Vector3().subVectors(aimTarget, spawnPos).normalize();
        const { tracer, length: tracerLength } = this.createTracerMesh(direction);

        scene.add(bullet);
        scene.add(tracer);

        return {
            mesh: bullet,
            tracer,
            // Precomputed once (direction never changes after this) --   
            // added to the bullet's current position each frame in
            // updateBullets() (main.js) to keep the tracer trailing
            // directly behind it, half its own length back.
            tracerOffset: direction.clone().multiplyScalar(-tracerLength / 2),
            velocity: direction.clone().multiplyScalar(this.bulletSpeed),
            age: 0,
            lifetime: this.bulletLifetime,
            damage: this.damage
        };
    }
}
