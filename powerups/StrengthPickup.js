import * as THREE from 'three';
import { PowerUp } from './PowerUp.js';

const ORANGE = 0xff8800;

// ============================================================
// STRENGTH PICKUP
// A flexed-arm icon (upper arm + bulging bicep + forearm + fist, built
// from primitives) -- grants a temporary damage + move-speed buff
// instead of an instant, permanent change like the health/armor
// pickups (see activateStrengthBuff()/strengthBuffTimer in main.js).
// ============================================================
export class StrengthPickup extends PowerUp {
    constructor() {
        super({ name: 'STRENGTH', glowColor: ORANGE });
    }

    createIcon() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: ORANGE, emissiveIntensity: 2.4 });
        const icon = new THREE.Group();

        // Upper arm, angled down-and-out from the "shoulder" at the top
        const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.18, 4, 8), mat);
        upperArm.position.set(-0.08, 0.14, 0);
        upperArm.rotation.z = 0.9;
        icon.add(upperArm);

        // Bicep bulge, at the midpoint of the upper arm
        const bicep = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), mat);
        bicep.position.set(-0.14, 0.2, 0);
        icon.add(bicep);

        // Forearm, bent back up toward a clenched fist -- the flex pose
        const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 8), mat);
        forearm.position.set(0.02, 0.02, 0);
        forearm.rotation.z = -0.6;
        icon.add(forearm);

        // Fist
        const fist = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), mat);
        fist.position.set(0.1, -0.06, 0);
        icon.add(fist);

        return icon;
    }

    apply(context) {
        context.activateStrengthBuff();
    }
}
