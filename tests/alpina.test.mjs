import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/track.js';
import { alpina } from '../src/tracks/alpina.js';
import { createPlayerState, stepPlayer, PARAMS } from '../src/player.js';

const track = buildTrack(alpina);

test('alpina combines sustained gentle and steep sections without uphill stalls', () => {
  assert.ok(track.length > 1250 && track.length < 1450);
  let gentle = 0;
  let steep = 0;
  for (let s = 0; s < track.length; s += 2) {
    const { tan } = track.frameAt(s);
    const grade = -tan.y / Math.hypot(tan.x, tan.z);
    assert.ok(grade > 0.04 && grade < 0.42, `grade=${grade} at ${s} m`);
    if (grade < 0.12) gentle += 2;
    if (grade > 0.28) steep += 2;
  }
  assert.ok(gentle > 300, `only ${gentle} m of gentle terrain`);
  assert.ok(steep > 180, `only ${steep} m of steep terrain`);
});

test('alpina has turns in both directions that remain followable at maximum speed', () => {
  let left = 0;
  let right = 0;
  for (let s = 5; s < track.length - 5; s += 2) {
    const { curvature } = track.frameAt(s);
    assert.ok(Math.abs(curvature) * PARAMS.maxSpeed < PARAMS.turnRate);
    assert.ok(Math.abs(curvature) * (track.width / 2 + 25) < 1, 'snow ribbons must not fold');
    if (curvature > 0.003) left++;
    if (curvature < -0.003) right++;
  }
  assert.ok(left > 30 && right > 30);
});

test('alpina keeps obstacles within the piste and clear of the gates', () => {
  for (const o of track.obstacles) {
    assert.ok(o.s > 50 && o.s < track.length - 50);
    if (o.type !== 'jump') assert.ok(Math.abs(o.lat) >= 3.4);
    assert.ok(Math.abs(o.lat) <= track.width / 2 - 1.5);
  }
});

test('alpina can be completed with the existing physics through every slope transition', () => {
  let player = createPlayerState();
  const dt = 1 / 60;
  let elapsed = 0;
  let takeoffs = 0;
  let landings = 0;
  while (player.s < track.length - 15 && elapsed < 180) {
    const ahead = track.frameAt(player.s + 8);
    const feedForward = ahead.curvature * player.speed / PARAMS.turnRate;
    const targetHeading = Math.max(-0.5, Math.min(0.5, -0.06 * player.lat));
    const steer = Math.max(-1, Math.min(1, feedForward + (targetHeading - player.heading) * 3));
    const airborne = player.airborne;
    player = stepPlayer(player, steer, dt, track);
    if (!airborne && player.airborne) takeoffs++;
    if (airborne && !player.airborne) landings++;
    assert.ok(!player.fallen, `fell at ${player.s} m`);
    assert.ok(Number.isFinite(player.speed) && Number.isFinite(player.lat));
    elapsed += dt;
  }
  assert.equal(takeoffs, 3, 'all three ramps launch the skier');
  assert.equal(landings, 3, 'all jumps land safely');
  assert.ok(player.s >= track.length - 15, `stalled at ${player.s} m after ${elapsed}s`);
});


test('alpina ramps have room to bypass and unobstructed landings', () => {
  const ramps = track.obstacles.filter((o) => o.type === 'jump');
  assert.equal(ramps.length, 3);
  assert.ok(track.obstacles.filter((o) => o.type === 'rock').length >= 10);
  for (const ramp of ramps) {
    assert.ok(Math.abs(ramp.lat) + PARAMS.rampHalfWidth + 2 < track.width / 2);
    for (const obstacle of track.obstacles) {
      if (obstacle.type === 'jump') continue;
      const ds = obstacle.s - ramp.s;
      if (ds > -15 && ds < 65) {
        assert.ok(Math.abs(obstacle.lat - ramp.lat) > PARAMS.rampHalfWidth + 1.5);
      }
    }
  }
});
