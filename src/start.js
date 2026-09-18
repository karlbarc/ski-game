// Reloj de salida independiente de la física: la pausa no consume la cuenta.
export function createStartSequence() {
  return { elapsed: 0, cue: 3, released: false, visible: true, clockMs: null };
}

export function stepStartSequence(state, dt, paused = false) {
  if (paused || !state.visible) return state;
  const elapsed = state.elapsed + Math.max(0, dt);
  return {
    ...state,
    elapsed,
    cue: Math.max(0, 3 - Math.floor(elapsed)),
    released: elapsed >= 3,
    visible: elapsed < 3.9,
  };
}


// Armar el reloj después del primer render evita consumir el 3 mientras
// WebGL compila materiales y sube las texturas de una pista recién elegida.
export function presentStartSequence(state, nowMs) {
  return state.clockMs == null ? { ...state, clockMs: nowMs } : state;
}

export function stepPresentedStartSequence(state, nowMs) {
  if (state.clockMs == null) return state;
  const clockMs = Math.max(state.clockMs, nowMs);
  return { ...stepStartSequence(state, (clockMs - state.clockMs) / 1000), clockMs };
}
