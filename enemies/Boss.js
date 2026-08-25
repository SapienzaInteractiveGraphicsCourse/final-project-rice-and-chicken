import * as THREE from 'three';
import { Enemy } from './Enemy.js';

// ============================================================
// BOSS (DOOMHORN)
// The final wave encounter -- a single, much larger and tougher enemy
// instead of a crowd (see startWave()/spawnBoss() in main.js). Reuses
// Enemy's chase/face/attack-cooldown/walk-cycle logic as-is (same
// melee attack shape as Grunt, just far stronger) -- what makes it read
// as a boss is the stats, the size, and the devil-themed model: horns,
// glowing red eyes, an ember chest core, and spine spikes.
// ============================================================
export class Boss extends Enemy {
    constructor() {
        super({
            health: 550,
            speed: 4.2,
            damage: 16,
            attackRange: 1.8,   // longer reach than Grunt's, matches the bigger arms/claws
            attackCooldown: 0.9,
            hitRadius: 1.1      // matches the bigger silhouette -- both for bullet hits and the aim-indicator ray
        });

        this.name = 'DOOMHORN'; // shown on the boss health bar (see updateBossBarUI() in main.js)
    }

    createModel() {
        const enemyGroup = new THREE.Group();

        const skinMat = new THREE.MeshStandardMaterial({ color: 0x4a0808, roughness: 0.55, metalness: 0.3 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x120202, roughness: 0.4, metalness: 0.5 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1111, emissiveIntensity: 3 });
        const emberMat = new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff5500, emissiveIntensity: 2.5 });

        // --- Torso ---
        const torsoGeo = new THREE.BoxGeometry(1.0, 1.15, 0.7);
        const torso = new THREE.Mesh(torsoGeo, skinMat);
        torso.position.y = 1.35;
        torso.castShadow = true;
        enemyGroup.add(torso);

        // --- Chest ember ---
        // Same "glowing chest accent" motif as the player's own chest-core
        // (see createPlayer() in main.js), but ominous orange-red instead
        // of the player's teal -- ties the boss into the game's visual
        // language while still reading as clearly hostile.
        const emberGeo = new THREE.BoxGeometry(0.34, 0.4, 0.06);
        const ember = new THREE.Mesh(emberGeo, emberMat);
        ember.position.set(0, 0.1, 0.35 + 0.03);
        torso.add(ember);

        // --- Spine spikes ---
        const spikeGeo = new THREE.ConeGeometry(0.07, 0.32, 5);
        for (let i = 0; i < 4; i++) {
            const spike = new THREE.Mesh(spikeGeo, darkMat);
            spike.position.set(0, 0.45 - i * 0.28, -0.36);
            spike.rotation.x = -0.4; // tilt back, following the spine's curve
            spike.castShadow = true;
            torso.add(spike);
        }

        // --- Head ---
        const headGeo = new THREE.BoxGeometry(0.5, 0.46, 0.46);
        const head = new THREE.Mesh(headGeo, darkMat);
        head.position.y = 0.575 + 0.2;
        head.castShadow = true;
        torso.add(head);

        // --- Glowing eyes ---
        const eyeGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.12, 0.03, 0.21);
        head.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.12, 0.03, 0.21);
        head.add(rightEye);

        // --- Horns ---
        // Cones angled outward and back, tapering to a point -- the
        // single clearest "devil" read on the whole model.
        const hornGeo = new THREE.ConeGeometry(0.08, 0.5, 6);
        const leftHorn = new THREE.Mesh(hornGeo, darkMat);
        leftHorn.position.set(-0.16, 0.32, -0.05);
        leftHorn.rotation.set(-0.5, 0, 0.5); // tilt back and outward
        leftHorn.castShadow = true;
        head.add(leftHorn);

        const rightHorn = new THREE.Mesh(hornGeo, darkMat);
        rightHorn.position.set(0.16, 0.32, -0.05);
        rightHorn.rotation.set(-0.5, 0, -0.5);
        rightHorn.castShadow = true;
        head.add(rightHorn);

        // --- Arms (longer/thicker than Grunt's, ending in bigger claws) ---
        const armGeo = new THREE.BoxGeometry(0.24, 0.85, 0.24);
        const leftArm = new THREE.Mesh(armGeo, skinMat);
        leftArm.position.set(-0.62, 0.05, 0);
        leftArm.castShadow = true;
        torso.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, skinMat);
        rightArm.position.set(0.62, 0.05, 0);
        rightArm.castShadow = true;
        torso.add(rightArm);

        const clawGeo = new THREE.ConeGeometry(0.14, 0.34, 5);
        const leftClaw = new THREE.Mesh(clawGeo, darkMat);
        leftClaw.position.set(0, -0.58, 0.08);
        leftClaw.rotation.x = Math.PI / 2 + 0.3;
        leftClaw.castShadow = true;
        leftArm.add(leftClaw);

        const rightClaw = new THREE.Mesh(clawGeo, darkMat);
        rightClaw.position.set(0, -0.58, 0.08);
        rightClaw.rotation.x = Math.PI / 2 + 0.3;
        rightClaw.castShadow = true;
        rightArm.add(rightClaw);

        // --- Legs ---
        const legGeo = new THREE.BoxGeometry(0.32, 0.8, 0.32);
        const leftLeg = new THREE.Mesh(legGeo, skinMat);
        leftLeg.position.set(-0.24, 0.4, 0);
        leftLeg.castShadow = true;
        enemyGroup.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeo, skinMat);
        rightLeg.position.set(0.24, 0.4, 0);
        rightLeg.castShadow = true;
        enemyGroup.add(rightLeg);

        // Referenced by Enemy.animateWalk() every frame.
        this.leftArm = leftArm;
        this.rightArm = rightArm;
        this.leftLeg = leftLeg;
        this.rightLeg = rightLeg;

        return enemyGroup;
    }

    // Melee, same shape as Grunt's -- just hits much harder (see the
    // damage stat above).
    onAttack(context) {
        context.dealDamageToPlayer(this.damage);
    }
}
