import * as THREE from 'three';

// ============================================================
// POWER-UP (base class)
// Same pattern as Weapon.js/Enemy.js: everything power-ups have in
// common lives here (the glowing shell, the point light, the slow
// spin + gentle bob float, and the pickup radius) -- a concrete
// power-up (see HealthPickup.js, ArmorPickup.js, StrengthPickup.js)
// only needs to provide its own 3D icon via createIcon() and its own
// effect via apply().
// ============================================================
const LIFETIME = 16; // seconds on the field before despawning uncollected -- see main.js's updatePowerUps()
const WARNING_TIME = 3; // last few seconds: blink instead of just vanishing without notice

export class PowerUp {
    constructor({ name, glowColor, shellScale = 1 }) {
        this.name = name;
        this.glowColor = glowColor;
        this.pickupRadius = 1.0; // used by main.js's distance check against the player
        this.lifetime = LIFETIME; // main.js removes this power-up once aliveTime passes this

        this.baseY = 0.9; // float height above the ground
        this.bobPhase = Math.random() * Math.PI * 2; // stagger the bob cycle so pickups don't all bounce in sync
        this.aliveTime = 0;

        this.group = new THREE.Group();

        // Outer glow shell -- same shape/material recipe for every
        // power-up type, so they all read as "the same kind of pickup"
        // at a glance from a distance; only the icon inside (see
        // createIcon(), overridden per subclass) tells them apart once
        // the player is close enough to see it.
        const shellGeo = new THREE.IcosahedronGeometry(0.4 * shellScale, 0);
        const shellMat = new THREE.MeshStandardMaterial({
            color: glowColor,
            emissive: glowColor,
            emissiveIntensity: 1.4,
            transparent: true,
            opacity: 0.25,
            roughness: 0.3,
            metalness: 0.1
        });
        this.shell = new THREE.Mesh(shellGeo, shellMat);
        this.group.add(this.shell);

        const light = new THREE.PointLight(glowColor, 2.5, 6);
        this.group.add(light);

        this.icon = this.createIcon(); // subclass-provided
        this.group.add(this.icon);

        this.group.position.y = this.baseY;
    }

    // Must be overridden: builds and returns the small 3D icon that
    // spins inside the glow shell (a cross, a shield, a flexed arm...).
    createIcon() {
        throw new Error('createIcon() must be implemented by the PowerUp subclass');
    }

    // Must be overridden: applies this power-up's effect. `context` is a
    // plain object main.js builds each frame with whatever a pickup
    // could possibly need (see updatePowerUps() in main.js) -- mirrors
    // how Enemy.onAttack(context) works.
    apply(context) {
        throw new Error('apply() must be implemented by the PowerUp subclass');
    }

    // Runs every frame for every power-up on the field (see
    // updatePowerUps() in main.js): spins the shell and icon at
    // slightly different speeds (reads as a lively "trinket" instead of
    // one rigid block spinning), bobs the whole thing gently up and
    // down, and blinks in its last few seconds as a "this is about to
    // despawn" warning (main.js is the one that actually removes it
    // once aliveTime passes lifetime).
    update(deltaTime) {
        this.aliveTime += deltaTime;
        this.group.rotation.y += deltaTime * 1.6;
        this.icon.rotation.y += deltaTime * 2.4;
        this.shell.rotation.x += deltaTime * 0.6;
        this.group.position.y = this.baseY + Math.sin(this.aliveTime * 2 + this.bobPhase) * 0.15;

        const timeLeft = this.lifetime - this.aliveTime;
        this.group.visible = timeLeft > WARNING_TIME || Math.floor(this.aliveTime * 8) % 2 === 0;
    }

    // True once this power-up has been sitting uncollected long enough
    // that main.js should remove it (see updatePowerUps()).
    isExpired() {
        return this.aliveTime >= this.lifetime;
    }
}
