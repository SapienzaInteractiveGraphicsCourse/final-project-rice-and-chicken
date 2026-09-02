import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Weapon } from './Weapon.js';

// Flat silhouette shown in the in-game weapon-select HUD (see
// updateWeaponSelectorUI() in main.js) -- stock + receiver + long
// barrel + curved magazine, echoing the actual 3D model below.
const RIFLE_ICON = `<svg viewBox="0 0 64 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
    <rect x="2" y="9" width="9" height="7"/>
    <rect x="10" y="7" width="30" height="8"/>
    <rect x="40" y="9.5" width="20" height="3"/>
    <rect x="17" y="15" width="6" height="8" transform="skewX(-12)"/>
</svg>`;

// ============================================================
// RIFLE
// The sci-fi AK-47-style weapon the player starts with. Model
// and stats are unchanged from the original createGun() /
// shootBullet() that used to live directly in main.js.
// ============================================================
export class Rifle extends Weapon {
    constructor() {
        super({
            fireRate: 0.2,          // seconds between shots (lower = faster fire rate)
            bulletSpeed: 60,        
            bulletLifetime: 1.5,    // seconds before a bullet is removed, even if it hit nothing
            damage: 10,             // fast fire rate makes up for the modest per-shot damage
            bulletColor: 0xffaa00,
            bulletEmissive: 0xff6600,
            name: 'RIFLE',
            icon: RIFLE_ICON
        });
    }

    // A small hierarchy of its own, built from simple primitives laid
    // out along the local Z axis (front = +Z, same "forward" convention
    // as the rest of the player). All parts are added to one Group so
    // the whole gun can be positioned and carried by the hand as a
    // single unit (see createPlayer() in main.js).
    createModel() {
        const gunGroup = new THREE.Group();

        const metalMat = new THREE.MeshStandardMaterial({ color: 0x2e2e3a, roughness: 0.35, metalness: 0.75 }); 
        const metalMatLight = new THREE.MeshStandardMaterial({ color: 0x45454f, roughness: 0.4, metalness: 0.6 }); 
        // Emissive strip = glows on its own regardless of scene lighting.
        // Color matches the player's teal accent, ties the weapon visually
        // to the character and hints at "sci-fi energy" tech.
        const glowMat = new THREE.MeshStandardMaterial({ color: 0x003322, emissive: 0x00ffcc, emissiveIntensity: 2 });

        // --- Stock (rear, braces against the shoulder) ---
        // RoundedBoxGeometry (chamfered edges) instead of a flat box on
        // every major part below -- same width/height/depth/origin as a
        // regular box, just softened corners so the gun doesn't read as
        // stacked cardboard blocks.
        const stock = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.11, 0.22, 2, 0.015), metalMat);
        stock.position.set(0, -0.01, -0.19); // slightly lower than the receiver, angled look without actual rotation
        stock.castShadow = true;
        gunGroup.add(stock);

        // --- Receiver (main body, houses the mechanism) ---
        const receiver = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.14, 0.35, 2, 0.02), metalMat);
        receiver.position.set(0, 0, 0.1);
        receiver.castShadow = true;
        gunGroup.add(receiver);

        // --- Handguard (covers the rear part of the barrel) ---
        const handguard = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.09, 0.25, 2, 0.015), metalMatLight);
        handguard.position.set(0, -0.01, 0.4);
        handguard.castShadow = true;
        gunGroup.add(handguard);

        // --- Barrel (thin cylinder, extends past the handguard) ---
        const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8);
        const barrel = new THREE.Mesh(barrelGeo, metalMat);
        barrel.rotation.x = Math.PI / 2; // cylinders default to standing on Y -- rotate 90° to point along Z (forward)
        barrel.position.set(0, 0.01, 0.68);
        barrel.castShadow = true;
        gunGroup.add(barrel);

        // --- Muzzle marker ---
        // An empty Object3D (no geometry, never rendered) placed exactly at
        // the barrel's tip: barrel center z=0.68, half-length 0.175 -> tip
        // at z=0.855. This is the point bullets should actually spawn from,
        // as opposed to gunGroup's own origin (which sits back near the grip).
        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0.01, 0.855);
        gunGroup.add(muzzle);
        gunGroup.userData.muzzle = muzzle; // so createPlayer() can grab it below

        // --- Magazine ---
        // The AK-47's signature trait: a magazine that curves forward and
        // down instead of hanging straight. We fake the curve cheaply with
        // a single rotated box rather than modeling an actual curved mesh --
        // reads correctly from a normal play-camera distance.
        const magazine = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.28, 0.09, 2, 0.012), metalMatLight);
        magazine.position.set(0, -0.19, 0.08);
        magazine.rotation.x = 0.35; // tilts the bottom of the magazine forward
        magazine.castShadow = true;
        gunGroup.add(magazine);

        // --- Pistol grip ---
        const grip = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.16, 0.08, 2, 0.012), metalMat);
        grip.position.set(0, -0.13, -0.05);
        grip.rotation.x = -0.2; // angled back slightly, like a real grip
        grip.castShadow = true;
        gunGroup.add(grip);

        // --- Sci-fi energy strip ---
        // Thin glowing accent along the top of the receiver -- the "modified"
        // sci-fi touch that separates this from a plain realistic AK-47.
        const energyStrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.3), glowMat);
        energyStrip.position.set(0, 0.075, 0.1); // sits right on top of the receiver
        gunGroup.add(energyStrip);

        return gunGroup;
    }
}
