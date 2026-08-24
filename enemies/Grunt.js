import * as THREE from 'three';
import { Enemy } from './Enemy.js';

// ============================================================
// GRUNT
// Fast, fragile, melee. Rushes straight at the player and hits on
// contact. Hunched posture and clawed hands (vs. the Shooter's upright,
// armed silhouette) 
// ============================================================
export class Grunt extends Enemy {
    constructor() {
        super({
            health: 30,
            speed: 5.5,          // noticeably slower than the player's own 12 u/s, but still closes distance fast if you stand still
            damage: 8,           // dealt directly to the player on each successful hit (see onAttack())
            attackRange: 1.3,    // stops and swings once this close
            attackCooldown: 1.0,
            hitRadius: 0.5
        });
    }

    createModel() {
        const enemyGroup = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a1f1f, roughness: 0.65, metalness: 0.25 });
        const clawMat = new THREE.MeshStandardMaterial({ color: 0x1a1010, roughness: 0.4, metalness: 0.5 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2222, emissiveIntensity: 2.2 });

        // --- Torso ---
        // Slight forward tilt (rotation.x) reads as an aggressive hunch/
        // lunge -- a cheap way to visually differentiate this from the
        // upright Shooter without a different geometry budget.
        const torsoGeo = new THREE.BoxGeometry(0.6, 0.7, 0.4);
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        torso.position.y = 0.85;
        torso.rotation.x = 0.18;
        torso.castShadow = true;
        enemyGroup.add(torso);

        // --- Head ---
        const headGeo = new THREE.BoxGeometry(0.32, 0.3, 0.3);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.y = 0.35 + 0.13; // torso half-height + most of the head's half-height, small overlap
        head.castShadow = true;
        torso.add(head);

        // --- Eye visor ---
        // Single glowing slit instead of the player's full visor strip --
        // reads as "hostile alien" rather than "trooper HUD".
        const eyeGeo = new THREE.BoxGeometry(0.24, 0.05, 0.05);
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(0, 0.02, 0.15 + 0.02);
        head.add(eye);

        // --- Arms (longer than the torso, ending in a clawed point) ---
        const armGeo = new THREE.BoxGeometry(0.15, 0.55, 0.15);
        const leftArm = new THREE.Mesh(armGeo, bodyMat);
        leftArm.position.set(-0.38, 0.05, 0);
        leftArm.castShadow = true;
        torso.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, bodyMat);
        rightArm.position.set(0.38, 0.05, 0);
        rightArm.castShadow = true;
        torso.add(rightArm);

        const clawGeo = new THREE.ConeGeometry(0.09, 0.22, 4);
        const leftClaw = new THREE.Mesh(clawGeo, clawMat);
        leftClaw.position.set(0, -0.38, 0.05);
        leftClaw.rotation.x = Math.PI / 2 + 0.3; // point forward-ish, not straight down
        leftClaw.castShadow = true;
        leftArm.add(leftClaw);

        const rightClaw = new THREE.Mesh(clawGeo, clawMat);
        rightClaw.position.set(0, -0.38, 0.05);
        rightClaw.rotation.x = Math.PI / 2 + 0.3;
        rightClaw.castShadow = true;
        rightArm.add(rightClaw);

        // --- Legs ---
        const legGeo = new THREE.BoxGeometry(0.2, 0.5, 0.2);
        const leftLeg = new THREE.Mesh(legGeo, bodyMat);
        leftLeg.position.set(-0.14, 0.25, 0);
        leftLeg.castShadow = true;
        enemyGroup.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeo, bodyMat);
        rightLeg.position.set(0.14, 0.25, 0);
        rightLeg.castShadow = true;
        enemyGroup.add(rightLeg);

        // Referenced by Enemy.animateWalk() every frame.
        this.leftArm = leftArm;
        this.rightArm = rightArm;
        this.leftLeg = leftLeg;
        this.rightLeg = rightLeg;

        return enemyGroup;
    }

    // Melee: just hits the player directly, no projectile involved.
    onAttack(context) {
        context.dealDamageToPlayer(this.damage);
    }
}
