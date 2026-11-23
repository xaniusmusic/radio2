/* Procedural radio audio. All noise/whistle/tuning textures are synthesised with
   the Web Audio API (no external sample files, no CORS problems), while the live
   station stream plays through a normal <audio> element so that streams without
   CORS headers still work. Signal quality crossfades stream vs. static. */
import type { Band } from "./catalog";

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export class RadioAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseGain!: GainNode;
  private noiseFilter!: BiquadFilterNode;
  private crackleGain!: GainNode;
  private hetGain!: GainNode;
  private hetOsc!: OscillatorNode;
  private humGain!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private crackleBuffer!: AudioBuffer;
  private audio: HTMLAudioElement;
  private powered = false;
  private volume = 0.72;
  private scanning = false;
  private currentUrl = "";
  private altUrl = "";
  private altTried = false;
  private lastBurst = 0;
  private onError?: (failed: boolean) => void;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = "none";
    this.audio.volume = 0;
    this.audio.addEventListener("error", () => {
      if (this.altUrl && !this.altTried) {
        this.altTried = true;
        this.audio.src = this.altUrl;
        this.audio.load();
        this.audio.play().catch(() => this.onError?.(true));
        return;
      }
      this.onError?.(true);
    });
    this.audio.addEventListener("playing", () => this.onError?.(false));
  }

  setCallbacks(onError: (failed: boolean) => void) {
    this.onError = onError;
  }

  private ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.powered ? this.volume : 0;
    this.master.connect(ctx.destination);

    // Looping white noise bed (hiss).
    const len = Math.floor(ctx.sampleRate * 2.5);
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 1400;
    this.noiseFilter.Q.value = 0.55;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.12;
    noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.master);
    noise.start();

    // Sparse atmospheric crashes / pops.
    const clen = Math.floor(ctx.sampleRate * 6);
    this.crackleBuffer = ctx.createBuffer(1, clen, ctx.sampleRate);
    const cd = this.crackleBuffer.getChannelData(0);
    for (let i = 0; i < clen;) {
      if (Math.random() < 0.00028) {
        const amp = 0.35 + Math.random() * 0.65;
        const decay = 40 + Math.random() * 260;
        for (let j = 0; j < decay && i + j < clen; j++) cd[i + j] += amp * (Math.random() * 2 - 1) * Math.exp(-j / (decay / 4));
        i += decay;
      } else i++;
    }
    const crackle = ctx.createBufferSource();
    crackle.buffer = this.crackleBuffer;
    crackle.loop = true;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0.05;
    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = "lowpass";
    crackleFilter.frequency.value = 2400;
    crackle.connect(crackleFilter).connect(this.crackleGain).connect(this.master);
    crackle.start();

    // Carrier beat / heterodyne whistle while brushing past an SW station.
    this.hetOsc = ctx.createOscillator();
    this.hetOsc.type = "sine";
    this.hetOsc.frequency.value = 800;
    this.hetGain = ctx.createGain();
    this.hetGain.gain.value = 0;
    this.hetOsc.connect(this.hetGain).connect(this.master);
    this.hetOsc.start();

    // Faint mains hum on the AM/SW bands.
    const hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 60;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    hum.connect(this.humGain).connect(this.master);
    hum.start();
  }

  async setPower(on: boolean) {
    this.powered = on;
    if (!on && !this.ctx) { this.audio.pause(); this.audio.volume = 0; return; }
    this.ensure();
    if (!this.ctx) return;
    if (on) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
      if (this.currentUrl) this.audio.play().catch(() => {});
      this.click(0.35);
    } else {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
      this.audio.pause();
      this.audio.volume = 0;
    }
  }

  setVolume(v: number) {
    this.volume = clamp(v);
    if (this.ctx) this.master.gain.setTargetAtTime(this.powered ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  setScanning(on: boolean) { this.scanning = on; }

  setStation(url: string, altUrl?: string) {
    if (url === this.currentUrl) return;
    this.currentUrl = url;
    this.altUrl = altUrl || "";
    this.altTried = false;
    this.onError?.(false);
    if (!url) { this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); return; }
    this.audio.src = url;
    this.audio.load();
    this.audio.volume = 0;
    if (this.powered) this.audio.play().catch(() => {});
  }

  /** Called ~15x/second with the current simulated reception. */
  update(opts: { quality: number; propagation: number; tuning: number; band: Band; detune: number; bandwidth: number }) {
    const { quality, propagation, tuning, band, detune, bandwidth } = opts;
    const q = clamp(quality);
    const off = 1 - q;
    if (!this.ctx) {
      this.audio.volume = this.powered ? this.volume * Math.pow(q, 0.8) : 0;
      return;
    }
    const now = this.ctx.currentTime;
    const bright = band === "FM" ? 1.25 : band === "AM" ? 0.8 : 0.7;
    const scanBoost = this.scanning ? 1.35 : 1;
    this.noiseGain.gain.setTargetAtTime((0.016 + Math.pow(off, 1.25) * 0.19 * bright) * scanBoost, now, 0.07);
    this.noiseFilter.frequency.setTargetAtTime(band === "FM" ? 3200 : band === "AM" ? 1050 : 850, now, 0.1);
    this.noiseFilter.Q.setTargetAtTime(band === "FM" ? 0.4 : 0.9, now, 0.1);
    this.crackleGain.gain.setTargetAtTime(band === "FM" ? 0.018 + off * 0.02 : 0.045 + off * 0.16, now, 0.1);
    this.humGain.gain.setTargetAtTime(band === "FM" ? 0 : 0.004 + off * 0.008, now, 0.1);

    // A whistle that descends to zero beat as you approach the carrier.
    const near = tuning > 0.06 && tuning < 0.98 && propagation > 0.14 && band !== "FM";
    const whistle = near ? 0.02 * (1 - Math.abs(0.5 - tuning) * 1.2) * propagation : 0;
    this.hetGain.gain.setTargetAtTime(Math.max(0, whistle), now, 0.06);
    this.hetOsc.frequency.setTargetAtTime(180 + Math.min(1, Math.abs(detune) / bandwidth) * 1750, now, 0.04);

    // Crossfade: the actual stream is attenuated & lightly tremoloed by fading.
    const audible = q < 0.085 ? 0 : Math.pow(clamp((q - 0.06) / 0.94), 0.85);
    this.audio.volume = this.powered ? clamp(this.volume * audible) : 0;
    if (this.powered && this.currentUrl && this.audio.paused && q > 0.1) this.audio.play().catch(() => {});
  }

  /** Mechanical switch click. */
  click(level = 0.3) {
    if (!this.ctx || !this.powered) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 220; bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now, Math.random(), 0.07);
    src.stop(now + 0.07);
  }

  /** Short static swish + carrier squeal on each dial step. */
  tuneBurst(intensity = 1) {
    if (!this.ctx || !this.powered) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBurst < 55) return;
    this.lastBurst = nowMs;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 1.8;
    bp.frequency.setValueAtTime(900 + Math.random() * 1800, now);
    bp.frequency.exponentialRampToValueAtTime(280 + Math.random() * 350, now + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.11 * intensity, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now, Math.random() * 2, 0.2);
    src.stop(now + 0.2);
    if (Math.random() < 0.35) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(1200 + Math.random() * 900, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.11);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.012 * intensity, now);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(og).connect(this.master);
      osc.start(now); osc.stop(now + 0.13);
    }
  }

  dispose() {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
