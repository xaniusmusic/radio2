import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BANDS, METER_BANDS, formatFrequency, type Band, type Station } from "../lib/catalog";
import { bandOpenness, qualityColor, type Conditions } from "../lib/propagation";

/** Non-passive wheel handler so dial scrolling never scrolls the page. */
function useWheel(ref: React.RefObject<HTMLElement | null>, handler: (e: WheelEvent) => void) {
  const cb = useRef(handler);
  cb.current = handler;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fn = (e: WheelEvent) => { e.preventDefault(); cb.current(e); };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [ref]);
}

interface DialProps {
  band: Band;
  freq: number;
  stations: Station[];
  qualityOf: (s: Station) => number;
  conditions: Conditions;
  powered: boolean;
  onTune: (freq: number, sound?: boolean) => void;
  onTuneEnd?: () => void;
}

export function RadioDial({ band, freq, stations, qualityOf, conditions, powered, onTune, onTuneEnd }: DialProps) {
  const spec = BANDS[band];
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = ((freq - spec.min) / (spec.max - spec.min)) * 100;

  const ticks = useMemo(() => {
    const major = band === "FM" ? 2000 : band === "AM" ? 100 : 1000;
    const minor = band === "FM" ? 500 : band === "AM" ? 20 : 250;
    const out: { pos: number; big: boolean; label?: string }[] = [];
    for (let f = spec.min; f <= spec.max; f += minor) {
      if (Math.round(f * 10) % Math.round(major * 10) === 0) {
        const label = band === "FM" ? String(Math.round(f / 1000)) : band === "AM" ? String(Math.round(f)) : (f / 1000).toFixed(0);
        out.push({ pos: ((f - spec.min) / (spec.max - spec.min)) * 100, big: true, label });
      } else out.push({ pos: ((f - spec.min) / (spec.max - spec.min)) * 100, big: false });
    }
    return out;
  }, [band, spec]);

  const tuneFromX = useCallback((clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const f = spec.min + ratio * (spec.max - spec.min);
    onTune(Math.round(f / spec.step) * spec.step);
  }, [onTune, spec]);

  useWheel(barRef, (e) => onTune(freq + (e.deltaY > 0 ? 1 : -1) * spec.step * (e.shiftKey ? 10 : 1)));

  const meterShades = band === "SW" ? METER_BANDS.map((m) => ({
    ...m,
    left: ((m.min - spec.min) / (spec.max - spec.min)) * 100,
    width: ((m.max - m.min) / (spec.max - spec.min)) * 100,
    open: bandOpenness(m.min, m.max, conditions),
  })) : [];

  const markers = stations.filter((s) => s.band === band).map((s) => ({ s, q: qualityOf(s) }));
  const prominent = [...markers].filter((m) => m.q > 0.34).sort((a, b) => b.q - a.q).slice(0, 7);

  return (
    <div className="dial-assembly">
      <div className="dial-top-labels">
        <span>{spec.full}</span>
        <span className="hidden sm:inline">{band === "SW" ? "SKYWAVE · IONOSPHERIC" : band === "FM" ? "STEREO · LINE OF SIGHT" : "GROUND WAVE · SKYWAVE AT NIGHT"}</span>
      </div>
      <div
        ref={barRef}
        className={`dial-glass ${dragging ? "is-dragging" : ""}`}
        onPointerDown={(e) => {
          setDragging(true);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          tuneFromX(e.clientX);
        }}
        onPointerMove={(e) => { if (dragging) tuneFromX(e.clientX); }}
        onPointerUp={(e) => { setDragging(false); (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); onTuneEnd?.(); }}
        onPointerCancel={() => { setDragging(false); onTuneEnd?.(); }}
        role="slider"
        aria-label={`${band} tuning dial`}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={freq}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onTune(freq + spec.step * (e.shiftKey ? 10 : 1)); }
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onTune(freq - spec.step * (e.shiftKey ? 10 : 1)); }
        }}
      >
        {/* meter band shading */}
        {meterShades.map((m) => (
          <div key={m.name} className="meter-shade" style={{ left: `${m.left}%`, width: `${m.width}%`, opacity: 0.1 + m.open * 0.42 }} title={`${m.name} band · ${Math.round(m.open * 100)}% open`} />
        ))}
        <div className="dial-scale-line" />
        {ticks.map((t, i) => (
          <div key={i} className={`dial-tick ${t.big ? "big" : "small"}`} style={{ left: `${t.pos}%` }}>
            {t.big && t.label && <span className="dial-tick-label">{t.label}</span>}
          </div>
        ))}
        {band === "SW" && meterShades.map((m) => (
          <span key={m.name} className="meter-label" style={{ left: `${m.left + m.width / 2}%`, color: m.open > 0.55 ? "#f4c97a" : "#8a7c68" }}>{m.name}</span>
        ))}
        {markers.map(({ s, q }) => (
          <div key={s.id} className="station-marker" style={{ left: `${((s.freqKhz - spec.min) / (spec.max - spec.min)) * 100}%`, background: qualityColor(q), opacity: powered ? 0.35 + q * 0.65 : 0.3 }} title={`${s.name} · ${formatFrequency(s.freqKhz, band)} ${spec.unit}`} />
        ))}
        {prominent.map(({ s }) => (
          <span key={`l-${s.id}`} className="marker-name" style={{ left: `${Math.max(3, Math.min(93, ((s.freqKhz - spec.min) / (spec.max - spec.min)) * 100))}%` }}>
            {s.name.length > 19 ? s.name.slice(0, 18) + "…" : s.name}
          </span>
        ))}
        <div className="dial-needle" style={{ left: `${pct}%` }}>
          <div className="needle-cap" />
          <div className="needle-line" />
        </div>
        <div className="dial-glass-glare" />
      </div>
      <div className="dial-bottom-labels">
        <span>{band === "SW" ? "2.3 MHz" : band === "FM" ? "87.5" : "530"}</span>
        <span className="text-[#d0a45c]/80">DRAG THE SCALE · SCROLL TO FINE TUNE · SHIFT FOR FAST</span>
        <span>{band === "SW" ? "26.1 MHz" : band === "FM" ? "108.0" : "1700"}</span>
      </div>
    </div>
  );
}

