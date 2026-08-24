import * as THREE from 'three';

// ============================================================
// ENEMY (base class)
// Same pattern as Weapon.js / PlayerClass.js: everything enemies have
// in common lives here (stats, chase-the-player movement, facing, the
// procedural walk-cycle, taking damage) -- a concrete enemy (see
// Grunt.js, Shooter.js) only needs to provide its own 3D model via
// createModel() and its own attack behavior via onAttack().
//
// Unlike the player, an enemy's WHOLE body just faces wherever it's
// currently moving (no separate legs-vs-aim split like the player has)
// -- there's no camera to aim independently of, so this is simpler by
// construction 
// ============================================================
export class Enemy {
    constructor({ health, speed, damage, attackRange, attackCooldown, hitRadius }) {
        this.maxHealth = health;
        this.health = health;
        this.speed = speed;             // units per second while chasing
        this.damage = damage;           // meaning depends on the subclass's onAttack() (melee hit vs bullet damage)
        this.attackRange = attackRange; // stops closing the distance once within this
        this.attackCooldown = attackCooldown;
        this.attackTimer = 0;           // counts down; attacks again once <= 0
        this.hitRadius = hitRadius;     // used by main.js for bullet-hit distance checks

        this.walkTime = 0;              // drives the walk-cycle sine wave, only advances while moving

        // Built by the subclass; must set this.leftLeg/rightLeg/leftArm/
        // rightArm (all optional -- animateWalk() just skips whichever
        // parts a given model doesn't define) via the returned group's
        // userData, mirroring how createPlayer() reads player.userData.
        this.mesh = this.createModel();
    }

    // Must be overridden by every subclass: builds and returns the
    // THREE.Group for this enemy's visual model.
    createModel() {
        throw new Error('createModel() must be implemented by the Enemy subclass');
    }

    // Must be overridden by every subclass: called once whenever this
    // enemy is in range and its attack cooldown is ready. `context` is a
    // plain object main.js builds each frame with whatever the attack
    // needs (see updateEnemies() in main.js) -- e.g. a callback to damage
    // the player directly (melee) or the scene + player position to spawn
    // a bullet toward (ranged). Keeping this a hook instead of main.js
    // branching on "is this a Grunt or a Shooter" is what lets main.js's
    // enemy-handling code stay the same no matter how many enemy types
    // end up existing.
    onAttack(context) {
        // no-op by default
    }

    // Runs every frame for every live enemy (see updateEnemies() in
    // main.js): moves toward the player until within attackRange, always
    // faces the player, and triggers onAttack() on cooldown once in range.
    update(deltaTime, playerPosition, attackContext) {
        const toPlayer = new THREE.Vector3().subVectors(playerPosition, this.mesh.position);
        toPlayer.y = 0; // stay on the ground plane -- ignore the player's jump height
        const distance = toPlayer.length();
        const isMoving = distance > this.attackRange;

        if (isMoving) {
            toPlayer.normalize();
            this.mesh.position.addScaledVector(toPlayer, this.speed * deltaTime);
        }

        // Same "front = (sin(yaw), cos(yaw))" convention used everywhere
        // else in this project (see createPlayer() in main.js) -- always
        // face the player, whether closing in or holding position to attack.
        this.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

        this.animateWalk(isMoving, deltaTime);

        this.attackTimer -= deltaTime;
        if (!isMoving && this.attackTimer <= 0) {
            this.attackTimer = this.attackCooldown;
            this.onAttack(attackContext);
        }
    }

    // Procedural walk-cycle, same sine-wave-on-rotation.x trick as the
    // player's animateWalk() in main.js -- no imported animation, and no
    // walkDirSign correction needed here since (unlike the player) this
    // body always faces exactly the direction it's moving.
    animateWalk(isMoving, deltaTime) {
        if (isMoving) this.walkTime += deltaTime * 7;

        const amplitude = isMoving ? 0.55 : 0;
        const swing = Math.sin(this.walkTime) * amplitude;

        if (this.leftLeg) this.leftLeg.rotation.x = swing;
        if (this.rightLeg) this.rightLeg.rotation.x = -swing;
        if (this.leftArm) this.leftArm.rotation.x = -swing;
        if (this.rightArm) this.rightArm.rotation.x = swing;
    }

    // Returns true once this hit has brought the enemy's health to 0 or
    // below, so main.js knows to remove it from the scene.
    takeDamage(amount) {
        this.health -= amount;
        return this.health <= 0;
    }
}
