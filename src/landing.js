// Respuesta visual de las rodillas y las palas, independiente de la física.
export function landingStrength(previous, current) {
  if (!previous.airborne || current.airborne || current.fallen || previous.vy >= 0) return 0;
  return Math.min(1, Math.max(0.2, -previous.vy / 7));
}

export function landingMotion(age, strength) {
  if (age < 0 || age >= 0.6 || !strength) return { dip: 0, pitch: 0, flex: 0 };
  const compression = (age / 0.065) * Math.exp(1 - age / 0.065);
  const rebound = age > 0.16 ? Math.sin(Math.PI * (age - 0.16) / 0.44) * Math.exp(-(age - 0.16) * 8) : 0;
  return {
    dip: strength * (0.18 * compression - 0.045 * rebound),
    pitch: strength * (0.035 * compression - 0.012 * rebound),
    flex: strength * 0.24 * compression,
  };
}
