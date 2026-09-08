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
        this.bulletRadius = bulletRadius;     // world-space radius of the bullet's collision sphere (see updateBullets() in main.js)
        this.bulletColor = bulletColor;
        this.bulletEmissive = bulletEmissive; // the glowing part of the bullet's material (see createBulletMesh() below)
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

        // Creating the geometry and material for the bullet mesh.
        const geo = new THREE.SphereGeometry(this.bulletRadius, 8, 8);
        const mat = new THREE.MeshStandardMaterial({
            color: this.bulletColor,
            emissive: this.bulletEmissive,
            emissiveIntensity: 2
        });
        const mesh = new THREE.Mesh(geo, mat);

        // Enabling shadows for the bullet mesh so that it casts shadows in the scene.
        mesh.castShadow = true;
        return mesh;
    }

    // A short glowing streak trailing directly behind the bullet, same
    // color/emissive as the bullet itself. Purely visual, but it's what
    // makes a shot's path read unambiguously as a straight line at a
    // glance instead of a series of individual spheres. 
    createTracerMesh(direction) {

        // Tracer length
        const length = 1.6;
        const geo = new THREE.CylinderGeometry(this.bulletRadius * 0.35, this.bulletRadius * 0.35, length, 6);
        const mat = new THREE.MeshStandardMaterial({
            color: this.bulletColor,
            emissive: this.bulletEmissive,
            emissiveIntensity: 2,

            // To add a semi transparent effect to the tracer, we set the transparent property to true and adjust the opacity. 
            transparent: true,
            opacity: 0.5,

            // We also set depthWrite to false so that the tracer doesn't obscure other objects in the scene.
            depthWrite: false 
        });
        const tracer = new THREE.Mesh(geo, mat);

        // Cylinders are built standing along +Y by default -- rotate so
        // it lies along the bullet's actual direction of travel instead.
        // Take the vector that poiints straight up (0,1,0) and compute the rotation (quaternion) to point along the bullet's direction. 
        tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        return { tracer, length };
    }

    // Spawns a bullet and its tracer into the scene, returning an object
    // spawnPos where the bullet starts
    // aimTarget where the bullet is aimed
    shoot(scene, spawnPos, aimTarget) {

        // Create the bullet mesh and set its initial position to the spawn position.
        const bullet = this.createBulletMesh();
        bullet.position.copy(spawnPos);

        // Compute the vector that goes from the spawn position to the aim target, normalize it since i need to get only the direction, not the whole vector 
        // and create the tracer mesh based on that direction.
        const direction = new THREE.Vector3().subVectors(aimTarget, spawnPos).normalize();

        // length renamed to tracerLength to avoid confusion with the bullet's length, which is not defined here.
        const { tracer, length: tracerLength } = this.createTracerMesh(direction);

        // add the bullet and tracer to the scene so that they are rendered.
        scene.add(bullet);
        scene.add(tracer);

        return {
            mesh: bullet,
            tracer,
            // Precomputed once (direction never changes after this) --   
            // added to the bullet's current position each frame in
            // updateBullets() (main.js) to keep the tracer trailing
            // directly behind it (the bullet), half its own length back.

            // .clone() is used to create a new vector that is a copy of the direction vector, so that we can modify it without affecting the original direction vector.
            // since the pivot of the tracer is at its center, we want to offset it back along the bullet's path by half its length so that it appears to trail behind the bullet.
            // This is done by multiplying the direction vector by -tracerLength / 2 and adding it to the bullet's position each frame.
            tracerOffset: direction.clone().multiplyScalar(-tracerLength / 2),

            // another time .clone() is used to create a new vector that is a copy of the direction vector, so that we can modify it without affecting the original direction vector.
            // This is used to set the velocity of the bullet, which is the direction it will move in each frame. We multiply the direction vector by the bullet speed to get the velocity vector.
            velocity: direction.clone().multiplyScalar(this.bulletSpeed),
            age: 0,
            lifetime: this.bulletLifetime,
            damage: this.damage
        };
    }
}
