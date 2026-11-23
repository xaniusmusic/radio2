import { METER_BANDS, XANIUS_UUID, countryName, formatFrequency, type Band, type Station } from "../lib/catalog";
import { LOCATIONS, bandOpenness, qualityColor, reception, type Conditions, type GeoPoint, type Reception } from "../lib/propagation";

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="section-title"><span>{children}</span>{right}</div>;
}

interface LocationProps {
  location: GeoPoint; setLocation: (g: GeoPoint) => void;
  onGeolocate: () => void; locating: boolean; geoNote: string;
  manualHour: number | null; setManualHour: (h: number | null) => void;
  solarFlux: number; setSolarFlux: (v: number) => void;
  c: Conditions;
}

export function LocationPanel({ location, setLocation, onGeolocate, locating, geoNote, manualHour, setManualHour, solarFlux, setSolarFlux, c }: LocationProps) {
  const h = Math.floor(c.localHour), m = Math.round((c.localHour % 1) * 60);
  const timeLabel = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return (
    <section className="panel">
      <SectionTitle right={<span className="text-[10px] text-[#8d7d64]">RX SITE</span>}>01 · LISTENER POSITION</SectionTitle>
      <label className="field-label">Receiver location</label>
      <div className="flex gap-2">
        <select className="vintage-select" value={location.name} onChange={(e) => setLocation(LOCATIONS.find((l) => l.name === e.target.value) || LOCATIONS[0])}>
          {!LOCATIONS.some((l) => l.name === location.name) && <option value={location.name}>{location.name} — GPS fix</option>}
          {LOCATIONS.map((l) => <option key={l.name} value={l.name}>{l.name} — {l.region}</option>)}
        </select>
        <button className="mini-btn geo-btn" onClick={onGeolocate} title="Use browser geolocation">{locating ? "···" : "◎"}</button>
      </div>
      <div className="coords-line">{location.lat.toFixed(2)}° {location.lat >= 0 ? "N" : "S"} · {Math.abs(location.lon).toFixed(2)}° {location.lon >= 0 ? "E" : "W"}{geoNote && <span className="ml-2 text-[#82c9a1]">{geoNote}</span>}</div>

      <div className="mt-4 flex items-center justify-between">
        <label className="field-label !mb-0">Local clock</label>
        <button className={`toggle-pill ${manualHour === null ? "active" : ""}`} onClick={() => setManualHour(null)}>LIVE</button>
      </div>
      <div className="clock-row">
        <span className="clock-time">{timeLabel}</span>
        <span className={`phase-chip ${c.phase.toLowerCase()}`}>{c.phase === "Greyline" ? "◑ GREYLINE" : c.phase === "Daylight" ? "☀ DAY" : "☾ NIGHT"}</span>
      </div>
      <input className="vintage-range" type="range" min={0} max={23.75} step={0.25} value={manualHour ?? Math.round(c.localHour * 4) / 4} onChange={(e) => setManualHour(parseFloat(e.target.value))} aria-label="Simulated local hour" />
      <div className="range-labels"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      <div className="hint">Slide to simulate any hour. Live mode uses your real UTC clock and longitude.</div>

      <div className="mt-4 flex items-center justify-between">
        <label className="field-label !mb-0">Solar flux (SFU)</label><span className="text-[#e9c98a] text-xs font-mono">{solarFlux}</span>
      </div>
      <input className="vintage-range" type="range" min={70} max={230} step={5} value={solarFlux} onChange={(e) => setSolarFlux(Number(e.target.value))} aria-label="Solar flux" />
      <div className="range-labels"><span>quiet sun</span><span>solar max</span></div>
    </section>
  );
}

export interface IonoSignal { freqMHz: number; quality: number; greyline: boolean; note: string }

