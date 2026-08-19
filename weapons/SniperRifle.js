import * as THREE from 'three';
import { Weapon } from './Weapon.js';

// ============================================================
// SNIPER RIFLE
// Slow, hard-hitting, long-range: much lower fire rate than the
// Rifle but a faster, longer-lived bullet. Model reuses the same
// box-primitive language as Rifle (see Rifle.js) but stretched,
// with a scope on top instead of an energy strip.
// ============================================================
export class SniperRifle extends Weapon {
    constructor() {
        super({
            fireRate: 1.1,
            bulletSpeed: 90,
            bulletLifetime: 2.2,
            bulletRadius: 0.09,
            bulletColor: 0xff4433,
            bulletEmissive: 0xff2200
        });
    }

    createModel() {
        const gunGroup = new THREE.Group();

        const metalMat = new THREE.MeshStandardMaterial({ color: 0x22221e, roughness: 0.4, metalness: 0.7 });
        const scopeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.8 });
        const glowMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2200, emissiveIntensity: 2 });

        // --- Stock (longer than Rifle's, braces further back) ---
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.3), metalMat);
        stock.position.set(0, -0.01, -0.3);
        stock.castShadow = true;
        gunGroup.add(stock);

        // --- Receiver ---
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.3), metalMat);
        receiver.position.set(0, 0, 0);
        receiver.castShadow = true;
        gunGroup.add(receiver);

        // --- Long barrel ---
        const barrelGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.65, 8);
        const barrel = new THREE.Mesh(barrelGeo, metalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, 0.5);
        barrel.castShadow = true;
        gunGroup.add(barrel);

        // --- Muzzle marker ---
        // barrel center z=0.5, half-length 0.325 -> tip at z=0.825
        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0, 0.825);
        gunGroup.add(muzzle);
        gunGroup.userData.muzzle = muzzle;

        // --- Scope ---
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 10), scopeMat);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.09, 0.05);
        scope.castShadow = true;
        gunGroup.add(scope);

        // --- Grip ---
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.08), metalMat);
        grip.position.set(0, -0.13, -0.12);
        grip.rotation.x = -0.2;
        grip.castShadow = true;
        gunGroup.add(grip);

        // --- Sci-fi energy accent ---
        const energyStrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.25), glowMat);
        energyStrip.position.set(0, 0.07, 0);
        gunGroup.add(energyStrip);

        return gunGroup;
    }
}
