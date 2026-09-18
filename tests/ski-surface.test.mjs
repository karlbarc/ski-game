import test from 'node:test';
import assert from 'node:assert/strict';
import { skiSurfaceHeight, findSkiSupportRamp, skiLengthScale, smoothSkiPose } from '../src/ski-surface.js';
const ramp = { type: 'jump', s: 30, lat: 0 };
const track = { width: 16, obstacles: [ramp] };
const flatSnow = () => 0;

test('ski support rises with the ramp before the player reaches it', () => {
  const support = findSkiSupportRamp(track, { s: 23, lat: 0, airborne: false });
  assert.equal(support, ramp);
  assert.equal(skiSurfaceHeight(track, 23, 0, flatSnow, support), 0);
  assert.ok(skiSurfaceHeight(track, 25, 0, flatSnow, support) > 0.2);
  assert.equal(skiSurfaceHeight(track, 27, 0, flatSnow, support), 0.65);
});

test('support extends the takeoff plane past the lip, but the contact shadow does not', () => {
  const support = findSkiSupportRamp(track, { s: 29.8, lat: 0, airborne: false });
  assert.ok(skiSurfaceHeight(track, 31, 0, flatSnow, support) > 1.3);
  assert.equal(skiSurfaceHeight(track, 31, 0, flatSnow), 0);
  assert.equal(findSkiSupportRamp(track, { s: 30.1, lat: 0, airborne: true }), null);
});

test('bypassing a ramp preserves snow height; shoulders interpolate onto snow', () => {
  assert.equal(skiSurfaceHeight(track, 27, 5, flatSnow), 0);
  assert.equal(findSkiSupportRamp(track, { s: 27, lat: 5, airborne: false }), null);
  const shoulder = skiSurfaceHeight(track, 27, 3.9, flatSnow);
  assert.ok(shoulder > 0 && shoulder < 0.65);
});

test('wide angle reduces visible ski reach instead of extending it at speed', () => {
  assert.equal(skiLengthScale(70), 1);
  assert.ok(skiLengthScale(95) < skiLengthScale(80));
  assert.ok(skiLengthScale(95) > 0.6);
});


test('takeoff and landing change ski pitch gradually without overshoot', () => {
  const takeoff = smoothSkiPose({ pitch: 0.22, lift: 0.11 }, { pitch: 0.12, lift: 0 }, 1 / 60);
  assert.ok(takeoff.pitch > 0.12 && takeoff.pitch < 0.22);
  assert.ok(takeoff.lift > 0 && takeoff.lift < 0.11);
  const landing = smoothSkiPose(takeoff, { pitch: 0, lift: 0 }, 1 / 60);
  assert.ok(landing.pitch > 0 && landing.pitch < takeoff.pitch);
  assert.ok(landing.pitch > takeoff.pitch * 0.8);
});

test('ski smoothing is frame-rate independent and freezes while paused', () => {
  const initial = { pitch: 0.22, lift: 0.1 };
  const target = { pitch: 0, lift: 0 };
  const advance = (fps) => {
    let pose = initial;
    for (let i = 0; i < fps; i++) pose = smoothSkiPose(pose, target, 1 / fps);
    return pose;
  };
  assert.ok(Math.abs(advance(30).pitch - advance(120).pitch) < 1e-10);
  assert.ok(Math.abs(advance(30).lift - advance(120).lift) < 1e-10);
  assert.deepEqual(smoothSkiPose(initial, target, 0), initial);
  assert.deepEqual(smoothSkiPose(null, target, 0), target);
});