function IonosphereDiagram({ c, signal }: { c: Conditions; signal?: IonoSignal }) {
  const escaped = !!signal && signal.freqMHz > c.muf;
  const absorbed = !!signal && !escaped && signal.freqMHz < c.luf;
  const reflecting = !!signal && !escaped && !absorbed;
  const day = c.dayFactor;
  const status = !signal ? "TUNE TO AN HF CHANNEL TO TRACE THE SKYWAVE PATH"
    : escaped ? "ABOVE MUF · SIGNAL ESCAPES INTO SPACE"
      : absorbed ? "BELOW LUF · D-LAYER ABSORPTION"
        : signal.greyline ? "GREYLINE DX · ENHANCED SKYWAVE" : "F-LAYER REFLECTION · MULTI-HOP SKYWAVE";
  return (
    <div className="iono-wrap">
      <svg viewBox="0 0 320 134" role="img" aria-label="Ionosphere cross section">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#101b2a" /><stop offset="1" stopColor="#1e2130" /></linearGradient>
          <linearGradient id="ray" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f2b45e" /><stop offset="1" stopColor="#8ce0a1" /></linearGradient>
        </defs>
        <rect width="320" height="134" fill="url(#sky)" rx="5" />
        {[40, 80, 120, 160, 200, 240, 280].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="110" stroke="#ffffff" strokeOpacity=".045" />)}
        <rect x="0" y="20" width="320" height="28" fill="#5f9ad8" opacity={0.07 + 0.12 * day} />
        <rect x="0" y="55" width="320" height="12" fill="#7ab8d9" opacity={0.06 + 0.1 * day} />
        <rect x="0" y="80" width="320" height="12" fill="#d98252" opacity={0.03 + 0.36 * day} />
        <text x="6" y="33" className="iono-label">F2 · 250–400 km</text>
        <text x="6" y="65" className="iono-label">E · 90–150 km</text>
        <text x="6" y="90" className="iono-label" fill={day > 0.3 ? "#f0a472" : "#8a7f75"}>D · {day > 0.3 ? "active in daylight" : "gone after sunset"}</text>
        {day > 0.25 ? <g><circle cx="286" cy="24" r="9" fill="#ffd37a" opacity={day} /><circle cx="286" cy="24" r="14" fill="none" stroke="#ffd37a" strokeOpacity={day * 0.4} strokeDasharray="2 4" /></g>
          : <g><circle cx="286" cy="24" r="9" fill="#cdd7f2" opacity={0.85} /><circle cx="290" cy="21" r="8" fill="#101b2a" /></g>}
        <rect x="0" y="109" width="320" height="25" fill="#28251e" />
        <line x1="0" y1="109" x2="320" y2="109" stroke="#7b6a4a" strokeWidth="1.4" />
        {/* transmitter and receiver masts */}
        <path d="M30 109 L34 96 L38 109" fill="none" stroke="#e9c98a" strokeWidth="1.3" /><circle cx="34" cy="94" r="2.5" fill="#f0c87c" />
        <path d="M282 109 L286 96 L290 109" fill="none" stroke="#8ce0a1" strokeWidth="1.3" /><circle cx="286" cy="94" r="2.5" fill="#8ce0a1" />
        {reflecting && <path d="M34 94 L102 26 L172 109 L238 26 L286 94" fill="none" stroke={signal!.greyline ? "#e4a0c9" : "url(#ray)"} strokeWidth={1.2 + signal!.quality * 1.8} strokeDasharray="5 3" opacity="0.85" strokeLinejoin="round" />}
        {escaped && <path d="M34 94 L110 26 L156 -6" fill="none" stroke="#e9836b" strokeWidth="1.8" strokeDasharray="5 3" />}
        {absorbed && <g><path d="M34 94 L92 84" fill="none" stroke="#e9836b" strokeWidth="1.8" strokeDasharray="5 3" /><path d="M87 79 L97 89 M97 79 L87 89" stroke="#e9836b" strokeWidth="1.6" /></g>}
        {!signal && <path d="M34 94 L102 26 L172 109 L238 26 L286 94" fill="none" stroke="#8d8270" strokeWidth="1" strokeDasharray="3 5" opacity=".45" />}
        <text x="20" y="127" className="iono-ground">TX</text><text x="272" y="127" className="iono-ground">RX</text>
      </svg>
      <div className={`iono-caption ${escaped || absorbed ? "bad" : signal ? "good" : ""}`}>{status}</div>
    </div>
  );
}

