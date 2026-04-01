import { collidesAABB, aabbOverlapsFluid, aabbOverlapsBlockId } from './physics.js';
import { BlockId } from './blocktypes.js';

const GRAVITY = -34;
const JUMP = 9.2;
const MOVE = 5.2;
/** Ground speed multiplier when sprinting (double-tap W). */
const SPRINT_MULT = 1.48;
const AIR_MUL = 0.28;
const AIR_FRICTION = 0.96;
const FRICTION = 0.88;
const VOID_Y = -20;
/** Downward speed (positive = blocks/s) below this causes no fall damage. */
const FALL_DAMAGE_THRESHOLD = 12.5;
/** HP per (blocks/s) above threshold. */
const FALL_DAMAGE_MUL = 1.85;

const GRAVITY_WATER = -8;
const WATER_MOVE = 3.05;
const WATER_SPRINT_MUL = 1.18;
const WATER_DRAG = 5.8;
const SWIM_UP_ACCEL = 22;
const SWIM_DOWN_ACCEL = 20;
const WATER_BUOY = 11;
const WATER_VY_MAX = 6.5;
const WATER_VY_MIN = -11;
const WATER_JUMP_OFF_FLOOR = 7.2;

export class Player {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.onGround = false;
    /** True when body AABB overlaps water (not lava). */
    this.inWater = false;
    /** True when body AABB overlaps lava. */
    this.inLava = false;
    this.fellInVoid = false;
    this.eyeHeight = 1.62;
    this.halfW = 0.28;
    this.height = 1.74;
    /** Peak downward speed this airborne spell (blocks/s); reset when grounded. */
    this._maxFallSpeed = 0;
    /** Damage to apply this frame after landing; read by game loop. */
    this.fallDamageThisFrame = 0;
    /** Creative-mode flight: true when the player is flying. */
    this.flying = false;
  }

  aabb() {
    const min = [this.x - this.halfW, this.y, this.z - this.halfW];
    const max = [this.x + this.halfW, this.y + this.height, this.z + this.halfW];
    return { min, max };
  }

  /**
   * Creative-mode flight update: no gravity, no collision, space = ascend, shift = descend.
   * @param {import('./world.js').World} world
   * @param {{ forward: boolean, back: boolean, left: boolean, right: boolean, jump: boolean, swimDown?: boolean, sprint?: boolean }} input
   */
  updateFlying(world, dt, input, yaw) {
    this.onGround = false;
    this.inWater = false;
    this.fallDamageThisFrame = 0;
    this._maxFallSpeed = 0;

    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    let ix = 0;
    let iz = 0;
    if (input.forward) { ix -= sin; iz -= cos; }
    if (input.back)    { ix += sin; iz += cos; }
    if (input.left)    { ix -= cos; iz += sin; }
    if (input.right)   { ix += cos; iz -= sin; }
    const ilen = Math.hypot(ix, iz);
    if (ilen > 1e-6) { ix /= ilen; iz /= ilen; }

    const FLY_SPEED = 12;
    const FLY_SPRINT_MUL = 2.4;
    const FLY_VERT = 10;
    const FLY_DRAG = 6;
    const sprint = !!input.sprint;
    const speed = FLY_SPEED * (sprint ? FLY_SPRINT_MUL : 1);

    const targetVx = ix * speed;
    const targetVz = iz * speed;
    let targetVy = 0;
    if (input.jump) targetVy += FLY_VERT;
    if (input.swimDown) targetVy -= FLY_VERT;

    const damp = Math.exp(-FLY_DRAG * dt);
    this.vx = this.vx * damp + targetVx * (1 - damp);
    this.vz = this.vz * damp + targetVz * (1 - damp);
    this.vy = this.vy * damp + targetVy * (1 - damp);

    // No-clip movement (fly through blocks)
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    this.fellInVoid = false;
  }

  /**
   * @param {{ forward: boolean, back: boolean, left: boolean, right: boolean, jump: boolean, swimDown?: boolean, sprint?: boolean }} input
   * @param {import('./world.js').World} world
   */
  update(world, dt, input, yaw) {
    const wasOnGround = this.onGround;
    this.onGround = false;
    this.fallDamageThisFrame = 0;

    const { min, max } = this.aabb();
    const inLava = aabbOverlapsBlockId(world, min, max, BlockId.LAVA);
    const inWaterFluid =
      aabbOverlapsFluid(world, min, max) && !inLava;
    this.inLava = inLava;
    this.inWater = inWaterFluid;
    const inWater = inWaterFluid;

    if (wasOnGround) {
      this._maxFallSpeed = 0;
    }

    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    let ix = 0;
    let iz = 0;
    if (input.forward) {
      ix -= sin;
      iz -= cos;
    }
    if (input.back) {
      ix += sin;
      iz += cos;
    }
    if (input.left) {
      ix -= cos;
      iz += sin;
    }
    if (input.right) {
      ix += cos;
      iz -= sin;
    }
    const ilen = Math.hypot(ix, iz);
    if (ilen > 1e-6) {
      ix /= ilen;
      iz /= ilen;
    }

    if (inLava) {
      const swimSprint = !!input.sprint && ilen > 1e-6;
      const speed = LAVA_MOVE * (swimSprint ? 1.12 : 1);
      const targetVx = ix * speed;
      const targetVz = iz * speed;
      const damp = Math.exp(-LAVA_DRAG * dt);
      this.vx = this.vx * damp + targetVx * (1 - damp);
      this.vz = this.vz * damp + targetVz * (1 - damp);

      this.vy += LAVA_GRAVITY * dt;
      if (input.jump) {
        this.vy += SWIM_UP_ACCEL * 0.45 * dt;
      }
      if (input.swimDown) {
        this.vy -= SWIM_DOWN_ACCEL * 0.55 * dt;
      }
      if (!input.jump && !input.swimDown) {
        this.vy += LAVA_BUOY * dt;
      }
      this.vy = Math.max(LAVA_VY_MIN, Math.min(LAVA_VY_MAX, this.vy));
    } else if (inWater) {
      const swimSprint = !!input.sprint && ilen > 1e-6;
      const speed = WATER_MOVE * (swimSprint ? WATER_SPRINT_MUL : 1);
      const targetVx = ix * speed;
      const targetVz = iz * speed;
      const damp = Math.exp(-WATER_DRAG * dt);
      this.vx = this.vx * damp + targetVx * (1 - damp);
      this.vz = this.vz * damp + targetVz * (1 - damp);

      this.vy += GRAVITY_WATER * dt;
      if (input.jump) {
        this.vy += SWIM_UP_ACCEL * dt;
      }
      if (input.swimDown) {
        this.vy -= SWIM_DOWN_ACCEL * dt;
      }
      if (!input.jump && !input.swimDown) {
        this.vy += WATER_BUOY * dt;
      }
      this.vy = Math.max(WATER_VY_MIN, Math.min(WATER_VY_MAX, this.vy));
    } else {
      const sprint = !!input.sprint && wasOnGround;
      const speed = MOVE * (wasOnGround ? (sprint ? SPRINT_MULT : 1) : AIR_MUL);
      const targetVx = ix * speed;
      const targetVz = iz * speed;

      if (wasOnGround) {
        this.vx = this.vx * FRICTION + targetVx * (1 - FRICTION);
        this.vz = this.vz * FRICTION + targetVz * (1 - FRICTION);
      } else {
        this.vx = this.vx * AIR_FRICTION + targetVx * (1 - AIR_FRICTION);
        this.vz = this.vz * AIR_FRICTION + targetVz * (1 - AIR_FRICTION);
      }

      if (input.jump && wasOnGround) {
        this.vy = JUMP;
        this.onGround = false;
      }

      this.vy += GRAVITY * dt;
    }

    this.tryMove(world, dt, this.vx * dt, 0, 0);
    if (!inWater && !inLava && this.vy < 0) {
      this._maxFallSpeed = Math.max(this._maxFallSpeed, -this.vy);
    }
    this.tryMove(world, dt, 0, this.vy * dt, 0);
    this.tryMove(world, dt, 0, 0, this.vz * dt);

    if ((inWater || inLava) && input.jump && wasOnGround) {
      this.vy = Math.max(this.vy, inLava ? WATER_JUMP_OFF_FLOOR * 0.55 : WATER_JUMP_OFF_FLOOR);
    }

    if (!this.onGround) {
      const { min: m, max: mx } = this.aabb();
      const e = 0.04;
      this.onGround = collidesAABB(
        world,
        [m[0] + 1e-4, m[1] - e, m[2] + 1e-4],
        [mx[0] - 1e-4, m[1] - 1e-5, mx[2] - 1e-4],
      );
    }

    if (this.onGround && !inWater && !inLava) this.vy = 0;
    else if (this.onGround && (inWater || inLava)) this.vy = Math.min(0, this.vy);

    if (!wasOnGround && this.onGround) {
      const v = this._maxFallSpeed;
      if (v > FALL_DAMAGE_THRESHOLD) {
        this.fallDamageThisFrame = Math.min(
          100,
          Math.floor((v - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_MUL),
        );
      }
    }

    const { min: m2, max: mx2 } = this.aabb();
    if (this.fallDamageThisFrame > 0 && aabbOverlapsFluid(world, m2, mx2)) {
      this.fallDamageThisFrame = 0;
    }

    this.fellInVoid = this.y < VOID_Y;
  }

  /**
   * @param {import('./world.js').World} world
   */
  tryMove(world, dt, dx, dy, dz) {
    const { min, max } = this.aabb();
    const nx = min[0] + dx;
    const ny = min[1] + dy;
    const nz = min[2] + dz;
    const nmax = [max[0] + dx, max[1] + dy, max[2] + dz];

    if (!collidesAABB(world, [nx, ny, nz], nmax)) {
      this.x += dx;
      this.y += dy;
      this.z += dz;
      return;
    }

    if (dy !== 0) {
      let moved = 0;
      const maxIter = Math.ceil(Math.abs(dy) / 0.02);
      for (let i = 0; i < maxIter; i++) {
        const t = Math.min(Math.abs(dy - moved), 0.02) * Math.sign(dy);
        const { min: m, max: mx } = this.aabb();
        const tmin = [m[0], m[1] + t, m[2]];
        const tmax = [mx[0], mx[1] + t, mx[2]];
        if (!collidesAABB(world, tmin, tmax)) {
          this.y += t;
          moved += t;
        } else {
          if (dy < 0) this.onGround = true;
          this.vy = 0;
          return;
        }
      }
      return;
    }

    if (dx !== 0) {
      let moved = 0;
      const maxIter = Math.ceil(Math.abs(dx) / 0.02);
      for (let i = 0; i < maxIter; i++) {
        const remaining = dx - moved;
        const t = Math.abs(remaining) < 0.02 ? remaining : 0.02 * Math.sign(remaining);
        const { min: m, max: mx } = this.aabb();
        const tmin = [m[0] + t, m[1], m[2]];
        const tmax = [mx[0] + t, mx[1], mx[2]];
        if (!collidesAABB(world, tmin, tmax)) {
          this.x += t;
          moved += t;
        } else {
          this.vx = 0;
          return;
        }
      }
      return;
    }

    if (dz !== 0) {
      let moved = 0;
      const maxIter = Math.ceil(Math.abs(dz) / 0.02);
      for (let i = 0; i < maxIter; i++) {
        const remaining = dz - moved;
        const t = Math.abs(remaining) < 0.02 ? remaining : 0.02 * Math.sign(remaining);
        const { min: m, max: mx } = this.aabb();
        const tmin = [m[0], m[1], m[2] + t];
        const tmax = [mx[0], mx[1], mx[2] + t];
        if (!collidesAABB(world, tmin, tmax)) {
          this.z += t;
          moved += t;
        } else {
          this.vz = 0;
          return;
        }
      }
    }
  }
}
