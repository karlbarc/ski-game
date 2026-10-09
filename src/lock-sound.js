// Sonido de "bloqueado": dos golpes graves descendentes y apagados.
export function playLockSound(ctx, destination) {
  const t0 = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.connect(destination);
  [[0, 196], [0.13, 147]].forEach(([offset, freq], i, notes) => {
    const t = t0 + offset;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(freq, t);
    envelope.gain.setValueAtTime(0, t);
    envelope.gain.linearRampToValueAtTime(0.12, t + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    oscillator.connect(envelope);
    envelope.connect(filter);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      if (i === notes.length - 1) filter.disconnect();
    };
    oscillator.start(t);
    oscillator.stop(t + 0.12);
  });
}
