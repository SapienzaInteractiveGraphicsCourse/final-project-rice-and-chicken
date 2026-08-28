import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Enemy } from './Enemy.js';

// ============================================================
// MARKSMAN
// A fragile, long-range kiter: much longer attackRange than Shooter, a
// slow-firing but hard-hitting shot, and -- unlike every other enemy --
// actively backs away if the player closes the distance instead of just
// strafing in place (see retreatRange in Enemy.js). Meant to punish
// ignoring it at range, and to reward actually closing the gap on it.
// Slim, low-profile silhouette (vs. Shooter's broader stance) with a
// long rifle instead of a stubby blaster, so the two ranged threats
// read as different at a glance too.
// ============================================================
export class Marksman extends Enemy {
    constructor() {
        super({
            health: 35,           // fragile -- a glass cannon, dies fast once you actually reach it
            speed: 3.2,
            damage: 16,            // hits hard per shot to make up for the slow fire rate
            attackRange: 18,       // much further than Shooter's 13
            attackCooldown: 2.2,   // slow, deliberate shots
            hitRadius: 0.5,
            retreatRange: 8        // backs away if the player gets within 8 units instead of standing its ground
        });

        this.bulletSpeed = 30;
        this.bulletLifetime = 3;
    }

    createModel() {
        const enemyGroup = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2f6b5b, roughness: 0.5, metalness: 0.4 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.4, metalness: 0.6 });
        const glowMat = new THREE.MeshStandardMaterial({ color: 0x003322, emissive: 0x44ffaa, emissiveIntensity: 2.2 });

        // --- Torso -- slim and upright ---
        const torsoGeo = new RoundedBoxGeometry(0.5, 0.8, 0.34, 2, 0.05);
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        torso.position.y = 0.275 + 0.4;
        torso.castShadow = true;
        enemyGroup.add(torso);

        // --- Head ---
        const headGeo = new RoundedBoxGeometry(0.3, 0.28, 0.28, 2, 0.035);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.y = 0.4 + 0.12;
        head.castShadow = true;
        torso.add(head);

        const visorGeo = new THREE.BoxGeometry(0.2, 0.05, 0.05);
        const visor = new THREE.Mesh(visorGeo, glowMat);
        visor.position.set(0, 0.02, 0.14 + 0.02);
        head.add(visor);

        // --- Arms ---
        const armGeo = new RoundedBoxGeometry(0.14, 0.55, 0.14, 2, 0.025);
        const leftArm = new THREE.Mesh(armGeo, bodyMat);
        leftArm.position.set(-0.32, 0.08, 0);
        leftArm.castShadow = true;
        torso.add(leftArm);
        const rightArm = new THREE.Mesh(armGeo, bodyMat);
        rightArm.position.set(0.32, 0.08, 0);
        rightArm.castShadow = true;
        torso.add(rightArm);

        // --- Long rifle -- much longer barrel than Shooter's stubby
        // blaster, reinforcing "this one shoots from far away" ---
        const rifleGroup = new THREE.Group();
        const body = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.1, 0.3, 2, 0.015), darkMat);
        body.position.z = 0.1;
        body.castShadow = true;
        rifleGroup.add(body);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), darkMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.5;
        barrel.castShadow = true;
        rifleGroup.add(barrel);

        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), glowMat);
        tip.position.z = 0.78;
        rifleGroup.add(tip);

        const muzzle = new THREE.Object3D();
        muzzle.position.z = 0.8;
        rifleGroup.add(muzzle);
        this.muzzle = muzzle;

        rifleGroup.position.set(0, -0.3, 0.14);
        rightArm.add(rifleGroup);

        // --- Legs ---
        const legGeo = new RoundedBoxGeometry(0.18, 0.55, 0.18, 2, 0.025);
        const leftLeg = new THREE.Mesh(legGeo, bodyMat);
        leftLeg.position.set(-0.13, 0.275, 0);
        leftLeg.castShadow = true;
        enemyGroup.add(leftLeg);
        const rightLeg = new THREE.Mesh(legGeo, bodyMat);
        rightLeg.position.set(0.13, 0.275, 0);
        rightLeg.castShadow = true;
        enemyGroup.add(rightLeg);

        this.leftArm = leftArm;
        this.rightArm = rightArm;
        this.leftLeg = leftLeg;
        this.rightLeg = rightLeg;

        return enemyGroup;
    }

    // Ranged: single hard-hitting shot aimed at a PREDICTED player
    // position (see Enemy.leadTarget()) -- same technique as Shooter,
    // just one precise shot instead of a burst.
    onAttack(context) {
        const spawnPos = new THREE.Vector3();
        this.muzzle.getWorldPosition(spawnPos);

        const aimPoint = this.leadTarget(context, spawnPos, this.bulletSpeed);
        const direction = new THREE.Vector3().subVectors(aimPoint, spawnPos);
        direction.y = 0;
        direction.normalize();

        const bulletGeo = new THREE.SphereGeometry(0.09, 8, 8);
        const bulletMat = new THREE.MeshStandardMaterial({ color: 0x66ffcc, emissive: 0x22ff99, emissiveIntensity: 2.2 });
        const mesh = new THREE.Mesh(bulletGeo, bulletMat);
        mesh.position.copy(spawnPos);
        mesh.castShadow = true;
        context.scene.add(mesh);

        context.spawnEnemyBullet({
            mesh,
            velocity: direction.multiplyScalar(this.bulletSpeed),
            age: 0,
            lifetime: this.bulletLifetime,
            damage: this.damage
        });
    }
}
