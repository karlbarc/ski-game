// Sonido procedural de los skis deslizando sobre la nieve (Web Audio, sin assets).
// Ruido blanco -> filtro paso banda -> ganancia; volumen y brillo siguen la velocidad
// y el carving añade "raspado". Debe arrancarse desde un gesto del usuario (iOS).
export function createSnowSound() {
  let ctx = null;
  let gain = null;
  let filter = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 700;
    filter.Q.value = 0.7;
    gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  function resume() {
    if (ctx && ctx.state !== 'running') ctx.resume();
  }

  return {
    // Llamar dentro de un gesto del usuario (click/touch) para poder sonar en iOS.
    start() {
      // En iOS, que el audio suene aunque el interruptor de silencio esté activado.
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch { /* API no disponible: seguimos igual */ }
      ensure();
      resume();
      // iOS suspende el contexto al cambiar de app; lo reactivamos al volver o al tocar.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) resume();
      });
      window.addEventListener('touchend', resume);
    },
    // speed en m/s; steer en [-1,1]; grounded=false silencia (aire/caída/pausa).
    update(speed, steer, grounded) {
      if (!gain) return;
      const glide = Math.min(1, speed / 25);
      const target = grounded ? glide * (0.22 + 0.25 * Math.abs(steer)) : 0;
      gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      filter.frequency.setTargetAtTime(700 + 2500 * glide, ctx.currentTime, 0.15);
    },
  };
}
