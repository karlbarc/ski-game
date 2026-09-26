// Una puerta recibe una sola sanción: 0, 2 o 50 s. El paso incorrecto
// sustituye un toque previo; no se multiplica una sanción por frame.
export const SLALOM_FLAG_WIDTH = 1.25;

export function slalomPoleOffsets(gate) {
  return [gate.lat, gate.lat - gate.passSide * SLALOM_FLAG_WIDTH];
}

export function createSlalom(gates = []) {
  return { gates: gates.map((gate) => ({ ...gate, touched: false, status: 'pending' })) };
}

export function slalomResult(state, elapsed = 0) {
  const missed = state.gates.filter((g) => g.status === 'missed').length;
  const touches = state.gates.filter((g) => g.touched && g.status !== 'missed').length;
  const penalty = missed * 50 + touches * 2;
  return { missed, touches, penalty, total: elapsed + penalty,
    completed: state.gates.filter((g) => g.status !== 'pending').length };
}

export function slalomNotice(previous, current) {
  const touched = current.gates.find((g, i) => g.touched && !previous.gates[i].touched);
  const missed = current.gates.find((g, i) => g.status === 'missed' && previous.gates[i].status !== 'missed');
  if (touched) return {
    text: touched.status === 'missed'
      ? '¡Tocaste la bandera! · Paso incorrecto: 50 s de penalización'
      : '¡Tocaste la bandera! · +2 s de penalización',
    duration: 2500, priority: 1,
  };
  if (missed) return {
    text: missed.touched
      ? '¡Tocaste la bandera! · Paso incorrecto: 50 s de penalización'
      : 'Puerta incorrecta u omitida · +50 s',
    duration: 2500, priority: 1,
  };
  const passed = current.gates.some((g, i) => g.status === 'passed' && previous.gates[i].status === 'pending');
  return passed ? { text: '¡Puerta correcta!', duration: 800, priority: 0 } : null;
}

export function stepSlalom(state, previous, current, width, finished = false) {
  const ds = current.s - previous.s;
  const dl = current.lat - previous.lat;
  const gates = state.gates.map((gate) => {
    let { touched, status } = gate;
    // Barrido del recorrido: detecta contactos incluso entre dos frames.
    const length2 = ds * ds + dl * dl;
    for (const poleLat of slalomPoleOffsets(gate)) {
      const u = length2 ? Math.max(0, Math.min(1,
        ((gate.s - previous.s) * ds + (poleLat - previous.lat) * dl) / length2)) : 0;
      const height = (previous.height || 0) + ((current.height || 0) - (previous.height || 0)) * u;
      if (height <= 2.3 && Math.hypot(previous.s + ds * u - gate.s,
        previous.lat + dl * u - poleLat) <= 0.65) touched = true;
    }

    const downhill = previous.s < gate.s && current.s >= gate.s;
    const uphill = previous.s > gate.s && current.s <= gate.s;
    if (uphill) status = 'missed';
    if (downhill && status === 'pending') {
      const t = (gate.s - previous.s) / ds;
      const lat = previous.lat + dl * t;
      const crossingHeight = (previous.height || 0) + ((current.height || 0) - (previous.height || 0)) * t;
      const correct = (lat - gate.lat) * gate.passSide >= 0
        && Math.abs(lat) <= width / 2 && crossingHeight <= 0.3 && !current.fallen;
      status = correct ? 'passed' : 'missed';
    }
    if (status === 'pending' && (current.s > gate.s || finished)) status = 'missed';
    return { ...gate, touched, status };
  });
  return { gates };
}
