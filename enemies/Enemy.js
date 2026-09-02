import * as THREE from 'three';

// Matches the player's own movement clamp (see updateGame() in main.js)
// -- enemies weren't ever bound by it before (they normally converge
// toward the player, who's already inside it, so it never came up), but
// the retreat/kiting behavior below (see retreatRange) can walk an
// enemy straight through the arena's perimeter wall without this, since
// the walls themselves aren't registered obstacles (the player's own
// boundary clamp is what actually keeps things inside them).
const ARENA_LIMIT = 32; 

// Same jump/gravity numbers as the player's own jump() / updateVerticalMovement()
// in main.js (jumpForce=10, gravity=-25 -> max height exactly 2.0) --
// keeping them identical means an enemy can reach exactly the same
// jump-platforms/crates the player can, no more and no less.
const ENEMY_GRAVITY = -25;
const ENEMY_JUMP_FORCE = 10;
const MAX_ENEMY_JUMP_HEIGHT = 2.0; // must match MAX_JUMP_HEIGHT in environment.js

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
    constructor({ health, speed, damage, attackRange, attackCooldown, hitRadius, moveRadius, retreatRange = 0 }) {
        this.maxHealth = health;
        this.health = health;
        this.speed = speed;             // units per second while chasing
        this.damage = damage;           // meaning depends on the subclass's onAttack() (melee hit vs bullet damage)
        this.attackRange = attackRange; // stops closing the distance once within this
        this.attackCooldown = attackCooldown;
        this.attackTimer = 0;           // counts down; attacks again once <= 0
        this.hitRadius = hitRadius;     // used by main.js for bullet-hit distance checks -- how big a target this enemy is for incoming bullets
        // How much clearance this enemy needs from obstacles while
        // MOVING (see update()) -- defaults to hitRadius, which is fine
        // for every normal-sized enemy, but a visually huge one (see
        // Boss.js, which quadruples its own model scale) needs this set
        // much smaller than its bullet-hit radius: otherwise its own
        // oversized "personal space" reads almost every obstacle in the
        // arena as blocking, and it can never actually get close enough
        // to stop and attack.
        this.moveRadius = moveRadius ?? hitRadius;
        // 0 = never retreats (stands its ground and strafes once in
        // range, like Grunt/Shooter/Brute). Kiting enemies (see
        // Marksman.js) set this above 0: if the player closes to within
        // this distance, the enemy backs away instead of strafing.
        this.retreatRange = retreatRange;

        // A fixed personal "flank" angle (see update()) -- makes a group
        // of enemies fan out into a loose surround instead of all
        // converging on the exact same point and queueing up in a
        // single-file line behind each other.
        this.flankAngle = (Math.random() - 0.5) * 1.3; // up to ~37° either side
        // Which way this enemy strafes while stopped in attack range
        // (see update()) -- fixed per enemy so a whole group doesn't
        // drift in lockstep.
        this.strafeSign = Math.random() < 0.5 ? 1 : -1;

        this.walkTime = 0;              // drives the walk-cycle sine wave, only advances while moving

        // Vertical state for jumping onto crates/jump-platforms (see
        // update()) -- same gravity/landing model as the player's own
        // velocityY/isGrounded in main.js, just kept per-enemy here
        // instead of as globals.
        this.velocityY = 0;
        this.isGrounded = true;

        // This enemy's own current movement velocity (units/sec, XZ --
        // recomputed every frame in update() from how far it actually
        // moved since last frame). Same idea as main.js's own
        // playerVelocity, just per-enemy: lets the PLAYER lead a
        // strafing/retreating target (see predictEnemyPosition() in
        // main.js) the same way this enemy already leads the player via
        // leadTarget() below -- without it, a shot aimed at exactly
        // where a strafing enemy is right now can still miss, since
        // they've stepped aside by the time it actually arrives.
        this.velocity = new THREE.Vector3();
        this._prevPosition = null; // set on the first update() call, see there

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
    // main.js): moves toward the player until within attackRange (steering
    // around crates/pillars via attackContext.checkObstacle(), see below),
    // always faces the player, and triggers onAttack() on cooldown once
    // in range. A few things make this read as smarter than a plain
    // beeline: the approach angle bends by this enemy's own flankAngle
    // while still far off (so a group fans out into a surround instead
    // of queueing up single-file), it steers around an obstacle it's
    // about to walk straight into instead of just pushing against it,
    // and it keeps strafing sideways (or backing away, for kiting
    // enemies -- see retreatRange) once in range instead of just
    // standing still.
    update(deltaTime, playerPosition, attackContext) {
        // Velocity from how far this enemy actually moved since the last
        // frame (see this.velocity above) -- computed BEFORE this
        // frame's own movement below, same one-frame-lagged approach
        // main.js uses for the player's own playerVelocity. Skipped on
        // the very first frame (no previous position to compare against
        // yet) so it doesn't read a huge bogus velocity from (0,0,0).
        if (this._prevPosition) {
            this.velocity.subVectors(this.mesh.position, this._prevPosition).divideScalar(Math.max(deltaTime, 0.0001));
        } else {
            this._prevPosition = new THREE.Vector3();
        }
        this._prevPosition.copy(this.mesh.position);

        const toPlayer = new THREE.Vector3().subVectors(playerPosition, this.mesh.position);
        toPlayer.y = 0; // stay on the ground plane -- ignore the player's jump height
        const distance = toPlayer.length();
        const isMoving = distance > this.attackRange;

        if (isMoving) {
            const moveDir = toPlayer.clone().normalize();

            // Blend in this enemy's personal flank angle -- full effect
            // while still far away, fading to zero as it nears
            // attackRange so the final approach still converges cleanly
            // instead of orbiting forever just out of reach.
            const flankBlend = Math.min(1, Math.max(0, (distance - this.attackRange) / 8));
            if (flankBlend > 0) {
                moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.flankAngle * flankBlend);
            }

            // Obstacle avoidance: the flank/slide tricks above only
            // generate real sideways drift if the desired direction
            // ALREADY has a sideways component -- an enemy walking
            // straight at the player with a crate sitting exactly in
            // between has almost none, and would otherwise just push
            // against it forever. Sampling a point a bit ahead along the
            // current path and, if it's blocked, steering hard to one
            // side (this enemy's own fixed handedness, so the escape is
            // smooth instead of flip-flopping frame to frame) fixes that
            // regardless of approach angle.
            const lookAhead = this.moveRadius + 1.4;
            const aheadX = this.mesh.position.x + moveDir.x * lookAhead;
            const aheadZ = this.mesh.position.z + moveDir.z * lookAhead;
            if (attackContext.checkObstacle(aheadX, aheadZ, this.mesh.position.y, this.moveRadius)) {
                // Jump over/onto it instead of detouring if what's blocking
                // the path is actually climbable and within jump range
                // (getClimbableHeight -- see environment.js -- reuses the
                // exact same jump-platform/crate system the player's own
                // jump() does). Falls back to the old steer-around-it
                // behavior for anything too tall to climb (pillars/beacons)
                // or while already airborne.
                const climbHeight = attackContext.getClimbableHeight ? attackContext.getClimbableHeight(aheadX, aheadZ) : null;
                if (this.isGrounded && climbHeight !== null && climbHeight - this.mesh.position.y <= MAX_ENEMY_JUMP_HEIGHT) {
                    this.velocityY = ENEMY_JUMP_FORCE;
                    this.isGrounded = false;
                } else {
                    moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.strafeSign * (Math.PI / 2.2)); // ~82° -- steer hard around it
                }
            }

            const nextX = this.mesh.position.x + moveDir.x * this.speed * deltaTime;
            const nextZ = this.mesh.position.z + moveDir.z * this.speed * deltaTime;

            // Same per-axis sliding resolution the player's own movement
            // uses (see updateGame() in main.js): checked separately per
            // axis so bumping into a crate/pillar along one axis doesn't
            // also cancel movement along the other -- lets an enemy slide
            // along an obstacle's edge instead of just stopping dead
            // against it. checkObstacle() is main.js's collidesWithObstacle().
            // Also clamped to ARENA_LIMIT, same boundary the player's own
            // movement respects.
            const movedX = nextX > -ARENA_LIMIT && nextX < ARENA_LIMIT && !attackContext.checkObstacle(nextX, this.mesh.position.z, this.mesh.position.y, this.moveRadius);
            if (movedX) this.mesh.position.x = nextX;
            const movedZ = nextZ > -ARENA_LIMIT && nextZ < ARENA_LIMIT && !attackContext.checkObstacle(this.mesh.position.x, nextZ, this.mesh.position.y, this.moveRadius);
            if (movedZ) this.mesh.position.z = nextZ;
            if (!movedX && !movedZ) this.strafeSign *= -1; // fully stuck this frame
        } else {
            // In range. Kiting enemies (retreatRange > 0, see Marksman.js)
            // back away once the player gets too close instead of
            // strafing; everyone else strafes sideways instead of
            // standing dead still -- reads as far more alive/threatening,
            // and makes it harder to land a clean shot either way. Flips
            // direction if the step itself gets blocked (e.g. backed into
            // a crate, or the arena's own boundary) rather than just
            // freezing against it -- this ARENA_LIMIT clamp specifically
            // is what stops a retreating enemy from backing straight
            // through the (otherwise non-collidable) perimeter wall.
            const isRetreating = this.retreatRange > 0 && distance < this.retreatRange;
            const stepDir = isRetreating
                ? toPlayer.clone().normalize().multiplyScalar(-1)
                : new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar(this.strafeSign);
            const stepSpeed = this.speed * 0.5;
            const nextX = this.mesh.position.x + stepDir.x * stepSpeed * deltaTime;
            const nextZ = this.mesh.position.z + stepDir.z * stepSpeed * deltaTime;

            const movedX = nextX > -ARENA_LIMIT && nextX < ARENA_LIMIT && !attackContext.checkObstacle(nextX, this.mesh.position.z, this.mesh.position.y, this.moveRadius);
            if (movedX) this.mesh.position.x = nextX;
            const movedZ = nextZ > -ARENA_LIMIT && nextZ < ARENA_LIMIT && !attackContext.checkObstacle(this.mesh.position.x, nextZ, this.mesh.position.y, this.moveRadius);
            if (movedZ) this.mesh.position.z = nextZ;
            if (!movedX && !movedZ) this.strafeSign *= -1;
        }

        // Belt-and-suspenders against getting stuck (see
        // resolveObstaclePenetration() in main.js): the per-axis sliding
        // just above, and the look-ahead steering further up, both only
        // ever help when there's some sideways room to work with -- this
        // directly guarantees a way out regardless of approach angle.
        if (attackContext.resolvePenetration) {
            attackContext.resolvePenetration(this.mesh.position, this.moveRadius);
            // The push above ignores the arena boundary (it only knows
            // about obstacles) -- re-clamp in case it happened to shove
            // an enemy stuck near the edge past it.
            this.mesh.position.x = Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, this.mesh.position.x));
            this.mesh.position.z = Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, this.mesh.position.z));
        }

        // --- Vertical physics (jumping / landing / falling) ---
        // Runs every frame regardless of whether this enemy is currently
        // airborne -- same as the player's own updateVerticalMovement()
        // in main.js, and for the same reason: an enemy that walks off
        // the edge of a platform it jumped onto (chasing a player who
        // moved away) needs to start falling again on its own, not just
        // freeze at that height once isGrounded was last set true.
        this.velocityY += ENEMY_GRAVITY * deltaTime;
        this.mesh.position.y += this.velocityY * deltaTime;
        const groundY = attackContext.getGroundHeight
            ? attackContext.getGroundHeight(this.mesh.position.x, this.mesh.position.z, this.mesh.position.y)
            : 0;
        if (this.mesh.position.y <= groundY) {
            this.mesh.position.y = groundY;
            this.velocityY = 0;
            this.isGrounded = true;
        } else {
            this.isGrounded = false;
        }

        // Same "front = (sin(yaw), cos(yaw))" convention used everywhere
        // else in this project (see createPlayer() in main.js) -- always
        // face the player, whether closing in, strafing, or attacking.
        this.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

        this.animateWalk(true, deltaTime); // strafing counts as "moving" too, for the walk-cycle

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

    // For ranged subclasses (see Shooter.js/Boss.js's onAttack()):
    // returns a PREDICTED aim point instead of the player's exact
    // current position -- their current velocity (see updateEnemies()
    // in main.js) times how long a shot at `bulletSpeed` would actually
    // take to cross the distance from `spawnPos`. Leading a moving
    // target like this is what actually makes ranged enemies feel
    // "smarter" instead of just spamming shots at where you used to be.
    leadTarget(context, spawnPos, bulletSpeed) {
        const target = context.playerPosition.clone();
        if (context.playerVelocity) {
            const travelTime = target.distanceTo(spawnPos) / bulletSpeed;
            target.addScaledVector(context.playerVelocity, travelTime);
        }
        return target;
    }

    // Returns true once this hit has brought the enemy's health to 0 or
    // below, so main.js knows to remove it from the scene.
    takeDamage(amount) {
        this.health -= amount;
        return this.health <= 0;
    }
}
