import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerState, stepPlayer, PARAMS } from '../src/player.js';
import { buildTrack } from '../src/track.js';
import { verde } from '../src/tracks/verde.js';

const track = buildTrack(verde);

function run(state, steer, seconds) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) state = stepPlayer(state, steer, dt, track);
  return state;
}

test('gravity accelerates the player down the slope', () => {
  const st = run(createPlayerState(), 0, 3);
  assert.ok(st.speed > 2, `speed=${st.speed}`);
  assert.ok(st.s > 3, `s=${st.s}`);
});

test('steering changes heading and drifts laterally', () => {
  let st = { ...createPlayerState(), speed: 10 };
  st = run(st, 1, 0.5);
  assert.ok(st.heading > 0.2, `heading=${st.heading}`);
  assert.ok(st.lat > 0.1, `lat=${st.lat}`);
});

test('pointing straight downhill gives a tuck acceleration bonus', () => {
  const noTuck = { ...PARAMS, tuckAccel: 0 };
  const withTuck = run({ ...createPlayerState(), speed: 5 }, 0, 2);
  let plain = { ...createPlayerState(), speed: 5 };
  const dt = 1 / 60;
  for (let t = 0; t < 2; t += dt) plain = stepPlayer(plain, 0, dt, track, noTuck);
  assert.ok(withTuck.speed > plain.speed + 1, `${withTuck.speed} vs ${plain.speed}`);
});

test('the tuck bonus fades out when carving', () => {
  // Con heading más allá de tuckWindow no hay bono: mismo resultado con y sin tuckAccel.
  const noTuck = { ...PARAMS, tuckAccel: 0 };
  const start = { ...createPlayerState(), s: 30, speed: 8, heading: PARAMS.tuckWindow + 0.1 };
  const a = stepPlayer(start, 0, 1 / 60, track);
  const b = stepPlayer(start, 0, 1 / 60, track, noTuck);
  assert.equal(a.speed, b.speed);
});

test('carving brakes compared to going straight', () => {
  const straight = run({ ...createPlayerState(), speed: 10 }, 0, 1.2);
  let carving = { ...createPlayerState(), speed: 10 };
  carving = run(carving, 1, 0.6);
  carving = run(carving, -1, 0.6);
  assert.ok(carving.speed < straight.speed, `${carving.speed} vs ${straight.speed}`);
});

test('hitting a tree causes a fall: speed 0 and penalty timer', () => {
  const tree = track.obstacles.find((o) => o.type === 'tree');
  let st = { ...createPlayerState(), s: tree.s - 5, lat: tree.lat, speed: 12 };
  st = run(st, 0, 1);
  assert.equal(st.fallen, true);
  assert.equal(st.speed, 0);
  assert.ok(st.fallTimer > 0);
});

test('hitting a rock causes a fall like a tree', () => {
  const rock = track.obstacles.find((o) => o.type === 'rock');
  assert.ok(rock, 'Verde should have rock obstacles');
  let st = { ...createPlayerState(), s: rock.s - 5, lat: rock.lat, speed: 12 };
  st = run(st, 0, 1);
  assert.equal(st.fallen, true);
  assert.equal(st.speed, 0);
});

test('going off-piste causes a fall and re-centers inside the track', () => {
  let st = { ...createPlayerState(), s: 100, lat: 0, speed: 12 };
  st = run(st, 1, 3);
  assert.equal(st.fallen, true);
  assert.ok(Math.abs(st.lat) <= track.width / 2);
});

test('fall recovers after the penalty', () => {
  let st = { ...createPlayerState(), s: 100, speed: 0, fallen: true, fallTimer: PARAMS.fallPenalty };
  st = run(st, 0, PARAMS.fallPenalty + 0.1);
  assert.equal(st.fallen, false);
});

test('ramps launch the player and steering is locked in the air', () => {
  const jump = track.obstacles.find((o) => o.type === 'jump');
  let st = { ...createPlayerState(), s: jump.s - 3, lat: jump.lat, speed: 14 };
  st = run(st, 0, 0.5);
  assert.equal(st.airborne, true);
  const a = stepPlayer(st, 1, 1 / 60, track);
  const b = stepPlayer(st, -1, 1 / 60, track);
  assert.equal(a.heading, b.heading);
});

test('the player lands after a jump', () => {
  const jump = track.obstacles.find((o) => o.type === 'jump');
  let st = { ...createPlayerState(), s: jump.s - 3, lat: jump.lat, speed: 14 };
  st = run(st, 0, 4);
  assert.equal(st.airborne, false);
  assert.equal(st.height, 0);
});

test('coasting straight through a curve drifts toward the outside (curvature/heading sign contract)', () => {
  // Self-locating: scan for the first s with sustained curvature so this survives track tweaks.
  let s0 = null;
  let curvature0 = 0;
  for (let s = 0; s < track.length - 20; s += 10) {
    const f = track.frameAt(s);
    const fAhead = track.frameAt(s + 18); // ~1.5s at speed 12
    if (Math.abs(f.curvature) > 0.005 && Math.sign(f.curvature) === Math.sign(fAhead.curvature)) {
      s0 = s;
      curvature0 = f.curvature;
      break;
    }
  }
  assert.ok(s0 !== null, 'no sustained-curvature segment found on track');

  let st = { ...createPlayerState(), s: s0, lat: 0, heading: 0, speed: 12 };
  st = run(st, 0, 1.5);

  // curvature > 0 = left turn -> drift right = lat < 0 (and vice versa): lat and curvature have opposite signs.
  assert.ok(
    Math.sign(st.lat) === -Math.sign(curvature0),
    `expected lat to drift opposite curvature sign: curvature=${curvature0}, lat=${st.lat}`,
  );
});

test('holding a full turn never soft-locks the player at zero speed', () => {
  // Shallowest part of the track (near the finish): hold full lock from standstill.
  let st = { ...createPlayerState(), s: track.length - 25, lat: 0, speed: 0 };
  const dt = 1 / 60;
  for (let t = 0; t < 6; t += dt) {
    st = stepPlayer(st, 1, dt, track);
    if (st.fallen) { st = { ...st, fallen: false, fallTimer: 0 }; } // ignore off-piste falls; we only care about forward motion
  }
  assert.ok(st.speed > 0.3, `speed=${st.speed} — player stalled while holding full lock`);
});
