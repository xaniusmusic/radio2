/* Catalog layer: live station data from radio-browser.info + SW dial mapping.
   The HF (shortwave) frequency assignments are a simulation: the catalog does not
   publish live transmitter schedules, so where a station's tags contain a real
   kHz frequency we use it, otherwise we place the stream on a plausible
   international broadcast channel. */
export type Band = "FM" | "AM" | "SW";

export interface Station {
  id: string;
  name: string;
  streamUrl: string;
  altUrl?: string;
  homepage?: string;
  favicon?: string;
  countryCode: string;
  tags: string;
  codec?: string;
  bitrate?: number;
  freqKhz: number;
  band: Band;
  lat: number;
  lon: number;
  power: number;
  source: "live" | "snapshot";
  freqSource: "tag" | "assigned" | "schedule";
  meterBand?: string;
}

export interface BandSpec {
  id: Band;
  label: string;
  full: string;
  min: number; // kHz
  max: number;
  step: number;
  bandwidth: number; // capture half-width in kHz
  unit: "MHz" | "kHz";
  divisor: number;
  decimals: number;
}

export const BANDS: Record<Band, BandSpec> = {
  FM: { id: "FM", label: "FM", full: "VHF · 87.5–108.0 MHz", min: 87500, max: 108000, step: 100, bandwidth: 140, unit: "MHz", divisor: 1000, decimals: 1 },
  AM: { id: "AM", label: "MW / AM", full: "Medium wave · 530–1700 kHz", min: 530, max: 1700, step: 10, bandwidth: 5.5, unit: "kHz", divisor: 1, decimals: 0 },
  SW: { id: "SW", label: "SW / HF", full: "Shortwave · 2.30–26.10 MHz", min: 2300, max: 26100, step: 5, bandwidth: 3.2, unit: "MHz", divisor: 1000, decimals: 3 },
};

export const METER_BANDS = [
  { name: "90m", min: 3200, max: 3400 },
  { name: "75m", min: 3900, max: 4050 },
  { name: "60m", min: 4750, max: 5060 },
  { name: "49m", min: 5850, max: 6290 },
  { name: "41m", min: 7200, max: 7450 },
  { name: "31m", min: 9400, max: 9990 },
  { name: "25m", min: 11600, max: 12100 },
  { name: "22m", min: 13570, max: 13870 },
  { name: "19m", min: 15100, max: 15800 },
  { name: "16m", min: 17480, max: 17900 },
  { name: "13m", min: 21450, max: 21850 },
];

export function meterBandOf(khz: number): string {
  const b = METER_BANDS.find((m) => khz >= m.min && khz <= m.max);
  return b ? b.name : "HF";
}

