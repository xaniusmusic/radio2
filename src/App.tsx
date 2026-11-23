import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BANDS, XANIUS_FM_KHZ, XANIUS_HISTORY_URL, XANIUS_UUID, countryName, formatFrequency, loadCatalog, snapshotCatalog, type Band, type Station } from "./lib/catalog";
import { guessLocation, makeConditions, reception, type Conditions, type GeoPoint, type Reception } from "./lib/propagation";
import { RadioAudio } from "./lib/audio";
import { RadioDial, SignalMeter, TuningKnob, VolumeKnob } from "./components/RadioDial";
import { AboutPanel, LocationPanel, PropagationPanel, SectionTitle, StationLog, SwMapPanel } from "./components/Panels";

const INITIAL_FREQ: Record<Band, number> = { FM: 94300, AM: 880, SW: 9400 };

export default function App() {
  const [band, setBand] = useState<Band>("FM");
  const [freqs, setFreqs] = useState<Record<Band, number>>(INITIAL_FREQ);
  const [powered, setPowered] = useState(false);
  const [volume, setVolume] = useState(0.72);
  const [scanning, setScanning] = useState(false);
  const [scanDir, setScanDir] = useState<1 | -1>(1);
  const [stations, setStations] = useState<Station[]>([]);
  const [catalogMessage, setCatalogMessage] = useState("Contacting radio-browser.info…");
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streamFailed, setStreamFailed] = useState(false);
  const [location, setLocation] = useState<GeoPoint>(() => guessLocation());
  const [geoNote, setGeoNote] = useState("");
  const [locating, setLocating] = useState(false);
  const [manualHour, setManualHour] = useState<number | null>(null);
  const [solarFlux, setSolarFlux] = useState(135);
  const [now, setNow] = useState(() => new Date());
  const [showHelp, setShowHelp] = useState(false);

  const freq = freqs[band];
  const freqRef = useRef(freq);
  const engineRef = useRef<RadioAudio | null>(null);
  const latest = useRef<{ quality: number; propagation: number; tuning: number; band: Band; detune: number; bandwidth: number }>({ quality: 0, propagation: 0, tuning: 0, band: "FM", detune: 0, bandwidth: 140 });
  freqRef.current = freq;

  const refreshCatalog = useCallback(async () => {
    setLoading(true);
    setCatalogMessage("Contacting radio-browser.info…");
    try {
      const res = await loadCatalog();
      setStations(res.stations);
      setOnline(res.online);
      setCatalogMessage(res.message);
    } catch {
      setStations(snapshotCatalog());
      setOnline(false);
      setCatalogMessage("Offline snapshot of the radio-browser.info catalogue");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refreshCatalog(); }, [refreshCatalog]);
  useEffect(() => {
    const e = new RadioAudio();
    engineRef.current = e;
    e.setCallbacks((failed) => setStreamFailed(failed));
    const id = window.setInterval(() => e.update(latest.current), 70);
    return () => { window.clearInterval(id); e.dispose(); engineRef.current = null; };
  }, []);
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => { engineRef.current?.setVolume(volume); }, [volume]);
  useEffect(() => { void engineRef.current?.setPower(powered); }, [powered]);

  const conditions: Conditions = useMemo(() => makeConditions(location, manualHour, now, solarFlux), [location, manualHour, now, solarFlux]);
  const tSeconds = now.getTime() / 1000;

  const bandStations = useMemo(() => stations.filter((s) => s.band === band), [stations, band]);
  const receptionMap = useMemo(() => {
    const m = new Map<string, Reception>();
    bandStations.forEach((s) => m.set(s.id, reception(s, band, freq, location, conditions, tSeconds)));
    return m;
  }, [bandStations, band, freq, location, conditions, tSeconds]);

  const ranked = useMemo(() => bandStations
    .map((s) => ({ s, r: receptionMap.get(s.id)! }))
    .sort((a, b) => b.r.quality - a.r.quality), [bandStations, receptionMap]);
  const best = ranked[0]?.r.quality > 0.06 ? ranked[0] : undefined;
  const carrier = useMemo(() => {
    const nearby = ranked
      .filter(({ s, r }) => Math.abs(s.freqKhz - freq) < BANDS[band].bandwidth * 9 && r.propagation > 0.09)
      .sort((a, b) => Math.abs(a.s.freqKhz - freq) - Math.abs(b.s.freqKhz - freq));
    return nearby.length ? nearby[0].s : best?.s;
  }, [ranked, best, freq, band]);
  const streamUrl = carrier?.streamUrl || "";
  const altUrl = carrier?.altUrl;

  useEffect(() => { engineRef.current?.setStation(streamUrl, altUrl); }, [streamUrl, altUrl]);
  latest.current = {
    quality: best?.r.quality || 0,
    propagation: best?.r.propagation || 0,
    tuning: best?.r.tuning || 0,
    band,
    detune: best ? Math.abs(freq - best.s.freqKhz) : 999,
    bandwidth: BANDS[band].bandwidth,
  };

  // Snapshot for the scanning interval (avoids restarting the sweep each render).
  const scanData = useRef({ stations: bandStations, map: receptionMap });
  scanData.current = { stations: bandStations, map: receptionMap };

  const tune = useCallback((value: number, sound = true) => {
    const spec = BANDS[band];
    const v = Math.max(spec.min, Math.min(spec.max, Math.round(value / spec.step) * spec.step));
    if (v === freqRef.current) return;
    freqRef.current = v;
    setFreqs((prev) => ({ ...prev, [band]: v }));
    if (sound && powered) engineRef.current?.tuneBurst(scanning ? 0.7 : 1);
  }, [band, powered, scanning]);

  const changeBand = (b: Band) => {
    if (b === band) return;
    setScanning(false);
    setBand(b);
    freqRef.current = freqs[b];
    engineRef.current?.click(0.55);
  };

  // Analog AFC: on releasing the dial, pull onto the nearest channel if we're close.
  const snapToStation = useCallback(() => {
    const threshold = band === "FM" ? 110 : band === "AM" ? 18 : 28;
    const near = bandStations
      .filter((s) => Math.abs(s.freqKhz - freqRef.current) <= threshold)
      .sort((a, b) => Math.abs(a.freqKhz - freqRef.current) - Math.abs(b.freqKhz - freqRef.current))[0];
    if (near) tune(near.freqKhz, false);
  }, [band, bandStations, tune]);

  const qualityOf = useCallback((s: Station) => receptionMap.get(s.id)?.propagation || 0, [receptionMap]);
  const getReception = useCallback((s: Station) => receptionMap.get(s.id) || reception(s, band, freq, location, conditions, tSeconds), [receptionMap, band, freq, location, conditions, tSeconds]);

  const selectStation = (s: Station) => {
    setScanning(false);
    tune(s.freqKhz);
    engineRef.current?.click(0.4);
  };

  const selectSwChannel = (s: Station) => {
    setScanning(false);
    setBand("SW");
    const spec = BANDS.SW;
    const v = Math.max(spec.min, Math.min(spec.max, s.freqKhz));
    freqRef.current = v;
    setFreqs((prev) => ({ ...prev, SW: v }));
    engineRef.current?.click(0.4);
  };

  // Featured station preset — Xanius Radio on 101.1 FM.
  const tuneXanius = () => {
    setScanning(false);
    setBand("FM");
    freqRef.current = XANIUS_FM_KHZ;
    setFreqs((prev) => ({ ...prev, FM: XANIUS_FM_KHZ }));
    if (!powered) setPowered(true);
    engineRef.current?.click(0.5);
    engineRef.current?.tuneBurst(0.8);
  };

  // Seek to the next receivable station in the chosen direction.
  const seek = useCallback((dir: 1 | -1) => {
    const sorted = [...bandStations].sort((a, b) => a.freqKhz - b.freqKhz);
    const spec = BANDS[band];
    const candidates = dir === 1
      ? sorted.filter((s) => s.freqKhz > freqRef.current + spec.step)
      : [...sorted].reverse().filter((s) => s.freqKhz < freqRef.current - spec.step);
    const usable = candidates.find((s) => (receptionMap.get(s.id)?.propagation || 0) > 0.27);
    setScanning(false);
    if (usable) tune(usable.freqKhz);
    else tune(dir === 1 ? spec.min : spec.max);
    engineRef.current?.click(0.4);
  }, [bandStations, band, receptionMap, tune]);

  // Automatic scan: sweep the dial with continuous tuning noise until a receivable carrier is crossed.
  useEffect(() => {
    if (!scanning) { engineRef.current?.setScanning(false); return; }
    engineRef.current?.setScanning(true);
    const spec = BANDS[band];
    const jump = band === "FM" ? spec.step * 3 : band === "AM" ? spec.step * 2 : spec.step * 20;
    let guard = 0;
    const id = window.setInterval(() => {
      guard++;
      const from = freqRef.current;
      const to = from + scanDir * jump;
      if (to >= spec.max || to <= spec.min || guard > 1200) {
        tune(scanDir === 1 ? spec.max : spec.min, false);
        setScanning(false);
        return;
      }
      const crossed = scanData.current.stations
        .filter((s) => scanDir === 1 ? (s.freqKhz > from && s.freqKhz <= to) : (s.freqKhz < from && s.freqKhz >= to))
        .sort((a, b) => scanDir * (a.freqKhz - b.freqKhz));
      const hit = crossed.find((s) => (scanData.current.map.get(s.id)?.propagation || 0) > 0.45);
      if (hit) {
        tune(hit.freqKhz, false);
        engineRef.current?.click(0.3);
        setScanning(false);
        return;
      }
      tune(to);
    }, 55);
    return () => { window.clearInterval(id); engineRef.current?.setScanning(false); };
  }, [scanning, band, scanDir, tune]);

  const startScan = (dir: 1 | -1) => { if (!powered) setPowered(true); setScanDir(dir); setScanning((v) => (v && dir === scanDir ? false : true)); };

  const geolocate = () => {
    if (!navigator.geolocation) { setGeoNote("Geolocation unavailable — choose a city"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        setLocation({ name: "My location", lat, lon, region: "GPS fix" });
        setGeoNote(`GPS ±${Math.round(pos.coords.accuracy)}m`);
        setLocating(false);
      },
      () => { setGeoNote("Permission denied — choose a city"); setLocating(false); },
      { timeout: 9000 }
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); setPowered((p) => !p); }
      if (e.key === "f" || e.key === "F") changeBand("FM");
      if (e.key === "a" || e.key === "A") changeBand("AM");
      if (e.key === "s" || e.key === "S") changeBand("SW");
      if (e.key === "[") seek(-1);
      if (e.key === "]") seek(1);
      if (e.key === "x" || e.key === "X") tuneXanius();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const q = best?.r.quality || 0;
  const displayQuality = Math.round(q * 100);
  const bandLabel = BANDS[band];
  const isClear = q > 0.6;
  const xaniusStation = stations.find((s) => s.id === XANIUS_UUID);
  const isXaniusTuned = band === "FM" && freq === XANIUS_FM_KHZ;

  return (
    <div className="app-shell">
      <div className="ambient-glow" />
      <header className="site-header">
        <div className="brand">
          <div className="brand-mark">◉</div>
          <div>
            <h1>ETHERWAVE <span>DX-9000</span></h1>
            <p>World-band receiver simulator · FM / MW / HF</p>
          </div>
        </div>
        <div className="header-right">
          <div className="header-status">
            <span className={`status-dot ${online ? "ok" : ""}`} />
            <span>{online ? "CATALOGUE LINKED" : "SNAPSHOT MODE"}</span>
            <small>radio-browser.info</small>
          </div>
          <button className="help-btn" onClick={() => setShowHelp((v) => !v)}>? GUIDE</button>
        </div>
      </header>

      {showHelp && (
        <div className="guide-banner">
          <b>Operating the DX-9000:</b> press <kbd>POWER</kbd>, choose a band, then drag the illuminated scale or turn the brass knob to tune through real static. <kbd>SCAN ▶</kbd> sweeps to the next receivable signal. On <kbd>SW</kbd>, reception changes with your location and the local hour — try 12:00 vs 02:00 and watch the MUF/LUF window move. Shortcuts: <kbd>F</kbd>/<kbd>A</kbd>/<kbd>S</kbd> bands, <kbd>[</kbd>/<kbd>]</kbd> seek, <kbd>Space</kbd> power, <kbd>X</kbd> for the featured Xanius Radio preset on 101.1 FM.
          <button onClick={() => setShowHelp(false)}>×</button>
        </div>
      )}

      <main className="main-grid">
        {/* ── The receiver ───────────────────────────────────────── */}
        <div className="receiver-column">
          <div className="cabinet">
            <div className="cabinet-top">
              <span className="cabinet-badge">ETHERWAVE</span>
              <span className="cabinet-model">MODEL DX-9000 · SOLID STATE · 3 BAND · PLL SYNTHESIZER</span>
              <span className="cabinet-badge right">◈ Hi-Fi</span>
            </div>

            <div className="cabinet-body">
              {/* Display + speaker */}
              <div className="upper-deck">
                <div className="display-bezel">
                  <div className={`lcd ${powered ? "on" : ""}`}>
                    <div className="lcd-top">
                      <span>{bandLabel.label}</span>
                      <span className="lcd-indicators">
                        {isClear && <i className="led-pill">TUNED</i>}
                        {band === "FM" && q > 0.65 && <i className="led-pill">ST</i>}
                        {band === "SW" && best?.r.greyline && <i className="led-pill">DX</i>}
                        {scanning && <i className="led-pill scan">SCAN</i>}
                      </span>
                    </div>
                    <div className="lcd-frequency">
                      <span className="freq-digits">{powered ? formatFrequency(freq, band) : "--.--"}</span>
                      <span className="freq-unit">{bandLabel.unit}</span>
                    </div>
                    <div className="lcd-bottom">
                      <span className="truncate">{powered ? (best && q > 0.09 ? best.s.name : "··· searching the band ···") : "STANDBY"}</span>
                      <span>{powered ? `${displayQuality}%` : ""}</span>
                    </div>
                    <div className="lcd-scanlines" />
                  </div>
                </div>
                <div className="speaker-grille" aria-hidden="true"><div className="speaker-inner" /></div>
              </div>

              {/* Dial */}
              <RadioDial band={band} freq={freq} stations={stations} qualityOf={qualityOf} conditions={conditions} powered={powered} onTune={tune} onTuneEnd={snapToStation} />

              {/* Now playing strip */}
              <div className="now-strip">
                <div className="now-left">
                  <span className="now-label">NOW RECEIVING</span>
                  <strong>{powered && best && q > 0.09 ? best.s.name : "— no signal —"}</strong>
                  <small>{powered && best && q > 0.09 ? `${countryName(best.s.countryCode)} · ${best.r.note} · ${Math.round(best.r.distanceKm).toLocaleString()} km${best.s.meterBand ? ` · ${best.s.meterBand} band` : ""}` : "Rotate the dial to find a station"}</small>
                </div>
                <div className="now-right">
                  <span className={`rx-badge ${streamFailed && best && q > 0.2 ? "err" : ""}`} style={{ color: q > 0.1 ? undefined : "#8d7d64" }}>
                    {!powered ? "OFF" : streamFailed && best && q > 0.2 ? "STREAM OFFLINE" : q > 0.1 ? best?.r.label.toUpperCase() : "NOISE"}
                  </span>
                  {carrier?.homepage && <a className="homepage-link" href={carrier.homepage} target="_blank" rel="noreferrer">station site ↗</a>}
                </div>
              </div>

              {/* Featured station from radio-browser.info */}
              <div className={`xanius-card ${isXaniusTuned && powered ? "tuned" : ""}`}>
                <div className="xanius-art">
                  {xaniusStation?.favicon
                    ? <img src={xaniusStation.favicon} alt="Xanius Radio artwork" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    : <span>✦</span>}
                </div>
                <div className="xanius-info">
                  <span className="xanius-kicker">★ FEATURED · RADIO-BROWSER.INFO</span>
                  <strong>Xanius Radio</strong>
                  <small>Electro · House · New York, USA · MP3 128 kbps</small>
                  <a href={XANIUS_HISTORY_URL} target="_blank" rel="noreferrer">catalogue entry ↗</a>
                </div>
                <div className="xanius-actions">
                  <span className="xanius-freq">101.1 <em>MHz FM</em></span>
                  <button className="xanius-btn" onClick={tuneXanius}>{isXaniusTuned && powered ? "● ON AIR" : "▶ TUNE IN"}</button>
                  <span className="xanius-hint">or press <kbd>X</kbd></span>
                </div>
              </div>

              {/* Controls */}
              <div className="control-deck">
                <div className="band-buttons">
                  <span className="control-caption">WAVE BAND</span>
                  <div className="band-row">
                    {(["FM", "AM", "SW"] as Band[]).map((b) => (
                      <button key={b} className={`band-btn ${band === b ? "selected" : ""}`} onClick={() => changeBand(b)}>
                        <b>{b}</b><small>{b === "FM" ? "87.5–108 MHz" : b === "AM" ? "530–1700 kHz" : "2.3–26.1 MHz"}</small>
                      </button>
                    ))}
                  </div>
                  <div className="transport-row">
                    <button className="transport-btn" onClick={() => seek(-1)} title="Seek down">◀◀</button>
                    <button className={`transport-btn ${scanning ? "active" : ""}`} onClick={() => startScan(1)} title="Auto scan up">{scanning ? "■ STOP" : "SCAN ▶"}</button>
                    <button className="transport-btn" onClick={() => seek(1)} title="Seek up">▶▶</button>
                  </div>
                </div>

                <div className="knobs-area">
                  <TuningKnob band={band} freq={freq} onTune={tune} onTuneEnd={snapToStation} />
                  <div className="knob-stack">
                    <VolumeKnob value={volume} onChange={setVolume} />
                    <button className={`power-btn ${powered ? "on" : ""}`} onClick={() => setPowered((p) => !p)}>
                      <span className="power-ring"><span>⏻</span></span>
                      POWER
                    </button>
                  </div>
                </div>

                <div className="meter-area">
                  <SignalMeter quality={q} label={powered ? best?.r.label || "NOISE" : "OFF"} />
                  <div className="meter-extra">
                    <span>VOL {Math.round(volume * 100)}</span>
                    <span>BW {band === "FM" ? "180 kHz" : band === "AM" ? "9 kHz" : "5 kHz"}</span>
                    <span>{band === "SW" ? "SSB/AM" : band === "FM" ? "WFM" : "AM"}</span>
                  </div>
                  <div className="tuning-eye" title="Tuning indicator">
                    <span style={{ width: `${Math.max(6, q * 100)}%`, opacity: powered ? 1 : 0.15 }} />
                  </div>
                  <span className="control-caption !mt-1">TUNING EYE / MAGIC EYE</span>
                </div>
              </div>
            </div>
            <div className="cabinet-foot"><span>◈</span> HANDCRAFTED · WEB AUDIO SIGNAL SIMULATION <span>◈</span></div>
          </div>

          <div className="under-radio">
            <SectionTitle right={<span className="text-[10px] text-[#8d7d64]">{band} BAND</span>}>SIGNAL REPORT</SectionTitle>
            <div className="report-grid">
              <div><span>FREQUENCY</span><b>{formatFrequency(freq, band)} {bandLabel.unit}</b></div>
              <div><span>PROPAGATION</span><b>{best ? best.r.note : "—"}</b></div>
              <div><span>PATH LENGTH</span><b>{best ? `${Math.round(best.r.distanceKm).toLocaleString()} km` : "—"}</b></div>
              <div><span>SOURCE</span><b>{carrier ? (carrier.source === "live" ? "radio-browser.info live" : "catalogue snapshot") : "—"}</b></div>
              <div><span>HF CHANNEL</span><b>{carrier?.freqSource === "tag" ? "from station kHz tag" : carrier?.freqSource === "schedule" ? "published channel" : "simulated assignment"}</b></div>
              <div><span>SOLAR PHASE</span><b>{conditions.phase} · {conditions.elevation.toFixed(0)}°</b></div>
            </div>
          </div>
        </div>

        {/* ── Side panels ────────────────────────────────────────── */}
        <aside className="side-column">
          <LocationPanel location={location} setLocation={setLocation} onGeolocate={geolocate} locating={locating} geoNote={geoNote}
            manualHour={manualHour} setManualHour={setManualHour} solarFlux={solarFlux} setSolarFlux={setSolarFlux} c={conditions} />
          <PropagationPanel c={conditions} signal={band === "SW" && best ? { freqMHz: best.s.freqKhz / 1000, quality: best.r.quality, greyline: best.r.greyline, note: best.r.note } : undefined} />
          <SwMapPanel stations={stations} c={conditions} location={location} onSelect={selectSwChannel} />
          <StationLog band={band} freq={freq} stations={stations} getReception={getReception} onSelect={selectStation} activeId={carrier?.id} />
          <AboutPanel catalogMessage={catalogMessage} online={online} onRefresh={() => void refreshCatalog()} loading={loading} />
        </aside>
      </main>

      <footer className="site-footer">
        <span>ETHERWAVE DX-9000 · an educational broadcast simulation · featuring Xanius Radio on 101.1 FM</span>
        <span>Station directory by <a href="https://www.radio-browser.info/" target="_blank" rel="noreferrer">radio-browser.info</a> · ionosphere model: solar elevation, LUF/MUF, path loss, greyline &amp; QSB fading</span>
      </footer>
    </div>
  );
}
