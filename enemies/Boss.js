import * as THREE from 'three';
import { Enemy } from './Enemy.js';

// ============================================================
// BOSS (DOOMHORN)
// The final wave encounter -- a single, MUCH larger and tougher enemy
// instead of a crowd (see startWave()/spawnBoss() in main.js). Unlike
// Grunt (melee), this one fights at range: it stops well short of the
// player and unleashes a 3-bolt spread from its chest ember instead of
// closing in for a claw swipe, on top of a much bigger health pool
// befitting a final boss. What sells the "boss" read: the stats, the
// sheer size/width of the model, and the devil theme -- horns, glowing
// red eyes, an ember chest core, spine spikes.
// ============================================================
export class Boss extends Enemy {
    constructor() {
        super({
            health: 900,
            speed: 3.5,
            damage: 20,         // per bolt -- see onAttack(), all three can hit at once at close range
            attackRange: 15,    // stops well outside melee distance and fires from there instead
            attackCooldown: 1.3,
            hitRadius: 1.6      // matches the much bigger silhouette -- both for bullet hits and the aim-indicator ray
        });

        this.name = 'DOOMHORN'; // shown on the boss health bar (see updateBossBarUI() in main.js)
        this.bulletSpeed = 17;
        this.bulletLifetime = 3;
    }

    createModel() {
        const enemyGroup = new THREE.Group();

        const skinMat = new THREE.MeshStandardMaterial({ color: 0x4a0808, roughness: 0.55, metalness: 0.3 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x120202, roughness: 0.4, metalness: 0.5 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1111, emissiveIntensity: 3 });
        const emberMat = new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff5500, emissiveIntensity: 2.5 });

        // --- Torso ---
        // Wide and deep, not just tall -- a hulking, broad-shouldered
        // frame reads as "boss" far more than simply scaling height up.
        const torsoGeo = new THREE.BoxGeometry(1.7, 1.5, 1.05);
        const torso = new THREE.Mesh(torsoGeo, skinMat);
        torso.position.y = 1.75;
        torso.castShadow = true;
        enemyGroup.add(torso);

        // --- Chest ember / muzzle ---
        // Same "glowing chest accent" motif as the player's own chest-core
        // (see createPlayer() in main.js), but ominous orange-red instead
        // of the player's teal. Doubles as the spawn point for its ranged
        // attack (see onAttack()) -- a devil-boss blasting bolts from its
        // own chest reads better than bolting a separate weapon prop on.
        const emberGeo = new THREE.BoxGeometry(0.5, 0.6, 0.08);
        const ember = new THREE.Mesh(emberGeo, emberMat);
        ember.position.set(0, 0.15, 0.525 + 0.04);
        torso.add(ember);

        this.muzzle = new THREE.Object3D();
        this.muzzle.position.set(0, 0.15, 0.525 + 0.1);
        torso.add(this.muzzle);

        // --- Spine spikes ---
        const spikeGeo = new THREE.ConeGeometry(0.1, 0.44, 5);
        for (let i = 0; i < 5; i++) {
            const spike = new THREE.Mesh(spikeGeo, darkMat);
            spike.position.set(0, 0.62 - i * 0.32, -0.54);
            spike.rotation.x = -0.4; // tilt back, following the spine's curve
            spike.castShadow = true;
            torso.add(spike);
        }

        // --- Head ---
        const headGeo = new THREE.BoxGeometry(0.72, 0.64, 0.64);
        const head = new THREE.Mesh(headGeo, darkMat);
        head.position.y = 0.75 + 0.28;
        head.castShadow = true;
        torso.add(head);

        // --- Glowing eyes ---
        const eyeGeo = new THREE.SphereGeometry(0.075, 8, 8);
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.17, 0.04, 0.29);
        head.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.17, 0.04, 0.29);
        head.add(rightEye);

        // --- Horns ---
        // Cones angled outward and back, tapering to a point -- the
        // single clearest "devil" read on the whole model.
        const hornGeo = new THREE.ConeGeometry(0.12, 0.7, 6);
        const leftHorn = new THREE.Mesh(hornGeo, darkMat);
        leftHorn.position.set(-0.24, 0.45, -0.08);
        leftHorn.rotation.set(-0.5, 0, 0.5); // tilt back and outward
        leftHorn.castShadow = true;
        head.add(leftHorn);

        const rightHorn = new THREE.Mesh(hornGeo, darkMat);
        rightHorn.position.set(0.24, 0.45, -0.08);
        rightHorn.rotation.set(-0.5, 0, -0.5);
        rightHorn.castShadow = true;
        head.add(rightHorn);

        // --- Arms (set wide off the broad torso, bigger claws) ---
        const armGeo = new THREE.BoxGeometry(0.36, 1.15, 0.36);
        const leftArm = new THREE.Mesh(armGeo, skinMat);
        leftArm.position.set(-0.98, 0.1, 0);
        leftArm.castShadow = true;
        torso.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, skinMat);
        rightArm.position.set(0.98, 0.1, 0);
        rightArm.castShadow = true;
        torso.add(rightArm);

        const clawGeo = new THREE.ConeGeometry(0.2, 0.46, 5);
        const leftClaw = new THREE.Mesh(clawGeo, darkMat);
        leftClaw.position.set(0, -0.78, 0.1);
        leftClaw.rotation.x = Math.PI / 2 + 0.3;
        leftClaw.castShadow = true;
        leftArm.add(leftClaw);

        const rightClaw = new THREE.Mesh(clawGeo, darkMat);
        rightClaw.position.set(0, -0.78, 0.1);
        rightClaw.rotation.x = Math.PI / 2 + 0.3;
        rightClaw.castShadow = true;
        rightArm.add(rightClaw);

        // --- Legs (wide stance, matching the broad torso) ---
        const legGeo = new THREE.BoxGeometry(0.46, 1.05, 0.46);
        const leftLeg = new THREE.Mesh(legGeo, skinMat);
        leftLeg.position.set(-0.42, 0.525, 0);
        leftLeg.castShadow = true;
        enemyGroup.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeo, skinMat);
        rightLeg.position.set(0.42, 0.525, 0);
        rightLeg.castShadow = true;
        enemyGroup.add(rightLeg);

        // Referenced by Enemy.animateWalk() every frame.
        this.leftArm = leftArm;
        this.rightArm = rightArm;
        this.leftLeg = leftLeg;
        this.rightLeg = rightLeg;

        return enemyGroup;
    }

    // Ranged: fires a 3-bolt horizontal spread from the chest ember
    // toward the player, same spawn-a-tracked-bullet technique as
    // Shooter.onAttack() (see enemies/Shooter.js), just three at once.
    onAttack(context) {
        const spawnPos = new THREE.Vector3();
        this.muzzle.getWorldPosition(spawnPos);

        const toPlayer = new THREE.Vector3().subVectors(context.playerPosition, spawnPos);
        toPlayer.y = 0;
        toPlayer.normalize();
        const baseAngle = Math.atan2(toPlayer.x, toPlayer.z);

        const spreadAngles = [-0.16, 0, 0.16];
        for (const offset of spreadAngles) {
            const angle = baseAngle + offset;
            const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));

            const bulletGeo = new THREE.SphereGeometry(0.14, 8, 8);
            const bulletMat = new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xff2200, emissiveIntensity: 2.5 });
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
}
