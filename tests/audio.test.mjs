import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnowSound } from '../src/audio.js';

for (const hasAudioSession of [true, false]) {
  test(`audio releases the device in background and on mute (audioSession: ${hasAudioSession})`, async (t) => {
    const document = new EventTarget();
    document.hidden = false;
    const window = new EventTarget();
    const contexts = [];
    const param = () => ({ value: 0, setTargetAtTime() {} });
    window.AudioContext = class {
      state = 'running';
      sampleRate = 10;
      currentTime = 0;
      resumes = 0;
      suspends = 0;
      constructor() { contexts.push(this); }
      createGain() { return { gain: param(), connect() {} }; }
      createBuffer() { return { getChannelData: () => new Float32Array(20) }; }
      createBufferSource() { return { connect() {}, start() {} }; }
      createBiquadFilter() { return { frequency: param(), Q: param(), connect() {} }; }
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
    if (hasAudioSession) assert.equal(navigator.audioSession.type, 'ambient');
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(ctx.state, 'suspended');
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