export function PropagationPanel({ c, signal }: { c: Conditions; signal?: IonoSignal }) {
  const bands = METER_BANDS.map((m) => ({ ...m, open: bandOpenness(m.min, m.max, c) }));
  return (
    <section className="panel">
      <SectionTitle right={<span className="text-[10px] text-[#8d7d64]">HF MODEL</span>}>02 · IONOSPHERE NOW</SectionTitle>
      <IonosphereDiagram c={c} signal={signal} />
      <div className="stat-grid">
        <div className="stat-box"><span>SUN ELEV.</span><strong>{c.elevation.toFixed(1)}°</strong><small>{c.elevation > 0 ? "above horizon" : "below horizon"}</small></div>
        <div className="stat-box"><span>MUF</span><strong>{c.muf.toFixed(1)}<em> MHz</em></strong><small>max usable freq.</small></div>
        <div className="stat-box"><span>LUF</span><strong>{c.luf.toFixed(1)}<em> MHz</em></strong><small>D-layer limit</small></div>
        <div className="stat-box"><span>ATMOS. NOISE</span><strong>{Math.round(c.noise * 100)}<em> %</em></strong><small>{c.season} conditions</small></div>
      </div>
      <div className="usable-window">
        <div className="flex justify-between text-[10px] tracking-widest text-[#b79a6d]"><span>ABSORBED</span><span>USABLE WINDOW {c.luf.toFixed(1)}–{c.muf.toFixed(1)} MHz</span><span>SPACE</span></div>
        <div className="window-track">
          <div className="window-fill" style={{ left: `${(c.luf / 30) * 100}%`, width: `${Math.max(2, ((c.muf - c.luf) / 30) * 100)}%` }} />
          {[5, 10, 15, 20, 25].map((f) => <span key={f} className="window-tick" style={{ left: `${(f / 30) * 100}%` }} />)}
        </div>
      </div>
      <label className="field-label mt-4">Broadcast band availability</label>
      <div className="band-grid">
        {bands.map((b) => {
          const status = b.open > 0.62 ? "OPEN" : b.open > 0.28 ? "FAIR" : b.open > 0.1 ? "POOR" : "CLOSED";
          return (
            <div key={b.name} className={`band-chip s-${status.toLowerCase()}`} title={`${b.min / 1000}–${b.max / 1000} MHz · ${Math.round(b.open * 100)}% usable`}>
              <span>{b.name}</span><i style={{ width: `${Math.max(4, b.open * 100)}%` }} /><em>{status}</em>
            </div>
          );
        })}
      </div>
      <p className="hint mt-3">Daylight D-layer absorption raises the LUF; higher bands close after dark when the F-layer weakens. Greyline paths get a ~28% DX boost.</p>
    </section>
  );
}

interface LogProps {
  band: Band; freq: number; stations: Station[];
  getReception: (s: Station) => Reception;
  onSelect: (s: Station) => void;
  activeId?: string;
}

