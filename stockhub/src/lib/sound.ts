let enabled = true;
export const setSoundEnabled = (v: boolean) => (enabled = v);

function ctx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

export const SoundFx = {
  scan() {
    if (!enabled) return;
    const c = ctx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1900, c.currentTime + 0.08);
    gain.gain.setValueAtTime(0.18, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.08);
  },
  success() {
    if (!enabled) return;
    const c = ctx();
    if (!c) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, c.currentTime + i * 0.07);
      gain.gain.setValueAtTime(0.16, c.currentTime + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.07 + 0.45);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime + i * 0.07);
      osc.stop(c.currentTime + i * 0.07 + 0.45);
    });
  },
  warning() {
    if (!enabled) return;
    const c = ctx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, c.currentTime);
    osc.frequency.setValueAtTime(130, c.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.22);
  },
};
