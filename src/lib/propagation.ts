/* A compact, physically-motivated HF propagation model.
   D-layer absorption -> LUF, F-layer ionisation -> MUF, daylight along the
   great-circle path -> path loss, terminator crossing -> greyline enhancement. */
import { hashString, METER_BANDS, type Band, type Station } from "./catalog";

export interface GeoPoint { name: string; lat: number; lon: number; region: string }

export const LOCATIONS: GeoPoint[] = [
  { name: "New York", lat: 40.71, lon: -74.01, region: "North America" },
  { name: "Los Angeles", lat: 34.05, lon: -118.24, region: "North America" },
  { name: "Mexico City", lat: 19.43, lon: -99.13, region: "North America" },
  { name: "Toronto", lat: 43.65, lon: -79.38, region: "North America" },
  { name: "São Paulo", lat: -23.55, lon: -46.63, region: "South America" },
  { name: "Buenos Aires", lat: -34.6, lon: -58.38, region: "South America" },
  { name: "London", lat: 51.51, lon: -0.13, region: "Europe" },
  { name: "Berlin", lat: 52.52, lon: 13.4, region: "Europe" },
  { name: "Madrid", lat: 40.42, lon: -3.7, region: "Europe" },
  { name: "Helsinki", lat: 60.17, lon: 24.94, region: "Europe" },
  { name: "Cairo", lat: 30.04, lon: 31.24, region: "Africa / Mideast" },
  { name: "Lagos", lat: 6.52, lon: 3.38, region: "Africa" },
  { name: "Nairobi", lat: -1.29, lon: 36.82, region: "Africa" },
  { name: "Cape Town", lat: -33.92, lon: 18.42, region: "Africa" },
  { name: "Dubai", lat: 25.2, lon: 55.27, region: "Middle East" },
  { name: "Mumbai", lat: 19.08, lon: 72.88, region: "South Asia" },
  { name: "Delhi", lat: 28.61, lon: 77.21, region: "South Asia" },
  { name: "Singapore", lat: 1.35, lon: 103.82, region: "SE Asia" },
  { name: "Bangkok", lat: 13.76, lon: 100.5, region: "SE Asia" },
  { name: "Tokyo", lat: 35.68, lon: 139.69, region: "East Asia" },
  { name: "Beijing", lat: 39.9, lon: 116.4, region: "East Asia" },
  { name: "Seoul", lat: 37.57, lon: 126.98, region: "East Asia" },
  { name: "Sydney", lat: -33.87, lon: 151.21, region: "Oceania" },
  { name: "Auckland", lat: -36.85, lon: 174.76, region: "Oceania" },
  { name: "Reykjavík", lat: 64.15, lon: -21.94, region: "Polar" },
];

const TZ_GUESS: Record<string, string> = {
  "America/New_York": "New York", "America/Chicago": "New York", "America/Denver": "Los Angeles",
  "America/Los_Angeles": "Los Angeles", "America/Toronto": "Toronto", "America/Mexico_City": "Mexico City",
  "America/Sao_Paulo": "São Paulo", "America/Argentina/Buenos_Aires": "Buenos Aires",
  "Europe/London": "London", "Europe/Berlin": "Berlin", "Europe/Paris": "Madrid", "Europe/Madrid": "Madrid",
  "Europe/Helsinki": "Helsinki", "Europe/Moscow": "Helsinki", "Africa/Cairo": "Cairo",
  "Africa/Lagos": "Lagos", "Africa/Nairobi": "Nairobi", "Africa/Johannesburg": "Cape Town",
  "Asia/Dubai": "Dubai", "Asia/Kolkata": "Mumbai", "Asia/Calcutta": "Mumbai",
  "Asia/Singapore": "Singapore", "Asia/Bangkok": "Bangkok", "Asia/Tokyo": "Tokyo",
  "Asia/Shanghai": "Beijing", "Asia/Seoul": "Seoul", "Australia/Sydney": "Sydney",
  "Pacific/Auckland": "Auckland", "Atlantic/Reykjavik": "Reykjavík",
};

export function guessLocation(): GeoPoint {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const name = TZ_GUESS[tz];
    if (name) return LOCATIONS.find((l) => l.name === name)!;
  } catch { /* ignore */ }
  return LOCATIONS[6];
}

const RAD = Math.PI / 180;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}

