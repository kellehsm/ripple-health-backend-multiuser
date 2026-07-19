export type ZoneName = 'very_light' | 'light' | 'moderate' | 'hard' | 'maximum';

export interface Zone {
  name: ZoneName;
  label: string;
  minPct: number;
  maxPct: number;
  color: string;
}

export const ZONES: Zone[] = [
  { name: 'very_light', label: 'Very light', minPct: 0,  maxPct: 50,  color: '#9FE1CB' },
  { name: 'light',      label: 'Light',      minPct: 50, maxPct: 60,  color: '#5DCAA5' },
  { name: 'moderate',   label: 'Moderate',   minPct: 60, maxPct: 70,  color: '#1D9E75' },
  { name: 'hard',       label: 'Hard',       minPct: 70, maxPct: 85,  color: '#F0997B' },
  { name: 'maximum',    label: 'Maximum',    minPct: 85, maxPct: 999, color: '#D85A30' },
];

export function estimateMaxHR(age: number): number {
  return Math.round(208 - 0.7 * age);
}

export function zoneForBpm(bpm: number, maxHR: number): Zone {
  const pct = (bpm / maxHR) * 100;
  return ZONES.find((z) => pct >= z.minPct && pct < z.maxPct) ?? ZONES[ZONES.length - 1];
}

export function emptyZoneMap(): Record<ZoneName, number> {
  return { very_light: 0, light: 0, moderate: 0, hard: 0, maximum: 0 };
}

export interface SessionHRSummary {
  avg_bpm: number | null;
  peak_bpm: number | null;
  time_in_zone_seconds: Record<ZoneName, number>;
  sample_count: number;
}

export async function computeSessionHRSummary(
  userId: string,
  session: { started_at: string | Date; ended_at: string | Date },
  userAge: number | null,
  queryFn: (text: string, params: any[]) => Promise<any[]>
): Promise<SessionHRSummary> {
  const samples = await queryFn(
    `SELECT bpm, recorded_at FROM heart_rate_readings
     WHERE user_id = $1 AND recorded_at BETWEEN $2 AND $3
     ORDER BY recorded_at ASC`,
    [userId, session.started_at, session.ended_at]
  );

  if (samples.length === 0 || !userAge) {
    const bpms = samples.map((s: any) => s.bpm);
    return {
      avg_bpm: bpms.length > 0 ? Math.round(bpms.reduce((a: number, b: number) => a + b, 0) / bpms.length) : null,
      peak_bpm: bpms.length > 0 ? Math.max(...bpms) : null,
      time_in_zone_seconds: emptyZoneMap(),
      sample_count: samples.length,
    };
  }

  const maxHR = estimateMaxHR(userAge);
  const timeInZone = emptyZoneMap();
  const endTime = new Date(session.ended_at).getTime();
  let sum = 0;
  let peak = 0;

  for (let i = 0; i < samples.length; i++) {
    const { bpm, recorded_at } = samples[i];
    sum += bpm;
    peak = Math.max(peak, bpm);

    const nextTs = i + 1 < samples.length
      ? new Date(samples[i + 1].recorded_at).getTime()
      : endTime;
    const gapSeconds = (nextTs - new Date(recorded_at).getTime()) / 1000;
    const zone = zoneForBpm(bpm, maxHR);
    timeInZone[zone.name] += Math.max(0, gapSeconds);
  }

  return {
    avg_bpm: Math.round(sum / samples.length),
    peak_bpm: peak,
    time_in_zone_seconds: timeInZone,
    sample_count: samples.length,
  };
}
