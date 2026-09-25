export function combineSteer(...values) {
  let out = 0;
  for (const v of values) if (Math.abs(v) > Math.abs(out)) out = v;
  return Math.max(-1, Math.min(1, out));
}

export function createControls(target = window) {
  const state = { mode: 'touch', keyboard: 0, touch: 0, gyro: 0, brake: 0 };
  let gesture = null;
  function resetTouch() {
    gesture = null;
    state.touch = 0;
    state.brake = 0;
  }
  const keys = new Set();

  function syncKeys() {
    state.keyboard = (keys.has('ArrowLeft') ? 1 : 0) + (keys.has('ArrowRight') ? -1 : 0);
  }
  function keyboardBraking() {
    return state.keyboard !== 0 && (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Shift'));
  }
  target.addEventListener('keydown', (e) => {
    if (e.target?.closest?.('input, textarea, [contenteditable]')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Shift') {
      keys.add(e.key === 'Shift' ? (e.code || e.key) : e.key);
      syncKeys();
    }
  });
  target.addEventListener('keyup', (e) => {
    keys.delete(e.key === 'Shift' ? (e.code || e.key) : e.key);
    syncKeys();
  });

  function touchSync(e) {
    if (e.target?.closest?.('.overlay')) { resetTouch(); return; }
    const touches = Array.from(e.touches);
    let touch = gesture && touches.find((t) => t.identifier === gesture.id);
    if (!touch) {
      resetTouch();
      touch = touches[0];
      if (!touch) return;
      gesture = { id: touch.identifier, startX: touch.clientX, startY: touch.clientY,
        lastX: touch.clientX, lastTime: e.timeStamp,
        side: touch.clientX < innerWidth / 2 ? 1 : -1 };
    }
    if (state.mode === 'swipe') {
      const elapsed = e.timeStamp - gesture.lastTime;
      const speed = elapsed > 0 ? Math.abs(touch.clientX - gesture.lastX) / elapsed : 0;
      // 60 px completan el giro; a partir de 0,6 px/ms empieza la frenada.
      state.touch = Math.max(-1, Math.min(1, -(touch.clientX - gesture.startX) / 60));
      state.brake = Math.max(0, Math.min(1, (speed - 0.6) / 0.6));
      gesture.lastX = touch.clientX;
      gesture.lastTime = e.timeStamp;
      return;
    }
    // Pequeña zona muerta; 100 px hacia abajo activan toda la frenada.
    state.brake = Math.max(0, Math.min(1, (touch.clientY - gesture.startY - 16) / 84));
    state.touch = state.brake > 0 ? gesture.side : (touch.clientX < innerWidth / 2 ? 1 : -1);
  }
  target.addEventListener('touchstart', touchSync, { passive: false });
  target.addEventListener('touchmove', (e) => {
    if (e.target?.closest?.('.overlay')) return;
    e.preventDefault();
    touchSync(e);
  }, { passive: false });
  target.addEventListener('touchend', touchSync);
  target.addEventListener('touchcancel', resetTouch);
  target.addEventListener('blur', () => { keys.clear(); syncKeys(); resetTouch(); });

  target.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    // gamma < 0 = inclinar a la izquierda (portrait) -> steer positivo
    state.gyro = Math.max(-1, Math.min(1, -e.gamma / 25));
  });

  async function setMode(mode) {
    resetTouch();
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
    steer: () => keyboardBraking() ? state.keyboard : state.brake > 0 ? state.touch : combineSteer(state.keyboard, state.mode === 'gyro' ? state.gyro : state.touch),
    brake: () => keyboardBraking() ? 1 : state.brake,
    setMode,
    mode: () => state.mode,
  };
}