export function StationLog({ band, freq, stations, getReception, onSelect, activeId }: LogProps) {
  const list = stations.filter((s) => s.band === band)
    .map((s) => ({ s, r: getReception(s) }))
    .sort((a, b) => Math.abs(a.s.freqKhz - freq) - Math.abs(b.s.freqKhz - freq))
    .slice(0, 24);
  return (
    <section className="panel log-panel">
      <SectionTitle right={<span className="text-[10px] text-[#8d7d64]">{list.length} CHANNELS</span>}>04 · BAND SCAN / STATION LOG</SectionTitle>
      <div className="log-head"><span>FREQ</span><span>STATION / ORIGIN</span><span>RX</span></div>
      <div className="log-scroll">
        {list.map(({ s, r }) => (
          <button key={s.id} className={`log-row ${activeId === s.id ? "active" : ""} ${s.id === XANIUS_UUID ? "featured" : ""}`} onClick={() => onSelect(s)} title={`${r.note} · ${r.distanceKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km path`}>
            <span className="log-freq">{s.id === XANIUS_UUID ? "★ " : ""}{formatFrequency(s.freqKhz, band)}</span>
            <span className="log-name"><b>{s.name}</b><small>{s.id === XANIUS_UUID ? "★ featured · " : ""}{countryName(s.countryCode)} · {s.meterBand || s.source}{r.greyline ? " · ◑ greyline" : ""}</small></span>
            <span className="log-rx" style={{ color: qualityColor(r.propagation) }}>
              <i style={{ background: qualityColor(r.propagation), width: `${Math.max(4, r.propagation * 100)}%` }} />
              {r.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function SwMapPanel({ stations, c, location, onSelect }: {
  stations: Station[]; c: Conditions; location: GeoPoint; onSelect: (s: Station) => void;
}) {
  const list = stations.filter((s) => s.band === "SW").sort((a, b) => a.freqKhz - b.freqKhz).slice(0, 18);
  const t = c.date.getTime() / 1000;
  return (
    <section className="panel">
      <SectionTitle right={<span className="text-[10px] text-[#8d7d64]">{stations.filter((s) => s.band === "SW").length} MAPPED</span>}>03 · HF STATION DIRECTORY</SectionTitle>
      <p className="hint !mt-0 !mb-2">Shortwave-capable catalogue entries placed on the HF dial. Click a channel to tune it.</p>
      <div className="sw-map-scroll">
        {list.map((s) => {
          const r = reception(s, "SW", s.freqKhz, location, c, t);
          const src = s.freqSource === "tag" ? "kHz tag" : s.freqSource === "schedule" ? "published" : "assigned";
          return (
            <button key={s.id} className="sw-map-row" onClick={() => onSelect(s)} title={r.note}>
              <span className="sw-freq">{formatFrequency(s.freqKhz, "SW")}</span>
              <span className="sw-band">{s.meterBand}</span>
              <span className="sw-name"><b>{s.name}</b><small>{countryName(s.countryCode)} · {src}{s.source === "live" ? " · live" : ""}</small></span>
              <span className="sw-quality" style={{ color: qualityColor(r.propagation) }}>● {Math.round(r.propagation * 100)}%</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function AboutPanel({ catalogMessage, online, onRefresh, loading }: { catalogMessage: string; online: boolean; onRefresh: () => void; loading: boolean }) {
  return (
    <section className="panel about-panel">
      <SectionTitle right={<button className="mini-btn" onClick={onRefresh} disabled={loading}>{loading ? "···" : "↻ RELOAD"}</button>}>05 · ABOUT THIS RECEIVER</SectionTitle>
      <p className="hint !text-[11px]">
        Live streams come from the community catalogue at <a href="https://www.radio-browser.info/" target="_blank" rel="noreferrer">radio-browser.info ↗</a>. Shortwave-capable entries are discovered by the <code>shortwave</code> tag and international broadcaster searches, then mapped onto HF channels (real kHz tags are used when present).
      </p>
      <p className="hint !text-[11px]">
        Reception is a simulation: MUF/LUF from solar elevation, D-layer absorption, great-circle path distance, polar attenuation, greyline enhancement and slow QSB fading mix the live stream with atmospheric noise. Hiss, crackle, heterodyne whistles, switch clicks and the tuning sweep are synthesised in real time with the Web Audio API instead of sampled loops, so every pass across the dial sounds different. Turn slowly to hear stations emerge from the noise.
      </p>
      <div className={`source-status ${online ? "ok" : "warn"}`}><span className="status-dot" /> {catalogMessage}</div>
    </section>
  );
}
