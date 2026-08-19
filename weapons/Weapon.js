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
    constructor({ fireRate, bulletSpeed, bulletLifetime, bulletRadius = 0.08, bulletColor = 0xffaa00, bulletEmissive = 0xff6600 }) {
        this.fireRate = fireRate;             // seconds between shots
        this.bulletSpeed = bulletSpeed;       // units per second
        this.bulletLifetime = bulletLifetime; // seconds before a bullet despawns
        this.bulletRadius = bulletRadius;
        this.bulletColor = bulletColor;
        this.bulletEmissive = bulletEmissive;
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

    // Spawns one bullet at `muzzle`'s current world position, aimed
    // along `aimAngle` (radians, same convention as cameraYaw in
    // main.js), adds it to `scene`, and returns the tracking entry
    // updateBullets() expects.
    shoot(scene, muzzle, aimAngle) {
        const bullet = this.createBulletMesh();

        // getWorldPosition() converts the muzzle's LOCAL position
        // (relative to the barrel/gun/hand/arm/torso chain) into a
        // single world-space point -- where the bullet should appear.
        const spawnPos = new THREE.Vector3();
        muzzle.getWorldPosition(spawnPos);
        bullet.position.copy(spawnPos);

        const direction = new THREE.Vector3(Math.sin(aimAngle), 0, Math.cos(aimAngle));

        scene.add(bullet);

        return {
            mesh: bullet,
            velocity: direction.multiplyScalar(this.bulletSpeed),
            age: 0,
            lifetime: this.bulletLifetime
        };
    }
}
