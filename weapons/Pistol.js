import * as THREE from 'three';
import { Weapon } from './Weapon.js';

// ============================================================
// PISTOL
// A compact sidearm: slower, weaker fire rate is traded for a
// faster, lighter bullet. 
// ============================================================
export class Pistol extends Weapon {
    constructor() {
        super({
            fireRate: 0.35,
            bulletSpeed: 55,
            bulletLifetime: 1.0,
            bulletRadius: 0.06,
            bulletColor: 0x66ccff,
            bulletEmissive: 0x3399ff
        });
    }

    // Same local-axis convention as Rifle (front = +Z), but built from
    // fewer, smaller parts: slide, short barrel, grip. No magazine
    // curve or energy strip -- reads as a lighter, simpler weapon.
    createModel() {
        const gunGroup = new THREE.Group();

        const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.3, metalness: 0.8 });
        const glowMat = new THREE.MeshStandardMaterial({ color: 0x002233, emissive: 0x33aaff, emissiveIntensity: 2 });

        // --- Slide (top body, houses the barrel) ---
        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.32), metalMat);
        slide.position.set(0, 0.02, 0.14);
        slide.castShadow = true;
        gunGroup.add(slide);

        // --- Barrel (short cylinder, just peeks past the slide) ---
        const barrelGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.12, 8);
        const barrel = new THREE.Mesh(barrelGeo, metalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, 0.32);
        barrel.castShadow = true;
        gunGroup.add(barrel);

        // --- Muzzle marker ---
        // Barrel center z=0.32, half-length 0.06 -> tip at z=0.38.
        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0.02, 0.38);
        gunGroup.add(muzzle);
        gunGroup.userData.muzzle = muzzle;

        // --- Grip ---
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.08), metalMat);
        grip.position.set(0, -0.11, -0.06);
        grip.rotation.x = -0.25; // angled back, same idea as Rifle's grip
        grip.castShadow = true;
        gunGroup.add(grip);

        // --- Sci-fi glow accent ---
        // Small dot on the slide instead of a full strip -- a lighter
        // touch befitting a smaller weapon.
        const glowDot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.04), glowMat);
        glowDot.position.set(0, 0.065, 0.05);
        gunGroup.add(glowDot);

        return gunGroup;
    }
}
