// LANTERN ROW — the player. Mouse look, acceleration-based movement, crouch and
// jump, and the view model: a low-poly rifle that kicks, sways and reloads in view.
// The player is agent 0 of the simulation; this module only drives its intent.
import * as THREE from 'three';
import { collideCircle } from './world.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.15;
const RADIUS = 0.35;
const WALK_SPEED = 4.4;
const RUN_SPEED = 5.6;
const CROUCH_SPEED = 2.3;
const ACCEL = 34;

export function createPlayer(scene) {
  // View model: a simple rifle built from boxes, held at the bottom-right of view.
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffb347, roughness: 0.4, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.42);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.22), wood);
  stock.position.set(0, -0.01, 0.32);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.08), wood);
  grip.position.set(0, -0.12, 0.12);
  grip.rotation.x = 0.35;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), amber);
  sight.position.set(0, 0.09, -0.08);
  group.add(body, barrel, stock, grip, sight);
  group.position.set(0.28, -0.26, -0.55);
  // The view model is parented to the camera by main.js, so it follows the view.

  const state = {
    yaw: 0, // faces north (towards the sites) at spawn
    pitch: 0,
    eyeH: EYE_STAND,
    crouched: false,
    recoil: 0,
    sway: 0,
    bob: 0,
    scoped: false,
    velX: 0,
    velZ: 0,
  };

  return {
    state,
    group,
    reset(yaw) {
      state.yaw = yaw;
      state.pitch = 0;
      state.recoil = 0;
      state.velX = 0;
      state.velZ = 0;
      state.scoped = false;
      state.crouched = false;
    },
    // Drive the agent's movement intent from keys. Returns the wish direction.
    // The simulation owns the position; this only turns intent into velocity.
    step(agent, input, dt) {
      const look = input.consumeLook();
      const sens = state.scoped ? 0.0011 : 0.0021;
      state.yaw -= look.dx * sens;
      state.pitch -= look.dy * sens;
      state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch));
      agent.yaw = state.yaw;
      agent.pitch = state.pitch + agent.recoilPitch; // recoil rides on top of aim

      state.crouched = !!(input.keys.KeyC || input.keys.ControlLeft);
      const speed = state.crouched ? CROUCH_SPEED : (input.keys.ShiftLeft ? WALK_SPEED : RUN_SPEED);
      let fx = 0, fz = 0;
      if (input.keys.KeyW) fz -= 1;
      if (input.keys.KeyS) fz += 1;
      if (input.keys.KeyA) fx -= 1;
      if (input.keys.KeyD) fx += 1;
      const len = Math.hypot(fx, fz) || 1;
      fx /= len; fz /= len;
      // Wish velocity from the movement keys, rotated by yaw.
      const fwdX = -Math.sin(state.yaw), fwdZ = -Math.cos(state.yaw);
      const rightX = Math.cos(state.yaw), rightZ = -Math.sin(state.yaw);
      const wishX = fwdX * -fz + rightX * fx;
      const wishZ = fwdZ * -fz + rightZ * fx;
      const k = Math.min(1, ACCEL * dt / speed);
      state.velX += (wishX * speed - state.velX) * k;
      state.velZ += (wishZ * speed - state.velZ) * k;
      agent.pos.x += state.velX * dt;
      agent.pos.z += state.velZ * dt;
      collideCircle(agent.pos, RADIUS);
      agent.moving = Math.hypot(state.velX, state.velZ) > 0.6;
      agent.crouched = state.crouched;
      const targetEye = state.crouched ? EYE_CROUCH : EYE_STAND;
      state.eyeH += (targetEye - state.eyeH) * Math.min(1, dt * 10);
      agent.eyeH = state.eyeH;
      if (agent.moving) state.bob += dt * Math.hypot(state.velX, state.velZ) * 1.6;
      state.recoil = Math.max(0, state.recoil - dt * 2.2);
      state.sway += dt;
      return { speed: Math.hypot(state.velX, state.velZ) };
    },
    // The view model follows the camera: kick on fire, dip on reload, sway on move.
    updateView(camera, weapon, reloading, firing) {
      group.visible = true;
      const kick = state.recoil * 0.09 + (firing ? 0.012 : 0);
      const bobY = Math.sin(state.bob * 2) * 0.008;
      const bobX = Math.cos(state.bob) * 0.006;
      const dip = reloading ? -0.12 + Math.sin(state.sway * 6) * 0.02 : 0;
      const zoom = state.scoped ? 0.16 : 0.28;
      group.position.set(zoom + bobX, -0.26 + bobY + dip, -0.55 + kick);
      group.rotation.x = kick * 1.4 + state.recoil * 0.12;
      group.rotation.y = bobX * 0.4;
      void weapon;
      void camera;
    },
    hideView() { group.visible = false; },
  };
}