interface KnobProps {
  band: Band; freq: number; onTune: (f: number) => void; size?: number; label?: string; onTuneEnd?: () => void;
}

export function TuningKnob({ band, freq, onTune, size = 122, label = "TUNING", onTuneEnd }: KnobProps) {
  const spec = BANDS[band];
  const angle = -150 + ((freq - spec.min) / (spec.max - spec.min)) * 300;
  const drag = useRef<{ x: number; y: number; start: number } | null>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stepPerPx = (spec.max - spec.min) / 600;
  useWheel(knobRef, (e) => onTune(freq + (e.deltaY > 0 ? 1 : -1) * spec.step * (e.shiftKey ? 10 : 1)));

  return (
    <div className="knob-wrap">
      <div
        ref={knobRef}
        className="knob"
        style={{ width: size, height: size, touchAction: "none" }}
        role="slider"
        tabIndex={0}
        aria-label="Tuning knob"
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={freq}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, start: freq };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const d = drag.current;
          const delta = (e.clientX - d.x) - (e.clientY - d.y);
          const next = d.start + delta * stepPerPx * (e.shiftKey ? 0.12 : 1);
          onTune(Math.round(next / spec.step) * spec.step);
        }}
        onPointerUp={(e) => { drag.current = null; (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); onTuneEnd?.(); }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") onTune(freq + spec.step);
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") onTune(freq - spec.step);
        }}
      >
        <div className="knob-ridges" style={{ transform: `rotate(${angle}deg)` }} />
        <div className="knob-face" style={{ transform: `rotate(${angle}deg)` }}>
          <div className="knob-pointer" />
        </div>
        <div className="knob-center" />
      </div>
      <span className="knob-label">{label}</span>
    </div>
  );
}

export function VolumeKnob({ value, onChange, size = 74 }: { value: number; onChange: (v: number) => void; size?: number }) {
  const drag = useRef<{ y: number; start: number } | null>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const angle = -150 + value * 300;
  useWheel(knobRef, (e) => onChange(Math.max(0, Math.min(1, value + (e.deltaY > 0 ? -0.04 : 0.04)))));
  return (
    <div className="knob-wrap">
      <div
        ref={knobRef}
        className="knob small-knob"
        style={{ width: size, height: size, touchAction: "none" }}
        role="slider" tabIndex={0} aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}
        onPointerDown={(e) => { drag.current = { y: e.clientY, start: value }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current) onChange(Math.max(0, Math.min(1, drag.current.start + (drag.current.y - e.clientY) / 160))); }}
        onPointerUp={(e) => { drag.current = null; (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); }}
        onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(1, value + 0.05)); if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(0, value - 0.05)); }}
      >
        <div className="knob-ridges" style={{ transform: `rotate(${angle}deg)` }} />
        <div className="knob-face" style={{ transform: `rotate(${angle}deg)` }}><div className="knob-pointer" /></div>
        <div className="knob-center" />
      </div>
      <span className="knob-label">VOLUME</span>
    </div>
  );
}

export function SignalMeter({ quality, label }: { quality: number; label: string }) {
  const bars = 16;
  const active = Math.round(quality * bars);
  return (
    <div className="signal-meter">
      <div className="flex items-center justify-between text-[10px] tracking-[0.18em] text-[#c5a36c]">
        <span>SIGNAL</span><span className="text-[#e9c98a]">{label}</span>
      </div>
      <div className="meter-bars">
        {Array.from({ length: bars }).map((_, i) => (
          <span key={i} className={`meter-bar ${i < active ? "on" : ""}`} style={{ background: i < active ? (i > 11 ? "#8ae6a0" : i > 7 ? "#f0cc6c" : "#ef8c58") : undefined }} />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-[#8d7d64]"><span>S1</span><span>S3</span><span>S5</span><span>S7</span><span>S9 +20</span></div>
    </div>
  );
}
