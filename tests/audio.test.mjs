import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnowSound } from '../src/audio.js';

for (const hasAudioSession of [true, false]) {
  test(`audio releases the device in background and on mute (audioSession: ${hasAudioSession})`, async (t) => {
    const document = new EventTarget();
    document.hidden = false;
    const window = new EventTarget();
    const contexts = [];
    const param = () => ({ value: 0, setTargetAtTime() {},
      setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    window.AudioContext = class {
      state = 'running';
      sampleRate = 10;
      currentTime = 0;
      signals = [];
      resumes = 0;
      suspends = 0;
      constructor() { contexts.push(this); }
      createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
      createOscillator() {
        const signal = { frequency: param(), connect() {}, disconnect() {}, start() {},
          stop(time) { this.stopTime = time; } };
        this.signals.push(signal);
        return signal;
      }
      createBuffer() { return { getChannelData: () => new Float32Array(20) }; }
      createBufferSource() { return { connect() {}, start() {}, stop() {}, disconnect() {} }; }
      createBiquadFilter() { return { frequency: param(), Q: param(), connect() {}, disconnect() {} }; }
      suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve(); }
      resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
    };
    const navigator = hasAudioSession ? { audioSession: { type: 'auto' } } : {};
    for (const [key, value] of Object.entries({ window, document, navigator, fetch: async () => { throw new Error('offline'); } })) {
      const original = Object.getOwnPropertyDescriptor(globalThis, key);
      Object.defineProperty(globalThis, key, { configurable: true, value });
      t.after(() => {
        if (original) Object.defineProperty(globalThis, key, original);
        else delete globalThis[key];
      });
    }
    const sound = createSnowSound();
    sound.start();
    const ctx = contexts[0];
    sound.startSignal();
    sound.startSignal(true);
    assert.equal(ctx.signals.length, 2);
    assert.ok(ctx.signals[1].frequency.value > ctx.signals[0].frequency.value);
    assert.ok(ctx.signals[1].stopTime > ctx.signals[0].stopTime);
    sound.land(0.8);
    assert.equal(ctx.signals.length, 3, 'landing adds a short bass impact');
    assert.ok(ctx.signals[2].stopTime <= 0.24);
    if (hasAudioSession) assert.equal(navigator.audioSession.type, 'playback');
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(ctx.state, 'suspended');
    if (hasAudioSession) assert.equal(navigator.audioSession.type, 'auto');
    sound.startSignal();
    sound.land(1);
    assert.equal(ctx.signals.length, 3, 'background countdown and landing must stay silent');
    sound.update(20, 1, true);
    window.dispatchEvent(new Event('pointerdown'));
    assert.equal(ctx.resumes, 0);
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    sound.update(20, 1, true);
    assert.equal(ctx.resumes, 0, 'returning to the page must not reclaim audio');
    window.dispatchEvent(new Event('pointerdown'));
    assert.equal(ctx.state, 'running');
    sound.setMuted(true);
    sound.startSignal(true);
    sound.land(1);
    assert.equal(ctx.signals.length, 3, 'muted countdown and landing must stay silent');
    const resumes = ctx.resumes;
    sound.update(20, 1, true);
    window.dispatchEvent(new Event('pointerdown'));
    assert.equal(ctx.state, 'suspended');
    assert.equal(ctx.resumes, resumes, 'muted audio must stay suspended');
    sound.setMuted(false);
    assert.equal(ctx.state, 'running');
    window.dispatchEvent(new Event('pagehide'));
    assert.equal(ctx.state, 'suspended', 'pagehide also releases audio for navigation/BFCache');
    window.dispatchEvent(new Event('pageshow'));
    sound.update(20, 1, true);
    assert.equal(ctx.state, 'suspended');
    window.dispatchEvent(new Event('touchstart'));
    assert.equal(ctx.state, 'running');
    sound.setMuted(true); // cancel the liveness timer
  });
}

test('iPhone unlocks suspended audio and rebuilds an interrupted or closed context from a touch', (t) => {
  const document = new EventTarget();
  document.hidden = false;
  const window = new EventTarget();
  const contexts = [];
  const timers = new Map();
  let timerId = 0;
  const param = () => ({ value: 0, setTargetAtTime() {} });
  window.AudioContext = class {
    state = 'suspended';
    sampleRate = 100;
    currentTime = 0;
    resumes = 0;
    blocked = false;
    sources = [];
    constructor() { contexts.push(this); }
    createGain() { return { gain: param(), connect() {} }; }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createBiquadFilter() { return { frequency: param(), Q: param(), connect() {} }; }
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start() { this.started = true; } };
      this.sources.push(source);
      return source;
    }
    resume() {
      this.resumes++;
      if (!this.blocked) { this.state = 'running'; this.currentTime += 0.01; }
      return Promise.resolve();
    }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  };
  const navigator = { audioSession: { type: 'auto' } };
  const globals = { window, document, navigator,
    fetch: async () => { throw new Error('offline'); },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const sound = createSnowSound();
  sound.start();
  const original = contexts[0];
  assert.equal(original.state, 'running');
  assert.equal(navigator.audioSession.type, 'playback');
  assert.ok(original.sources.some(source => source.started && !source.loop), 'a source is started during the gesture');
  original.state = 'interrupted';
  original.blocked = true;
  window.dispatchEvent(new Event('touchend'));
  for (const fn of [...timers.values()]) fn();
  window.dispatchEvent(new Event('click'));
  assert.equal(contexts.length, 2);
  assert.equal(original.state, 'closed');
  assert.equal(contexts[1].state, 'running', 'replacement context must also be resumed');
  assert.ok(contexts[1].resumes > 0);
  contexts[1].state = 'closed';
  sound.start();
  assert.equal(contexts.length, 3);
  assert.equal(contexts[2].state, 'running');
  sound.setMuted(true);
  assert.equal(navigator.audioSession.type, 'auto');
  assert.equal(contexts[2].state, 'suspended');
});
