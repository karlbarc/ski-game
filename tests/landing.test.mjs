import test from 'node:test';
import assert from 'node:assert/strict';
import { landingStrength, landingMotion } from '../src/landing.js';

test('impact triggers only for a successful air-to-snow landing', () => {
  const falling = { airborne: true, vy: -5 };
  assert.ok(landingStrength(falling, { airborne: false, fallen: false }) > 0);
  assert.equal(landingStrength(falling, { airborne: true }), 0);
  assert.equal(landingStrength(falling, { airborne: false, fallen: true }), 0);
  assert.equal(landingStrength({ airborne: false, vy: 0 }, { airborne: false }), 0);
});

test('harder landings have stronger, bounded impact', () => {
  const land = vy => landingStrength({ airborne: true, vy }, { airborne: false });
  assert.ok(land(-7) > land(-2));
  assert.equal(land(-100), 1);
});

test('landing compresses quickly, rebounds and settles without persistent shaking', () => {
  assert.equal(landingMotion(0, 1).dip, 0);
  assert.ok(landingMotion(0.065, 1).dip > 0.17);
  assert.ok(landingMotion(0.4, 1).dip < 0);
  assert.deepEqual(landingMotion(0.6, 1), { dip: 0, pitch: 0, flex: 0 });
  assert.deepEqual(landingMotion(0.065, 0), { dip: 0, pitch: 0, flex: 0 });
});
