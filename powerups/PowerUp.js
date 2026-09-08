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
    constructor({ name, glowColor, shellScale = 1, requiresToon = false }) {
        this.name = name;
        this.glowColor = glowColor;
        this.pickupRadius = 1.0; // used by main.js's distance check against the player
        this.lifetime = LIFETIME; // main.js removes this power-up once aliveTime passes this
        
        // True only for DimensionCachePickup -- see updatePowerUps() in
        // main.js, which hides (and blocks collecting) any power-up with
        // this flag set unless the player is currently in Toon dimension.
        this.requiresToon = requiresToon;

        // This three allows the power up to float up and down gently, instead of just sitting rigidly in place. The bobPhase is randomized so that multiple power-ups don't all bob in sync.
        this.baseY = 0.9; // float height above the ground (rest height, before bobbing)
        // This is the phase offset for the bobbing motion, randomized so that multiple power-ups don't all bob in sync.
        this.bobPhase = Math.random() * Math.PI * 2; 
        // We need this to track how long the power-up has been alive, so we can determine when it should despawn. 
        // And to let the power up move over time
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

        // Here we are creating the shell of the powerup, which comprises the geometry and the material, and then we add it to the group of the powerup.
        this.shell = new THREE.Mesh(shellGeo, shellMat);
        this.group.add(this.shell);

        // Here we are creating a point light for the powerup, which will give it a glowing effect. The color of the light is determined by the glowColor parameter passed to the constructor.
        // The intensity and distance of the light are also set here. Finally, we add the light to the group of the powerup.
        const light = new THREE.PointLight(glowColor, 2.5, 6);
        this.group.add(light);
        
        // Here every subclass sets its own icon (cross, shield, flexed arm...) that spins inside the glow shell. The createIcon() method is abstract and must be implemented by each subclass.
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

        // This is the rotation of the group, which contains the shell and the icon. The group rotates around the y-axis at a speed of 1.6 radians per second.
        this.group.rotation.y += deltaTime * 1.6;

        // This is the rotation of the icon, to let the icon spin in a quicker way than the whole group
        this.icon.rotation.y += deltaTime * 2.4;

        // Here is added a smaller rotation on the x axis to the shell, this is done to give a more dynamic appearance and capture the light in a more interesting way, making the power-up look more lively and less static.
        this.shell.rotation.x += deltaTime * 0.6;

        // To let the power-up float up and down gently
        this.group.position.y = this.baseY + Math.sin(this.aliveTime * 2 + this.bobPhase) * 0.15;
        
        // Remaining time before the power-up despawns, used to determine if it should blink or not
        const timeLeft = this.lifetime - this.aliveTime;

        // This allows the power-up to blink in its last few seconds as a warning that it is about to despawn. 
        // First half is always true until the last few seconds, then it blinks on/off every 1/8th of a second (see the Math.floor() check) until it despawns.
        // The condition every time is true false true false , ...
        this.group.visible = timeLeft > WARNING_TIME || Math.floor(this.aliveTime * 8) % 2 === 0;
    }

    // True once this power-up has been sitting uncollected long enough
    // that main.js should remove it (see updatePowerUps()).
    isExpired() {
        return this.aliveTime >= this.lifetime;
    }
}
