import * as THREE from 'three';
import { PowerUp } from './PowerUp.js';

const GREEN = 0x22ff66;

// ============================================================
// HEALTH PICKUP
// A green glowing cross -- restores the player's health to full.
// ============================================================
export class HealthPickup extends PowerUp {
    constructor() {
        super({ name: 'HEALTH', glowColor: GREEN });
    }

    createIcon() {
        const iconMat = new THREE.MeshStandardMaterial({ color: 0x003311, emissive: GREEN, emissiveIntensity: 2.5 });
        const icon = new THREE.Group();

        const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.12), iconMat);
        icon.add(vBar);
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.12), iconMat);
        icon.add(hBar);

        return icon;
    }

    apply(context) {
        context.healToFull();
    }
}
