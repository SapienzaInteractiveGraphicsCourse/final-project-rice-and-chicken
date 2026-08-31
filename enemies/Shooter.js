import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Enemy } from './Enemy.js';

// ============================================================
// SHOOTER
// Slower and tougher than the Grunt, and doesn't close to melee range --
// it stops at a distance and fires at the player instead.
// ============================================================
export class Shooter extends Enemy {
    constructor() {
        super({
            health: 45,
            speed: 3,
            damage: 6,           // per bullet -- see onAttack()
            attackRange: 13,     // stops advancing once this close and starts firing instead
            attackCooldown: 1.6,
            hitRadius: 0.55
        });

        this.bulletSpeed = 20;
        this.bulletLifetime = 2.5;
    }

    createModel() {
        const enemyGroup = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5b2f8a, roughness: 0.55, metalness: 0.35 });
        const blasterMat = new THREE.MeshStandardMaterial({ color: 0x2e2e3a, roughness: 0.4, metalness: 0.7 }); 
        const glowMat = new THREE.MeshStandardMaterial({ color: 0x220033, emissive: 0xbb44ff, emissiveIntensity: 2.2 });

        // --- Torso (upright -- no hunch, unlike Grunt) ---
        const torsoGeo = new RoundedBoxGeometry(0.62, 0.85, 0.4, 2, 0.05);
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        torso.position.y = 0.275 + 0.425; // leg height (0.55, see below) half + torso half-height
        torso.castShadow = true;
        enemyGroup.add(torso);

        // --- Head ---
        const headGeo = new RoundedBoxGeometry(0.34, 0.32, 0.32, 2, 0.04);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.y = 0.425 + 0.13;
        head.castShadow = true;
        torso.add(head);

        // --- Visor ---
        const visorGeo = new THREE.BoxGeometry(0.24, 0.06, 0.05);
        const visor = new THREE.Mesh(visorGeo, glowMat);
        visor.position.set(0, 0.02, 0.16 + 0.02);
        head.add(visor);

        // --- Arms ---
        const armGeo = new RoundedBoxGeometry(0.16, 0.6, 0.16, 2, 0.03);
        const leftArm = new THREE.Mesh(armGeo, bodyMat);
        leftArm.position.set(-0.39, 0.1, 0);
        leftArm.castShadow = true;
        torso.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, bodyMat);
        rightArm.position.set(0.39, 0.1, 0);
        rightArm.castShadow = true;
        torso.add(rightArm);

        // --- Blaster ---
        // Fused to the right hand as one simple unit (not a full Weapon
        // subclass -- enemies don't switch weapons, so that machinery
        // would be pure overhead here). Just enough parts to read as a
        // gun, plus a muzzle marker so onAttack() knows exactly where to
        // spawn bullets from.
        const blasterGroup = new THREE.Group();
        const body = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.13, 0.32, 2, 0.02), blasterMat);
        body.position.z = 0.14;
        body.castShadow = true;
        blasterGroup.add(body);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), blasterMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.4;
        barrel.castShadow = true;
        blasterGroup.add(barrel);

        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), glowMat);
        tip.position.z = 0.5;
        blasterGroup.add(tip);

        const muzzle = new THREE.Object3D();
        muzzle.position.z = 0.52; // just past the glowing tip
        blasterGroup.add(muzzle);
        this.muzzle = muzzle; // onAttack() reads this via getWorldPosition()

        blasterGroup.position.set(0, -0.32, 0.12); // roughly at the hand, extending forward
        rightArm.add(blasterGroup);

        // --- Legs ---
        const legGeo = new RoundedBoxGeometry(0.22, 0.55, 0.22, 2, 0.03);
        const leftLeg = new THREE.Mesh(legGeo, bodyMat);
        leftLeg.position.set(-0.15, 0.275, 0);
        leftLeg.castShadow = true;
        enemyGroup.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeo, bodyMat);
        rightLeg.position.set(0.15, 0.275, 0);
        rightLeg.castShadow = true;
        enemyGroup.add(rightLeg);

        this.leftArm = leftArm;
        this.rightArm = rightArm;
        this.leftLeg = leftLeg;
        this.rightLeg = rightLeg;

        return enemyGroup;
    }

    // Ranged: spawns a bullet aimed at a PREDICTED player position (see
    // Enemy.leadTarget()) instead of wherever they currently are, from
    // the blaster's muzzle world position. Genuine 3D aim (not flattened
    // to Y=0) -- same technique Boss.js's onAttack() uses, so this shot
    // actually tilts up/down toward the player instead of always firing
    // dead level, e.g. if the player is up on a jump-platform or the
    // shooter itself jumped onto one (see Enemy.js's update()).
    onAttack(context) {
        const spawnPos = new THREE.Vector3();
        this.muzzle.getWorldPosition(spawnPos);

        const aimPoint = this.leadTarget(context, spawnPos, this.bulletSpeed);
        const direction = new THREE.Vector3().subVectors(aimPoint, spawnPos).normalize();

        const bulletGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const bulletMat = new THREE.MeshStandardMaterial({ color: 0xcc66ff, emissive: 0xaa22ff, emissiveIntensity: 2 });
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
