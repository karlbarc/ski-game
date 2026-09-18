// Sonido procedural de los skis deslizando sobre la nieve (Web Audio, sin assets).
// Ruido blanco -> filtro paso banda -> ganancia; volumen y brillo siguen la velocidad
// y el carving añade "raspado". Debe arrancarse desde un gesto del usuario (iOS).
export function createSnowSound() {
  let ctx = null;
  let master = null; // volumen maestro: todo el audio pasa por aquí (mute global)
  let muted = false;
  let bgHidden = document.hidden; // tras salir, esperar un gesto para reactivar

  function setSessionType(type) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = type;
    } catch { /* Safari antiguo: la API puede no estar disponible. */ }
  }

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
    if (ctx && ctx.state !== 'closed') return;
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
    const observed = ctx;
    const t0 = observed.currentTime;
    clearTimeout(aliveTimer);
    aliveTimer = setTimeout(() => {
      if (ctx !== observed || document.hidden || muted || bgHidden) return;
      if (ctx.state !== 'running' || ctx.currentTime === t0) suspectedDead = true;
    }, 500);
  }

  function rebuild() {
    try { if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {}); } catch { /* ya cerrado */ }
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
    if (!ctx || muted || bgHidden || document.hidden || ctx.state === 'closed') return;
    setSessionType('playback');
    if (ctx.state === 'running') return;
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

  function suspend() {
    clearTimeout(aliveTimer);
    applyMasterGain();
    setSessionType('auto'); // liberar el audio al silenciar o cambiar de aplicación
    if (ctx && ctx.state !== 'closed') {
      ctx.suspend().catch(() => { /* contexto interrumpido por el sistema */ });
    }
  }

  function activate() {
    if (document.hidden) return;
    if (!muted) setSessionType('playback');
    if (suspectedDead || ctx?.state === 'closed') {
      suspectedDead = false;
      rebuild();
    } else {
      ensure();
    }
    applyMasterGain();
    if (muted) { suspend(); return; }
    if (!ctx) return;
    // Iniciar una fuente dentro del toque desbloquea el motor de Safari,
    // aunque la música aún se esté descargando y el esquiador esté detenido.
    const unlock = ctx.createBufferSource();
    unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    unlock.connect(master);
    unlock.onended = () => unlock.disconnect();
    unlock.start();
    resume(); // también después de reconstruir un contexto interrumpido
    checkAlive();
  }

  return {
    // Llamar dentro de un gesto del usuario (click/touch) para poder sonar en iOS.
    start() {
      if (document.hidden) return;
      bgHidden = false;
      activate();
      if (ctx && !ouchBuffers.length) loadAssets();
      if (!lifecycleHooked) {
        lifecycleHooked = true;
        // Silenciar no libera el dispositivo: suspender también el contexto.
        // Mantenerlo suspendido al volver hasta el siguiente gesto del usuario.
        const onBackground = () => {
          bgHidden = true;
          suspend();
        };
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) onBackground();
        });
        window.addEventListener('pagehide', onBackground);
        // Cualquier gesto reactiva el audio (iOS exige gesto para resume());
        // si el vigilante marcó el contexto como muerto, se reconstruye aquí,
        // dentro del gesto, que es donde iOS permite crear audio que suene.
        const onGesture = () => {
          if (document.hidden || muted) return;
          bgHidden = false;
          activate();
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
      if (muted) suspend();
      else resume();
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
    // Señal de salida: tres pitidos cortos y uno final más alto y largo.
    startSignal(go = false) {
      if (!ctx || muted || bgHidden || document.hidden) return;
      const t = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      const duration = go ? 0.48 : 0.16;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(go ? 1480 : 980, t);
      envelope.gain.setValueAtTime(0, t);
      envelope.gain.linearRampToValueAtTime(0.20, t + 0.008);
      envelope.gain.setValueAtTime(0.20, t + duration - 0.04);
      envelope.gain.linearRampToValueAtTime(0, t + duration);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(t);
      oscillator.stop(t + duration);
    },
    // Golpe grave y crujido corto de nieve al aterrizar, según la caída.
    land(strength) {
      if (!ctx || muted || bgHidden || document.hidden) return;
      const impact = Math.max(0, Math.min(1, strength));
      const t = ctx.currentTime;
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.24), ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(900 + impact * 800, t);
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0, t);
      envelope.gain.linearRampToValueAtTime(0.18 + impact * 0.4, t + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      source.connect(lowpass); lowpass.connect(envelope); envelope.connect(master);
      source.onended = () => { source.disconnect(); lowpass.disconnect(); envelope.disconnect(); };
      source.start(t); source.stop(t + 0.24);
      const thump = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thump.frequency.setValueAtTime(100, t);
      thump.frequency.exponentialRampToValueAtTime(42, t + 0.15);
      thumpGain.gain.setValueAtTime(0, t);
      thumpGain.gain.linearRampToValueAtTime(impact * 0.22, t + 0.006);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      thump.connect(thumpGain); thumpGain.connect(master);
      thump.onended = () => { thump.disconnect(); thumpGain.disconnect(); };
      thump.start(t); thump.stop(t + 0.18);
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