export function formatFrequency(khz: number, band: Band): string {
  const s = BANDS[band];
  return (khz / s.divisor).toFixed(s.decimals);
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CENTROIDS: Record<string, [number, number, string]> = {
  US: [39.8, -98.6, "United States"], GB: [52.4, -1.9, "United Kingdom"], CU: [22.4, -79.9, "Cuba"],
  CA: [56.1, -106.3, "Canada"], MX: [23.6, -102.5, "Mexico"], BR: [-14.2, -51.9, "Brazil"],
  AR: [-38.4, -63.6, "Argentina"], CL: [-35.7, -71.5, "Chile"], CO: [4.6, -74.1, "Colombia"],
  FR: [46.6, 2.2, "France"], DE: [51.2, 10.4, "Germany"], ES: [40.4, -3.7, "Spain"],
  IT: [41.9, 12.6, "Italy"], PT: [39.4, -8.2, "Portugal"], NL: [52.1, 5.3, "Netherlands"],
  BE: [50.5, 4.5, "Belgium"], CH: [46.8, 8.2, "Switzerland"], AT: [47.5, 14.6, "Austria"],
  PL: [51.9, 19.1, "Poland"], CZ: [49.8, 15.5, "Czechia"], SK: [48.7, 19.7, "Slovakia"],
  RO: [45.9, 25.0, "Romania"], HU: [47.2, 19.5, "Hungary"], SE: [60.1, 18.6, "Sweden"],
  NO: [60.5, 8.5, "Norway"], FI: [61.9, 25.7, "Finland"], DK: [56.3, 9.5, "Denmark"],
  IE: [53.4, -8.2, "Ireland"], GR: [39.1, 23.7, "Greece"], TR: [38.9, 35.2, "Türkiye"],
  RU: [55.8, 37.6, "Russia"], UA: [48.4, 31.2, "Ukraine"], VA: [41.9, 12.45, "Vatican"],
  EG: [26.8, 30.8, "Egypt"], MA: [31.8, -7.1, "Morocco"], TN: [33.9, 9.6, "Tunisia"],
  DZ: [28.0, 2.6, "Algeria"], NG: [9.1, 8.7, "Nigeria"], ZA: [-29.0, 24.7, "South Africa"],
  KE: [-0.02, 37.9, "Kenya"], ET: [9.1, 40.5, "Ethiopia"], GH: [7.9, -1.0, "Ghana"],
  IR: [32.4, 53.7, "Iran"], PK: [30.4, 69.3, "Pakistan"], IN: [22.0, 79.0, "India"],
  CN: [35.9, 104.2, "China"], JP: [36.2, 138.3, "Japan"], KR: [36.5, 127.9, "Korea"],
  KP: [40.3, 127.5, "North Korea"], TW: [23.7, 121.0, "Taiwan"], TH: [15.9, 100.9, "Thailand"],
  VN: [16.1, 107.7, "Vietnam"], ID: [-2.5, 118.0, "Indonesia"], MY: [4.2, 101.9, "Malaysia"],
  PH: [12.9, 121.8, "Philippines"], AU: [-25.3, 133.8, "Australia"], NZ: [-40.9, 174.9, "New Zealand"],
  IL: [31.5, 34.8, "Israel"], SA: [23.9, 45.1, "Saudi Arabia"], AE: [24.0, 54.0, "UAE"],
  LB: [33.9, 35.9, "Lebanon"], PS: [31.9, 35.2, "Palestine"], IS: [64.9, -19.0, "Iceland"],
  RS: [44.0, 21.0, "Serbia"], HR: [45.1, 15.2, "Croatia"], BG: [42.7, 25.5, "Bulgaria"],
  EE: [58.6, 25.0, "Estonia"], LV: [56.9, 24.6, "Latvia"], LT: [55.2, 23.8, "Lithuania"],
  LU: [49.8, 6.1, "Luxembourg"], CY: [35.1, 33.4, "Cyprus"], GE: [42.3, 43.4, "Georgia"],
  UY: [-32.5, -55.8, "Uruguay"], PE: [-9.2, -75.0, "Peru"], VE: [6.4, -66.6, "Venezuela"],
};

export function centroid(cc: string): [number, number, string] {
  return CENTROIDS[cc] || [40, 0, cc || "Unknown"];
}

// Standard international broadcast channels used when a catalog entry has no kHz tag.
const SW_CHANNELS = [3230, 3955, 4765, 4885, 5025, 5840, 5905, 6000, 6065, 6145, 6185, 7255, 7310, 7445, 9400, 9480, 9535, 9635, 9740, 9830, 11760, 11815, 11945, 12005, 13650, 13720, 15140, 15230, 15390, 15610, 17790, 17860, 21525];

interface RawStation {
  stationuuid?: string; name?: string; url?: string; url_resolved?: string; homepage?: string;
  favicon?: string; countrycode?: string; tags?: string; codec?: string; bitrate?: number;
  hls?: number; geo_lat?: number | null; geo_long?: number | null;
}

/* Featured station: https://www.radio-browser.info/history/6a5eb74d-c5d0-4cc6-8b49-6f6a3351ef64 */
export const XANIUS_UUID = "6a5eb74d-c5d0-4cc6-8b49-6f6a3351ef64";
export const XANIUS_FM_KHZ = 101100; // 101.1 MHz on the simulated FM dial
export const XANIUS_HISTORY_URL = `https://www.radio-browser.info/history/${XANIUS_UUID}`;
const XANIUS_RAW: RawStation = {
  stationuuid: XANIUS_UUID,
  name: "Xanius Radio",
  url: "https://xanius-fm.stream.laut.fm/xanius-fm",
  url_resolved: "https://xanius-fm.stream.laut.fm/xanius-fm",
  homepage: "https://xanius.jimdosite.com/",
  favicon: "https://cdn-profiles.tunein.com/s346535/images/logog.jpg?t=2",
  tags: "electro,electro house,electronic,house",
  countrycode: "US",
  codec: "MP3",
  bitrate: 128,
  geo_lat: 40.71216021409067,
  geo_long: -74.00384008226514,
};

function usableUrl(raw: string): string {
  if (!raw) return "";
  if (/\.m3u8|\.m3u(\?|$)|playlist\.m3u8/i.test(raw)) return "";
  return raw.trim();
}

function secureUrl(raw: string): { url: string; alt?: string } {
  const u = usableUrl(raw);
  if (!u) return { url: "" };
  if (u.startsWith("http://")) return { url: u.replace(/^http:\/\//, "https://"), alt: u };
  return { url: u };
}

let swChannelCursor = 0;
function nextSwChannel(seed: number): number {
  const idx = (swChannelCursor * 7 + (seed % 11)) % SW_CHANNELS.length;
  swChannelCursor++;
  return SW_CHANNELS[idx] + ((seed >>> 8) % 9) * 5;
}

function fromRaw(raw: RawStation, band: Band, index: number, source: "live" | "snapshot", forcedFreq?: number): Station | null {
  const original = raw.url_resolved || raw.url || "";
  const { url, alt } = secureUrl(original);
  if (!url || !raw.name) return null;
  const cc = (raw.countrycode || "").toUpperCase();
  const seed = hashString(raw.stationuuid || raw.name + band);
  const tags = raw.tags || "";
  let freq = forcedFreq || 0;
  let freqSource: Station["freqSource"] = forcedFreq ? "schedule" : "assigned";
  if (!freq && band === "SW") {
    // Some catalog entries publish their real HF frequencies in their tags.
    const found = [...tags.matchAll(/(\d{3,5})\s*khz/gi)].map((m) => parseInt(m[1], 10)).filter((f) => f >= 2300 && f <= 26100);
    if (found.length) { freq = found[seed % found.length]; freqSource = "tag"; }
  }
  if (!freq) {
    if (band === "FM") freq = 87600 + ((seed >>> 3) % 101) * 200;
    else if (band === "AM") freq = 530 + ((seed >>> 5) % 117) * 10;
    else freq = nextSwChannel(seed);
  }
  const coords = centroid(cc);
  return {
    id: raw.stationuuid || `${source}-${band}-${index}-${seed}`,
    name: raw.name.trim().slice(0, 60),
    streamUrl: url,
    altUrl: alt,
    homepage: raw.homepage,
    favicon: raw.favicon && raw.favicon.startsWith("https") ? raw.favicon : undefined,
    countryCode: cc,
    tags,
    codec: raw.codec,
    bitrate: raw.bitrate,
    freqKhz: freq,
    band,
    lat: typeof raw.geo_lat === "number" && isFinite(raw.geo_lat) ? raw.geo_lat : coords[0],
    lon: typeof raw.geo_long === "number" && isFinite(raw.geo_long) ? raw.geo_long : coords[1],
    power: 0.55 + ((seed >>> 11) % 46) / 100,
    source,
    freqSource,
    meterBand: band === "SW" ? meterBandOf(freq) : undefined,
  };
}

// Curated snapshot of catalog entries known to be shortwave / international
// broadcasters. Frequencies are representative published HF channels.
const SW_SNAPSHOT: [string, string, string, number][] = [
  ["BBC World Service", "https://stream.live.vc.bbcmedia.co.uk/bbc_world_service", "GB", 9400],
  ["Radio Exterior de España", "https://dispatcher.rndfnk.com/crtve/rneree/main/mp3/high", "ES", 15390],
  ["Radio Prague International", "https://rozhlas.stream/cro7_mp3_128.mp3", "CZ", 9930],
  ["Radio Slovakia International", "https://icecast.stv.livebox.sk/rsi_128.mp3", "SK", 5915],
  ["Radio Vaticana English", "https://radio.vaticannews.va/stream-en", "VA", 9645],
  ["WRN Europe", "https://shoutcast.wrn.org:8026/", "GB", 11865],
  ["RFI Afrique", "https://live02.rfi.fr/rfiafrique-64.mp3", "FR", 13650],
  ["Radio Pakistan World Service", "https://whmsonic.radio.gov.pk:7005/stream", "PK", 11580],
  ["Radio France Info (DX relay)", "https://icecast.radiofrance.fr/franceinfo-hifi.aac", "FR", 7285],
  ["WWCR Shortwave · Nashville", "https://wwcr.gsradio.net:3763/;.mp3", "US", 7490],
  ["WINB Shortwave · Red Lion", "https://winb.mntts.com:82/broadwave.mp3", "US", 9265],
  ["WRMI Radio Miami International", "https://wrmi.listen.creek.fm/stream", "US", 9955],
  ["WBCQ The Planet", "https://splatterbox.us/wbcq1", "US", 5130],
  ["Radio Habana Cuba", "https://theonestopradio.com/stream?url=https://icecast.teveo.cu/McW3fLhs", "CU", 11760],
  ["Radio Rebelde 1180 AM", "https://securestreams7.autopo.st/?uri=https://icecast.teveo.cu/kHKL7tWd", "CU", 5025],
  ["Holy Quran Radio Cairo", "https://radio.xecod.com/station/quran-cairo", "EG", 12005],
  ["Radio România Cultural", "https://stream2.srr.ro:8012/", "RO", 9740],
];

const FM_SNAPSHOT: [string, string, string][] = [
  ["Radio Paradise Main Mix", "https://stream-uk1.radioparadise.com/aac-320", "US"],
  ["SomaFM Groove Salad", "https://ice5.somafm.com/groovesalad-128-mp3", "US"],
  ["France Info", "https://icecast.radiofrance.fr/franceinfo-hifi.aac", "FR"],
  ["France Culture", "https://icecast.radiofrance.fr/franceculture-hifi.aac", "FR"],
  ["MANGORADIO", "https://mangoradio.stream.laut.fm/mangoradio", "DE"],
  ["Classic Vinyl HD", "https://icecast.walmradio.com:8443/classic", "US"],
  ["101 SMOOTH JAZZ", "https://jking.cdnstream1.com/b22139_128mp3", "US"],
  ["RFE/RL Radio Farda", "https://rfe21.akacast.akamaistream.net/7/751/437779/v1/ibb.akacast.akamaistream.net/rfe21", "CZ"],
  ["Your Classical · Relax", "https://relax.stream.publicradio.org/relax.mp3", "US"],
  ["Dance Wave! MP3", "https://dancewave.online/dance.mp3", "DE"],
  ["WALM 2 HD", "https://icecast.walmradio.com:8443/walm2", "US"],
  ["Ambient Sleeping Pill", "https://radio.stereoscenic.com/asp-h", "US"],
];

const AM_SNAPSHOT: [string, string, string][] = [
  ["WALM · Old Time Radio", "https://icecast.walmradio.com:8443/otr_opus", "US"],
  ["Radio Liban Libre", "https://edge.mixlr.com/channel/qtqeb", "LB"],
  ["El Fonógrafo · XEJP AM", "https://27063.live.streamtheworld.com:443/XEJP_AM_SC", "MX"],
  ["Caracol Radio · 810 AM", "https://playerservices.streamtheworld.com/api/livestream-redirect/CARACOL_RADIOAAC.aac", "CO"],
  ["Radio Rebelde · 1180 AM", "https://securestreams7.autopo.st/?uri=https://icecast.teveo.cu/kHKL7tWd", "CU"],
  ["SomaFM Secret Agent", "https://ice6.somafm.com/secretagent-128-mp3", "US"],
  ["Radio România Actualități", "https://89.238.227.6:8006/;", "RO"],
  ["REYFM #gaming", "https://listen.reyfm.de/gaming_192kbps.mp3", "DE"],
  ["FM 100 Pakistan", "https://162.244.80.118:4900/;stream.mp3", "PK"],
  ["0 N Chillout", "https://0n-chillout.radionetz.de/0n-chillout.aac", "DE"],
];

export function snapshotCatalog(): Station[] {
  swChannelCursor = 0;
  const out: Station[] = [];
  // Always available, even when the catalogue API is unreachable.
  const xanius = fromRaw(XANIUS_RAW, "FM", 0, "snapshot", XANIUS_FM_KHZ);
  if (xanius) {
    xanius.freqSource = "assigned";
    xanius.power = 1;
    out.push(xanius);
  }
  SW_SNAPSHOT.forEach(([name, url, cc, freq], i) => {
    const s = fromRaw({ stationuuid: `snap-sw-${i}`, name, url_resolved: url, countrycode: cc, tags: `${freq} khz,shortwave,international` }, "SW", i, "snapshot", freq);
    if (s) { s.freqSource = "schedule"; out.push(s); }
  });
  FM_SNAPSHOT.forEach(([name, url, cc], i) => {
    const s = fromRaw({ stationuuid: `snap-fm-${i}`, name, url_resolved: url, countrycode: cc, tags: "fm" }, "FM", i, "snapshot", i === 0 ? 94300 : undefined);
    if (s) { if (i === 0) s.freqSource = "assigned"; out.push(s); }
  });
  AM_SNAPSHOT.forEach(([name, url, cc], i) => {
    const s = fromRaw({ stationuuid: `snap-am-${i}`, name, url_resolved: url, countrycode: cc, tags: "am,medium wave" }, "AM", i, "snapshot", i === 0 ? 880 : undefined);
    if (s) { if (i === 0) s.freqSource = "assigned"; out.push(s); }
  });
  return out;
}

const HOSTS = ["https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info", "https://all.api.radio-browser.info"];

/** Try each mirror until one answers — individual community servers come and go. */
async function getJson(path: string, timeout = 4000): Promise<RawStation[]> {
  const start = Math.floor(Math.random() * HOSTS.length);
  for (let i = 0; i < HOSTS.length; i++) {
    const host = HOSTS[(start + i) % HOSTS.length];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`${host}/json/${path}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (Array.isArray(data)) return data;
    } catch { /* try next mirror */ }
    finally { clearTimeout(timer); }
  }
  throw new Error("No radio-browser.info mirror responded");
}

export interface CatalogResult { stations: Station[]; liveCount: number; online: boolean; message: string }

export async function loadCatalog(): Promise<CatalogResult> {
  const snapshot = snapshotCatalog();
  const swQueries = ["shortwave", "world service", "radio miami international", "WWCR", "radio prague international"];
  const requests: Promise<RawStation[]>[] = [
    getJson(`stations/byuuid/${XANIUS_UUID}`),
    getJson("stations/search?tag=shortwave&hidebroken=true&limit=60&order=votes&reverse=true"),
    getJson("stations/topvote?limit=45&hidebroken=true"),
    getJson("stations/search?tag=am&hidebroken=true&limit=24&order=votes&reverse=true"),
    ...swQueries.map((q) => getJson(`stations/search?name=${encodeURIComponent(q)}&hidebroken=true&limit=12&order=votes&reverse=true`)),
  ];
  const results = await Promise.allSettled(requests);
  const ok = results.filter((r): r is PromiseFulfilledResult<RawStation[]> => r.status === "fulfilled" && r.value.length > 0);
  if (!ok.length) {
    return { stations: snapshot, liveCount: 0, online: false, message: "Offline snapshot — radio-browser.info unreachable" };
  }
  const [xaniusLive, tagSw, topVote, amTag, ...swByName] = results.map((r) => (r.status === "fulfilled" ? r.value : [] as RawStation[]));
  swChannelCursor = 0;
  const stations = [...snapshot];
  const seen = new Set(stations.map((s) => s.name.toLowerCase().slice(0, 18)));
  const add = (raw: RawStation, band: Band, i: number, forced?: number) => {
    const key = (raw.name || "").toLowerCase().slice(0, 18);
    if (!key || seen.has(key)) return;
    const s = fromRaw(raw, band, i, "live", forced);
    if (!s || s.streamUrl.includes(".m3u8")) return;
    seen.add(key);
    stations.push(s);
  };
  const swCandidates = [...(tagSw || []), ...swByName.flat()];
  swCandidates.forEach((r, i) => {
    const isSw = /shortwave|world service|international|wwcr|wrmi|winb|wbcq|habana|rebelde|radio prague|vatican|rfi|rsi/i.test(`${r.name} ${r.tags}`);
    if (isSw) add(r, "SW", i);
  });
  (topVote || []).slice(0, 26).forEach((r, i) => add(r, "FM", i));
  (amTag || []).slice(0, 16).forEach((r, i) => add(r, "AM", i));

  // 101.1 FM is reserved for Xanius Radio — move any channel collision away.
  const occupiedFm = new Set(stations.filter((s) => s.band === "FM" && s.id !== XANIUS_UUID).map((s) => s.freqKhz));
  occupiedFm.add(XANIUS_FM_KHZ);
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    if (s.band !== "FM" || s.id === XANIUS_UUID || s.freqKhz !== XANIUS_FM_KHZ) continue;
    let f = XANIUS_FM_KHZ + 200;
    while (occupiedFm.has(f) && f <= BANDS.FM.max) f += 200;
    stations[i] = { ...s, freqKhz: f <= BANDS.FM.max ? f : XANIUS_FM_KHZ - 200 };
    occupiedFm.add(stations[i].freqKhz);
  }

  // Keep the featured station pinned to 101.1 FM, but refresh its metadata from
  // the live radio-browser.info record (drop the temporary t302 redirect token).
  const xaniusRaw = (xaniusLive || [])[0];
  let xaniusLinked = false;
  if (xaniusRaw) {
    const idx = stations.findIndex((s) => s.id === XANIUS_UUID);
    const liveStream = (xaniusRaw.url_resolved || xaniusRaw.url || "").split("?")[0];
    const { url, alt } = secureUrl(liveStream);
    if (idx >= 0) {
      const prev = stations[idx];
      stations[idx] = {
        ...prev,
        name: xaniusRaw.name || prev.name,
        streamUrl: url || prev.streamUrl,
        altUrl: alt,
        homepage: xaniusRaw.homepage || prev.homepage,
        favicon: xaniusRaw.favicon?.startsWith("https") ? xaniusRaw.favicon : prev.favicon,
        tags: xaniusRaw.tags || prev.tags,
        codec: xaniusRaw.codec || prev.codec,
        bitrate: xaniusRaw.bitrate ?? prev.bitrate,
        countryCode: (xaniusRaw.countrycode || prev.countryCode).toUpperCase(),
        lat: typeof xaniusRaw.geo_lat === "number" ? xaniusRaw.geo_lat : prev.lat,
        lon: typeof xaniusRaw.geo_long === "number" ? xaniusRaw.geo_long : prev.lon,
        source: "live",
        freqKhz: XANIUS_FM_KHZ,
        power: 1,
      };
      xaniusLinked = true;
    }
  }
  const liveCount = stations.length - snapshot.length;
  return {
    stations,
    liveCount,
    online: liveCount > 0 || xaniusLinked,
    message: `${liveCount > 0 ? `${liveCount} live stations · ` : ""}${stations.filter((s) => s.band === "SW").length} HF channels${xaniusLinked ? " · Xanius Radio linked" : ""}`,
  };
}

export function countryName(code: string): string {
  if (!code) return "Unknown";
  const known = centroid(code)[2];
  if (known !== code) return known;
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch { return code; }
}
