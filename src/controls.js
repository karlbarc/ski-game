export function combineSteer(...values) {
  let out = 0;
  for (const v of values) if (Math.abs(v) > Math.abs(out)) out = v;
  return Math.max(-1, Math.min(1, out));
}

export function createControls(target = window) {
  const state = { mode: 'touch', keyboard: 0, touch: 0, gyro: 0 };
  const keys = new Set();

  function syncKeys() {
    state.keyboard = (keys.has('ArrowLeft') ? 1 : 0) + (keys.has('ArrowRight') ? -1 : 0);
  }
  target.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      keys.add(e.key);
      syncKeys();
    }
  });
  target.addEventListener('keyup', (e) => {
    keys.delete(e.key);
    syncKeys();
  });

  function touchSync(e) {
    let v = 0;
    for (const t of e.touches) v = t.clientX < innerWidth / 2 ? 1 : -1;
    state.touch = e.touches.length ? v : 0;
  }
  target.addEventListener('touchstart', touchSync, { passive: false });
  target.addEventListener('touchmove', (e) => {
    e.preventDefault();
    touchSync(e);
  }, { passive: false });
  target.addEventListener('touchend', touchSync);

  target.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    // gamma < 0 = inclinar a la izquierda (portrait) -> steer positivo
    state.gyro = Math.max(-1, Math.min(1, -e.gamma / 25));
  });

  async function setMode(mode) {
    if (mode === 'gyro') {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined'
            && typeof DeviceOrientationEvent.requestPermission === 'function') {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') throw new Error('denied');
        }
      } catch {
        state.mode = 'touch';
        return false;
      }
    }
    state.mode = mode;
    return true;
  }

  return {
    steer: () => combineSteer(state.keyboard, state.mode === 'gyro' ? state.gyro : state.touch),
    setMode,
    mode: () => state.mode,
  };
}
