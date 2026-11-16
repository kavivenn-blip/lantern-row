// LANTERN ROW — effects. Tracers, muzzle flashes, hit sparks and smoke are pooled
// meshes, reused across the match: nothing is allocated in the hot loop, and the
// scene never grows a mesh per shot. Smoke is a cluster of translucent spheres that
// also blocks bot sight while it lives.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 24;
const MAX_SMOKE = 6;

export function createFx(scene) {
  const tracerGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 5);
  tracerGeo.rotateX(Math.PI / 2);
  const tracerMat = new THREE.MeshBasicMaterial({
    color: 0xffc46b, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
  });
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i++) {
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, t: 0 });
  }
  let tracerIdx = 0;

  const sparkGeo = new THREE.SphereGeometry(0.09, 6, 5);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const sparks = [];
  for (let i = 0; i < MAX_SPARKS; i++) {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, t: 0, vx: 0, vy: 0, vz: 0 });
  }
  let sparkIdx = 0;

  const smokeGeo = new THREE.SphereGeometry(1, 10, 8);
  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0xb8bcbc, transparent: true, opacity: 0.55, roughness: 1,
  });
  const smokes = [];
  for (let i = 0; i < MAX_SMOKE; i++) {
    const group = new THREE.Group();
    for (let j = 0; j < 7; j++) {
      const s = new THREE.Mesh(smokeGeo, smokeMat);
      s.position.set((j % 3 - 1) * 1.1, (j * 0.37) % 1.2, ((j * 2) % 3 - 1) * 1.1);
      s.scale.setScalar(1.4 + (j % 3) * 0.4);
      group.add(s);
    }
    group.visible = false;
    scene.add(group);
    smokes.push({ group, t: 0, x: 0, y: 0, z: 0, r: 3 });
  }
  let smokeIdx = 0;

  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _mid = new THREE.Vector3();

  return {
    tracer(from, to, color) {
      const tr = tracers[tracerIdx];
      tracerIdx = (tracerIdx + 1) % MAX_TRACERS;
      _a.copy(from); _b.copy(to);
      _mid.addVectors(_a, _b).multiplyScalar(0.5);
      tr.mesh.position.copy(_mid);
      tr.mesh.lookAt(_b);
      tr.mesh.scale.set(1, 1, _a.distanceTo(_b));
      tr.mesh.material = tracerMat;
      tr.mesh.visible = true;
      tr.t = 0.09;
      void color;
    },
    spark(p) {
      const sp = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % MAX_SPARKS;
      sp.mesh.position.copy(p);
      sp.mesh.visible = true;
      sp.t = 0.22;
      sp.vx = (Math.random() - 0.5) * 3;
      sp.vy = Math.random() * 2 + 1;
      sp.vz = (Math.random() - 0.5) * 3;
    },
    smoke(x, z, duration) {
      const sm = smokes[smokeIdx];
      smokeIdx = (smokeIdx + 1) % MAX_SMOKE;
      sm.group.position.set(x, 1.1, z);
      sm.group.visible = true;
      sm.t = duration;
      sm.x = x; sm.z = z; sm.r = 3.2;
    },
    // Is a point inside any live smoke cloud? Bots treat smoke as a wall for sight.
    inSmoke(x, z) {
      for (const sm of smokes) {
        if (sm.t <= 0) continue;
        const dx = x - sm.x, dz = z - sm.z;
        if (dx * dx + dz * dz < sm.r * sm.r) return true;
      }
      return false;
    },
    smokeBetween(ax, az, bx, bz) {
      for (const sm of smokes) {
        if (sm.t <= 0) continue;
        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-6) continue;
        let t = ((sm.x - ax) * dx + (sm.z - az) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + dx * t - sm.x, cz = az + dz * t - sm.z;
        if (cx * cx + cz * cz < sm.r * sm.r) return true;
      }
      return false;
    },
    update(dt) {
      for (const tr of tracers) {
        if (tr.t <= 0) continue;
        tr.t -= dt;
        if (tr.t <= 0) tr.mesh.visible = false;
      }
      for (const sp of sparks) {
        if (sp.t <= 0) continue;
        sp.t -= dt;
        sp.mesh.position.x += sp.vx * dt;
        sp.mesh.position.y += sp.vy * dt;
        sp.mesh.position.z += sp.vz * dt;
        sp.vy -= 6 * dt;
        if (sp.t <= 0) sp.mesh.visible = false;
      }
      for (const sm of smokes) {
        if (sm.t <= 0) continue;
        sm.t -= dt;
        sm.group.rotation.y += dt * 0.12;
        if (sm.t <= 0) sm.group.visible = false;
      }
    },
  };
}
