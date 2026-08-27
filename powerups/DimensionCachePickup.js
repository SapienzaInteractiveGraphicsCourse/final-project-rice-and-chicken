import * as THREE from 'three';
import { PowerUp } from './PowerUp.js';

const VIOLET = 0xbb44ff;

// ============================================================
// DIMENSION CACHE PICKUP
// The reward for actually USING Dimension Shift instead of just
// admiring it: spawns into the world like any other power-up, but sits
// completely invisible (and can't be collected) while the player is in
// Realistic dimension -- see the requiresToon flag it passes up to
// PowerUp, and the visibility/collection gate in updatePowerUps() in
// main.js. Only shifting to Toon (see dimensionShift.js) reveals it,
// which is exactly the "something to find" hook Dimension Shift needed.
// A proper jackpot once found: full health AND full armor at once.
// ============================================================
export class DimensionCachePickup extends PowerUp {
    constructor() {
        super({ name: 'DIMENSION CACHE', glowColor: VIOLET, shellScale: 1.1, requiresToon: true });
    }

    // Two counter-rotating rings around a glowing core -- reads as a
    // small "rift/portal", tying the pickup's identity directly to the
    // dimension-shift theme instead of reusing another type's language
    // (cross/shield/fist).
    createIcon() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x2a1033, emissive: VIOLET, emissiveIntensity: 2.4 });
        const icon = new THREE.Group();

        const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), mat);
        icon.add(core);

        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 20), mat);
        ring1.rotation.x = Math.PI / 2;
        icon.add(ring1);

        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 20), mat);
        ring2.rotation.x = Math.PI / 2.6;
        ring2.rotation.y = Math.PI / 3;
        icon.add(ring2);

        // Stash the rings so update() below can spin them opposite ways
        // independently of the shared icon.rotation.y PowerUp already does.
        this.ring1 = ring1;
        this.ring2 = ring2;

        return icon;
    }

    update(deltaTime) {
        super.update(deltaTime);
        this.ring1.rotation.z += deltaTime * 2.2;
        this.ring2.rotation.z -= deltaTime * 2.8;
    }

    apply(context) {
        context.healToFull();
        context.armorToFull();
    }
}