/** NOAA-style approximate solar elevation in degrees. */
export function solarElevation(lat: number, lon: number, date: Date): number {
  const doy = dayOfYear(date);
  const gamma = (2 * Math.PI / 365) * (doy - 1 + (date.getUTCHours() - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + 4 * lon + eqTime;
  const ha = (minutes / 4 - 180) * RAD;
  const sinAlt = Math.sin(lat * RAD) * Math.sin(decl) + Math.cos(lat * RAD) * Math.cos(decl) * Math.cos(ha);
  return Math.asin(clamp(sinAlt, -1, 1)) / RAD;
}

export function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * RAD, dLon = (bLon - aLon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function greatCirclePoint(aLat: number, aLon: number, bLat: number, bLon: number, f: number): [number, number] {
  const φ1 = aLat * RAD, λ1 = aLon * RAD, φ2 = bLat * RAD, λ2 = bLon * RAD;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d < 1e-6) return [aLat, aLon];
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return [Math.atan2(z, Math.sqrt(x * x + y * y)) / RAD, Math.atan2(y, x) / RAD];
}

export interface Conditions {
  date: Date;
  elevation: number;
  dayFactor: number;
  phase: "Daylight" | "Night" | "Greyline";
  muf: number; // MHz
  luf: number; // MHz
  solarFlux: number;
  localHour: number;
  noise: number;
  season: string;
}

export function makeConditions(loc: GeoPoint, manualHour: number | null, now: Date, solarFlux: number): Conditions {
  const date = new Date(now.getTime());
  if (manualHour === null) {
    // Live: real UTC instant at the listener's longitude.
  } else {
    const utcHour = manualHour - loc.lon / 15;
    const dayOffset = Math.floor(utcHour / 24);
    const h = ((utcHour % 24) + 24) % 24;
    date.setUTCDate(date.getUTCDate() + dayOffset);
    date.setUTCHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
  }
  const elevation = solarElevation(loc.lat, loc.lon, date);
  const dayFactor = smooth(-8, 16, elevation);
  const fluxFactor = 0.72 + (solarFlux - 70) / 180; // 70..250 SFU
  // Night-time F-layer still supports the 49m/41m bands and sometimes 31m;
  // daytime ionisation raises the MUF into the 16m/13m broadcast bands.
  const muf = clamp(8.2 + 15.5 * dayFactor * fluxFactor + 1.5 * Math.cos(loc.lat * RAD), 5.5, 30);
  const dLayer = smooth(-6, 35, elevation);
  const luf = 2.1 + 5.4 * dLayer + 0.8 * (1 - fluxFactor);
  const localHour = manualHour === null
    ? ((now.getUTCHours() + now.getUTCMinutes() / 60 + loc.lon / 15) % 24 + 24) % 24
    : manualHour;
  const phase = elevation > 7 ? "Daylight" : elevation < -7 ? "Night" : "Greyline";
  const noise = 0.12 + 0.34 * (1 - dayFactor) + 0.12 * (1 - fluxFactor);
  const month = date.getUTCMonth();
  const season = month >= 2 && month <= 4 ? "Spring" : month >= 5 && month <= 7 ? "Summer" : month >= 8 && month <= 10 ? "Autumn" : "Winter";
  return { date, elevation, dayFactor, phase, muf, luf, solarFlux, localHour, noise, season };
}

export function bandOpenness(minKhz: number, maxKhz: number, c: Conditions): number {
  const mid = (minKhz + maxKhz) / 2000;
  const lower = smooth(c.luf - 1.2, c.luf + 1.3, mid);
  const upper = 1 - smooth(c.muf - 2.2, c.muf + 2.5, mid);
  return clamp(lower * upper * (1 - 0.22 * c.noise));
}

export function meterBandStatus() {
  return METER_BANDS.map((m) => ({ ...m }));
}

export interface Reception {
  quality: number; // 0..1 final audible strength including tuning
  propagation: number; // 0..1 received signal before tuning
  tuning: number; // 0..1 dial alignment
  distanceKm: number;
  label: "Clear" | "Good" | "Weak" | "Faint" | "Not received";
  note: string;
  pathDayFraction: number;
  greyline: boolean;
  hops: number;
}

/** Slow ionospheric fading (QSB), deterministic per station and moment. */
function fading(id: string, t: number): number {
  const h = hashString(id);
  const p1 = 7 + (h % 9), p2 = 13 + ((h >>> 7) % 17);
  return 0.86 + 0.11 * Math.sin(t / p1 + (h % 100)) + 0.06 * Math.sin(t / p2 + (h % 60));
}

export function reception(
  station: Station, band: Band, dialKhz: number, loc: GeoPoint, c: Conditions, tSeconds: number
): Reception {
  const delta = Math.abs(dialKhz - station.freqKhz);
  const bw = band === "FM" ? 140 : band === "AM" ? 5.5 : 3.2;
  const tuning = Math.exp(-Math.pow(delta / (bw * 0.78), 2) * 1.5);
  const h = hashString(station.id + band);
  let propagation = 0;
  let distanceKm = 0;
  let note = "";
  let pathDayFraction = 0;
  let greyline = false;
  let hops = 0;

  if (band === "SW") {
    distanceKm = haversine(loc.lat, loc.lon, station.lat, station.lon);
    const fMHz = station.freqKhz / 1000;
    // Ionospheric window: below LUF = D-layer absorption, above MUF = lost to space.
    const lower = smooth(c.luf - 1.1, c.luf + 1.4, fMHz);
    const upper = 1 - smooth(c.muf - 2.0, c.muf + 2.2, fMHz);
    const window = lower * upper;
    // Sample the great-circle path for daylight / terminator effects.
    let dayPts = 0, cross = 0, prev = -99, polar = 0;
    for (let i = 0; i <= 6; i++) {
      const [plat, plon] = greatCirclePoint(loc.lat, loc.lon, station.lat, station.lon, i / 6);
      const el = solarElevation(plat, plon, c.date);
      if (el > 0) dayPts++;
      const lit = el > -3 ? 1 : 0;
      if (prev !== -99 && lit !== prev) cross++;
      prev = lit;
      if (Math.abs(plat) > 62) polar++;
    }
    pathDayFraction = dayPts / 7;
    greyline = cross > 0 && cross <= 2;
    // Short hop ground wave, mid-distance single/double hop, extreme long path loss.
    const hopsF = distanceKm < 400 ? 1 : 0.98 - 0.000045 * distanceKm + 0.16 * Math.exp(-Math.pow((distanceKm - 6000) / 6500, 2));
    hops = Math.max(1, Math.round(distanceKm / 4000));
    const distFactor = clamp(hopsF, 0.35, 1);
    const aurora = 1 - 0.28 * (polar / 7) * (1 - Math.min(1, c.solarFlux / 200));
    const dxBonus = greyline ? 1.28 : 1;
    const nightPathBoost = 1 + 0.08 * (1 - pathDayFraction) * (fMHz < 10 ? 1 : 0);
    const atmospheric = 1 - c.noise * (fMHz < 8 ? 0.72 : 0.36);
    propagation = clamp(window * distFactor * aurora * dxBonus * nightPathBoost * atmospheric * station.power * fading(station.id, tSeconds), 0, 1);
    note = fMHz < c.luf ? "D-layer absorption" : fMHz > c.muf ? "Above MUF — into space" :
      greyline ? "Greyline enhancement" : pathDayFraction > 0.8 ? "Sunlit path" : "Darkness path";
  } else if (band === "FM") {
    // Local VHF relay: line-of-sight coverage around the listener.
    distanceKm = 8 + (h % 105);
    propagation = clamp((1 - Math.pow(distanceKm / 165, 1.7)) * station.power * 1.25 * fading(station.id, tSeconds / 3), 0, 1);
    note = "Line-of-sight VHF";
  } else {
    // AM ground wave by day, skywave DX after dark.
    const localKm = 25 + ((h >>> 4) % 330);
    const dxKm = haversine(loc.lat, loc.lon, station.lat, station.lon);
    distanceKm = Math.round(localKm + dxKm * 0.12);
    const ground = clamp(1 - Math.pow(localKm / 460, 1.5), 0, 1);
    const sky = (1 - c.dayFactor) * clamp(1 - Math.pow(dxKm / 9500, 1.2), 0, 1) * smooth(0, 1200, dxKm);
    propagation = clamp((ground * 0.82 + sky * 0.72 + 0.12) * station.power * 1.2 * fading(station.id, tSeconds / 2), 0, 1);
    note = c.dayFactor > 0.5 ? "Ground wave" : "Night-time skywave DX";
  }
  const quality = clamp(propagation * tuning, 0, 1);
  const label = quality > 0.72 ? "Clear" : quality > 0.48 ? "Good" : quality > 0.26 ? "Weak" : quality > 0.1 ? "Faint" : "Not received";
  return { quality, propagation, tuning, distanceKm, label, note, pathDayFraction, greyline, hops };
}

export function qualityColor(q: number): string {
  if (q > 0.72) return "#7ee7a2";
  if (q > 0.48) return "#d8df70";
  if (q > 0.26) return "#f2ad5c";
  if (q > 0.1) return "#e9775b";
  return "#6b6d70";
}
