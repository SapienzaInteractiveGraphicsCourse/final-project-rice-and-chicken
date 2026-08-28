import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Enemy } from './Enemy.js';

// ============================================================
// BRUTE
// A heavy melee tank -- slower than Grunt and doesn't fan out/flank as
// noticeably (it's not trying to be clever, it's trying to walk through
// whatever's in front of it), but far tougher and hits much harder.
// Bulky armored-mech silhouette (broad shoulders, blocky fists, glowing
// vents) instead of Grunt's hunched alien-claw look, so the two melee
// threats read as clearly different at a glance.
// ============================================================
export class Brute extends Enemy {
    constructor() {
        super({
            health: 90,
            speed: 3.5,          // noticeably slower than Grunt's 5.5 -- a heavy, plodding threat rather than a fast rush
            damage: 18,           // hits much harder than Grunt's 8
            attackRange: 1.6,
            attackCooldown: 1.4,
            hitRadius: 0.75
        });
    }

    createModel() {
        const enemyGroup = new THREE.Group();

        const armorMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.5, metalness: 0.6 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e2128, roughness: 0.4, metalness: 0.5 });
        const ventMat = new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xff8822, emissiveIntensity: 2.2 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff4411, emissiveIntensity: 2.5 });

        // --- Torso -- broad and boxy, no hunch, reads as heavy/armored ---
        const torsoGeo = new RoundedBoxGeometry(0.9, 0.95, 0.55, 2, 0.07);
        const torso = new THREE.Mesh(torsoGeo, armorMat);
        torso.position.y = 1.05;
        torso.castShadow = true;
        enemyGroup.add(torso);

        // --- Chest vent ---
        const vent = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.28, 0.06, 2, 0.03), ventMat);
        vent.position.set(0, 0.1, 0.275 + 0.03);
        torso.add(vent);

        // --- Head -- small, sunk into the shoulders ---
        const headGeo = new RoundedBoxGeometry(0.34, 0.3, 0.32, 2, 0.04);
        const head = new THREE.Mesh(headGeo, darkMat);
        head.position.y = 0.475 + 0.08;
        head.castShadow = true;
        torso.add(head);

        const eyeGeo = new THREE.BoxGeometry(0.22, 0.05, 0.05);
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(0, 0.02, 0.16 + 0.02);
        head.add(eye);

        // --- Shoulder pauldrons -- broad, armored silhouette ---
        const pauldronGeo = new RoundedBoxGeometry(0.4, 0.24, 0.4, 2, 0.05);
        const leftPauldron = new THREE.Mesh(pauldronGeo, darkMat);
        leftPauldron.position.set(-0.58, 0.42, 0);
        leftPauldron.castShadow = true;
        torso.add(leftPauldron);
        const rightPauldron = new THREE.Mesh(pauldronGeo, darkMat);
        rightPauldron.position.set(0.58, 0.42, 0);
        rightPauldron.castShadow = true;
        torso.add(rightPauldron);

        // --- Arms -- thick, ending in blocky fists instead of claws ---
        const armGeo = new RoundedBoxGeometry(0.26, 0.7, 0.26, 2, 0.04);
        const leftArm = new THREE.Mesh(armGeo, armorMat);
        leftArm.position.set(-0.58, 0.05, 0);
        leftArm.castShadow = true;
        torso.add(leftArm);
        const rightArm = new THREE.Mesh(armGeo, armorMat);
        rightArm.position.set(0.58, 0.05, 0);
        rightArm.castShadow = true;
        torso.add(rightArm);

        const fistGeo = new RoundedBoxGeometry(0.32, 0.32, 0.32, 2, 0.05);
        const leftFist = new THREE.Mesh(fistGeo, darkMat);
        leftFist.position.set(0, -0.48, 0);
        leftFist.castShadow = true;
        leftArm.add(leftFist);
        const rightFist = new THREE.Mesh(fistGeo, darkMat);
        rightFist.position.set(0, -0.48, 0);
        rightFist.castShadow = true;
        rightArm.add(rightFist);

        // Knuckle glow on each fist -- small "power fist" accent
        const knuckleGlow = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.06, 0.06, 2, 0.02), ventMat);
        knuckleGlow.position.set(0, 0, 0.17);
        leftFist.add(knuckleGlow.clone());
        rightFist.add(knuckleGlow.clone());

        // --- Legs -- wide stance, heavy boots ---
        const legGeo = new RoundedBoxGeometry(0.32, 0.6, 0.32, 2, 0.04);
        const leftLeg = new THREE.Mesh(legGeo, armorMat);
        leftLeg.position.set(-0.24, 0.3, 0);
        leftLeg.castShadow = true;
        enemyGroup.add(leftLeg);
        const rightLeg = new THREE.Mesh(legGeo, armorMat);
        rightLeg.position.set(0.24, 0.3, 0);
        rightLeg.castShadow = true;
        enemyGroup.add(rightLeg);

        const bootGeo = new RoundedBoxGeometry(0.36, 0.18, 0.4, 2, 0.04);
        const leftBoot = new THREE.Mesh(bootGeo, darkMat);
        leftBoot.position.set(0, -0.3 + 0.09, 0.03);
        leftBoot.castShadow = true;
        leftLeg.add(leftBoot);
        const rightBoot = new THREE.Mesh(bootGeo, darkMat);
        rightBoot.position.set(0, -0.3 + 0.09, 0.03);
        rightBoot.castShadow = true;
        rightLeg.add(rightBoot);

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
