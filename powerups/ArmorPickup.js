import * as THREE from 'three';
import { PowerUp } from './PowerUp.js';

const BLUE = 0x3399ff;

// ============================================================
// ARMOR PICKUP (shared base for the two armor power-ups)
// Not spawned directly -- SmallArmorPickup and LargeArmorPickup (see
// those files) both extend this just for the shared shield icon and
// glow color; each one only overrides apply() (and, for the large one,
// how big/bright the icon reads) with its own effect.
// ============================================================
export class ArmorPickup extends PowerUp {
    constructor({ name, shellScale }) {
        super({ name, glowColor: BLUE, shellScale });
    }

    // A real shield silhouette (built via THREE.Shape + ExtrudeGeometry
    // instead of boxes) -- pointed bottom, rounded top, reads clearly as
    // "armor" rather than an abstract blob.
    createIcon() {
        const shape = new THREE.Shape();
        shape.moveTo(-0.22, 0.26);
        shape.quadraticCurveTo(0, 0.34, 0.22, 0.26);
        shape.lineTo(0.22, 0.02);
        shape.quadraticCurveTo(0.22, -0.22, 0, -0.32);
        shape.quadraticCurveTo(-0.22, -0.22, -0.22, 0.02);
        shape.lineTo(-0.22, 0.26);

        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: 0.07,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.02,
            bevelSegments: 2
        });
        geo.center();

        const mat = new THREE.MeshStandardMaterial({ color: 0x001a33, emissive: BLUE, emissiveIntensity: 2.2 });
        return new THREE.Mesh(geo, mat);
    }
}
