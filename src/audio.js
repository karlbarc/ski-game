// Sonido procedural de los skis deslizando sobre la nieve (Web Audio, sin assets).
// Ruido blanco -> filtro paso banda -> ganancia; volumen y brillo siguen la velocidad
// y el carving añade "raspado". Debe arrancarse desde un gesto del usuario (iOS).
export function createSnowSound() {
  let ctx = null;
  let master = null; // volumen maestro: todo el audio pasa por aquí (mute global)
  let muted = false;
  let bgHidden = false; // silencio mientras la app está en segundo plano

  function applyMasterGain() {
    if (master) master.gain.value = (muted || bgHidden) ? 0 : 1;
  }
  let gain = null;
  let filter = null;
  let ouchBuffers = []; // quejidos reales (assets/ouch*.wav, CC0)
  let cheerBuffer = null; // ovación real (assets/cheer.wav, CC-BY Gregor Quendel)
  let musicBuffer = null; // música de menú (assets/menu-music.m4a, CC0 Nostromo)
  let musicSrc = null;
  let musicGain = null;
  let musicWanted = false;

  async function loadBuffer(file) {
    const res = await fetch(file);
    return ctx.decodeAudioData(await res.arrayBuffer());
  }

  let assetsRequested = false;
  let lifecycleHooked = false;

  function loadAssets() {
    if (assetsRequested) return;
    assetsRequested = true;
    Promise.all(['assets/ouch1.wav', 'assets/ouch2.wav', 'assets/ouch3.wav'].map(loadBuffer))
      .then((buffers) => { ouchBuffers = buffers; })
      .catch(() => { /* sin assets: queda el quejido sintetizado */ });
    loadBuffer('assets/cheer.wav')
      .then((buffer) => { cheerBuffer = buffer; })
      .catch(() => { /* sin asset: queda la ovación sintetizada */ });
    loadBuffer('assets/menu-music.m4a')
      .then((buffer) => {
        musicBuffer = buffer;
        if (musicWanted) startMusic();
      })
      .catch(() => { /* sin música: el menú queda en silencio */ });
  }

  function startMusic() {
    if (!ctx || !musicBuffer || musicSrc) return;
    musicSrc = ctx.createBufferSource();
    musicSrc.buffer = musicBuffer;
    musicSrc.loop = true;
    // recorta el "priming" del códec para que el bucle no haga gap
    musicSrc.loopStart = 0.05;
    musicSrc.loopEnd = musicBuffer.duration - 0.05;
    musicGain = ctx.createGain();
    musicGain.gain.setValueAtTime(0, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.8);
    musicSrc.connect(musicGain);
    musicGain.connect(master);
    musicSrc.start();
  }

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = (muted || bgHidden) ? 0 : 1;
    master.connect(ctx.destination);
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
    gain.connect(master);
    src.start();
  }

  let lastResumeTry = 0;
  let suspectedDead = false; // contexto "zombi" de iOS: dice correr pero no suena
  let aliveTimer = null;

  // Tras volver del segundo plano, comprueba que el reloj del contexto avanza.
  // Si está congelado, el contexto murió: se reconstruirá en el próximo gesto.
  function checkAlive() {
    if (!ctx || document.hidden) return;
    const t0 = ctx.currentTime;
    clearTimeout(aliveTimer);
    aliveTimer = setTimeout(() => {
      if (!ctx || document.hidden) return;
      if (ctx.state === 'running' && ctx.currentTime === t0) suspectedDead = true;
    }, 400);
  }

  function rebuild() {
    try { if (ctx) ctx.close(); } catch { /* ya cerrado */ }
    ctx = null;
    master = null;
    gain = null;
    filter = null;
    musicSrc = null;
    musicGain = null;
    ensure();
    if (musicWanted) startMusic();
    checkAlive();
  }

  function resume() {
    if (!ctx || ctx.state === 'running') return;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch { /* API no disponible */ }
    ctx.resume().catch(() => { /* fuera de gesto: se reintentará */ });
  }

  // Reintento pasivo: iOS puede rechazar resume() fuera de un gesto; desde el
  // bucle del juego insistimos (con throttle) mientras la app esté visible.
  function nudgeResume() {
    if (!ctx || ctx.state === 'running' || document.hidden) return;
    const now = performance.now();
    if (now - lastResumeTry < 500) return;
    lastResumeTry = now;
    resume();
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
      if (ctx && !ouchBuffers.length) loadAssets();
      if (!lifecycleHooked) {
        lifecycleHooked = true;
        // Al cambiar de app se silencia TODO (la sesión 'playback' seguiría
        // sonando en segundo plano si no); al volver, se reanuda.
        document.addEventListener('visibilitychange', () => {
          bgHidden = document.hidden;
          applyMasterGain();
          if (!document.hidden) {
            resume();
            checkAlive();
          }
        });
        // Cualquier gesto reactiva el audio (iOS exige gesto para resume());
        // si el vigilante marcó el contexto como muerto, se reconstruye aquí,
        // dentro del gesto, que es donde iOS permite crear audio que suene.
        const onGesture = () => {
          if (suspectedDead) {
            suspectedDead = false;
            rebuild();
          } else {
            resume();
          }
        };
        for (const ev of ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown']) {
          window.addEventListener(ev, onGesture, { passive: true });
        }
      }
    },
    // Silencio global (música + efectos). Persiste el flag aunque el ctx no exista aún.
    setMuted(m) {
      muted = m;
      applyMasterGain();
    },
    // Música de menú en bucle (con fundido de entrada). Llamar tras un gesto.
    playMenu() {
      musicWanted = true;
      startMusic(); // si el buffer aún no cargó, arrancará al terminar la carga
    },
    stopMenu() {
      musicWanted = false;
      if (!musicSrc) return;
      const src = musicSrc;
      const g = musicGain;
      musicSrc = null;
      musicGain = null;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      src.stop(ctx.currentTime + 0.6);
    },
    // speed en m/s; steer en [-1,1]; grounded=false silencia (aire/caída/pausa).
    update(speed, steer, grounded) {
      if (!gain) return;
      nudgeResume();
      const glide = Math.min(1, speed / 25);
      const target = grounded ? glide * (0.22 + 0.25 * Math.abs(steer)) : 0;
      gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      filter.frequency.setTargetAtTime(700 + 2500 * glide, ctx.currentTime, 0.15);
    },
    // Quejido de dolor al caer: WAV real si está cargado; si no, sintetizado.
    ouch() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      if (ouchBuffers.length) {
        const src = ctx.createBufferSource();
        src.buffer = ouchBuffers[Math.floor(Math.random() * ouchBuffers.length)];
        src.playbackRate.value = 0.95 + Math.random() * 0.1; // pequeña variación
        const g = ctx.createGain();
        g.gain.value = 0.8;
        src.connect(g);
        g.connect(master);
        src.start(t0);
        return;
      }
      // golpe contra la nieve
      const len = Math.floor(ctx.sampleRate * 0.09);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const thud = ctx.createBufferSource();
      thud.buffer = buf;
      const thudFilter = ctx.createBiquadFilter();
      thudFilter.type = 'lowpass';
      thudFilter.frequency.value = 250;
      const thudGain = ctx.createGain();
      thudGain.gain.value = 0.9;
      thud.connect(thudFilter);
      thudFilter.connect(thudGain);
      thudGain.connect(master);
      thud.start(t0);
      // gemido: tono que cae, con voz "amortiguada" por un paso bajo
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, t0 + 0.04);
      osc.frequency.exponentialRampToValueAtTime(85, t0 + 0.5);
      const voice = ctx.createBiquadFilter();
      voice.type = 'lowpass';
      voice.frequency.value = 650;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t0 + 0.04);
      og.gain.linearRampToValueAtTime(0.3, t0 + 0.1);
      og.gain.setTargetAtTime(0, t0 + 0.32, 0.12);
      osc.connect(voice);
      voice.connect(og);
      og.connect(master);
      osc.start(t0 + 0.04);
      osc.stop(t0 + 0.7);
    },
    // Ovación al cruzar la meta: WAV real si está cargado; si no, sintetizada.
    cheer() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      if (cheerBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = cheerBuffer;
        const g = ctx.createGain();
        g.gain.value = 0.75;
        src.connect(g);
        g.connect(master);
        src.start(t0);
        return;
      }
      const dur = 3;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let t = 0.05;
      while (t < dur - 0.1) {
        const start = Math.floor(t * ctx.sampleRate);
        const len = Math.floor(0.025 * ctx.sampleRate);
        const amp = 0.4 + Math.random() * 0.6;
        for (let i = 0; i < len && start + i < data.length; i++) {
          data[start + i] += (Math.random() * 2 - 1) * amp * (1 - i / len);
        }
        t += 0.02 + Math.random() * 0.06; // densidad de palmas
      }
      const claps = ctx.createBufferSource();
      claps.buffer = buf;
      const clapFilter = ctx.createBiquadFilter();
      clapFilter.type = 'bandpass';
      clapFilter.frequency.value = 1800;
      clapFilter.Q.value = 0.5;
      const clapGain = ctx.createGain();
      clapGain.gain.setValueAtTime(0.5, t0);
      clapGain.gain.setTargetAtTime(0, t0 + dur - 0.6, 0.25);
      claps.connect(clapFilter);
      clapFilter.connect(clapGain);
      clapGain.connect(master);
      claps.start(t0);

      for (let v = 0; v < 3; v++) {
        const start = t0 + 0.15 + v * 0.35;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const og = ctx.createGain();
        og.gain.setValueAtTime(0, start);
        og.gain.linearRampToValueAtTime(0.16, start + 0.05);
        og.gain.setTargetAtTime(0, start + 0.55, 0.1);
        const base = 330 + v * 60;
        osc.frequency.setValueAtTime(base, start);            // "woo": sube
        osc.frequency.exponentialRampToValueAtTime(base * 2, start + 0.22);
        osc.frequency.setValueAtTime(base * 1.8, start + 0.3); // "hoo": cae
        osc.frequency.exponentialRampToValueAtTime(base * 0.9, start + 0.6);
        osc.connect(og);
        og.connect(master);
        osc.start(start);
        osc.stop(start + 0.9);
      }
    },
  };
}
