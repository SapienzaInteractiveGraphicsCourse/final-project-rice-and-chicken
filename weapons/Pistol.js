import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Weapon } from './Weapon.js';

// Flat silhouette for the weapon-select HUD
const PISTOL_ICON = `<svg viewBox="0 0 64 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
    <rect x="16" y="8" width="28" height="7"/>
    <rect x="44" y="9" width="12" height="4"/>
    <rect x="18" y="15" width="7" height="9" transform="skewX(-14)"/>
</svg>`;

// ============================================================
// PISTOL
// A compact sidearm: slower, weaker fire rate is traded for a
// faster, lighter bullet.
// ============================================================
export class Pistol extends Weapon {
    constructor() {
        super({
            fireRate: 0.35,
            bulletSpeed: 75, 
            bulletLifetime: 1.0,
            damage: 7,
            bulletRadius: 0.06,
            bulletColor: 0x66ccff,
            bulletEmissive: 0x3399ff,
            name: 'PISTOL',
            icon: PISTOL_ICON,
            automatic: false // one shot per click -- has to be released and clicked again for the next
        });
    }

    // Same local-axis convention as Rifle (front = +Z), but built from
    // fewer, smaller parts: slide, short barrel, grip. No magazine
    // curve or energy strip -- reads as a lighter, simpler weapon.
    createModel() {
        const gunGroup = new THREE.Group();

        const metalMat = new THREE.MeshStandardMaterial({ color: 0x2e2e3a, roughness: 0.3, metalness: 0.8 }); 
        const glowMat = new THREE.MeshStandardMaterial({ color: 0x002233, emissive: 0x33aaff, emissiveIntensity: 2 });

        // --- Slide (top body, houses the barrel) ---
        const slide = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.09, 0.32, 2, 0.015), metalMat);
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
        const grip = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.18, 0.08, 2, 0.012), metalMat);
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
