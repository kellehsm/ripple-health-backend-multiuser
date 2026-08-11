import { StyleSheet } from 'react-native';

// ─── Sub-tab type ────────────────────────────────────────────────────────────

export type SubTab = 'medication' | 'cycle' | 'symptoms';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface MedSlot {
  id: string;
  time_of_day: string;
  specific_time: string | null;
  sort_order: number;
  dose_log: { id: string; status: string; taken_at: string } | null;
}

export interface ColorCategory {
  id: string;
  label: string;
  color_hex: string;
}

export interface MedPrescriber {
  id: string;
  name: string;
}

export interface Medication {
  id: string;
  name: string;
  brand_name?: string | null;
  generic_name?: string | null;
  dosage: string | null;
  active: boolean;
  notes: string | null;
  purpose: string | null;
  refill_date: string | null;
  created_at: string;
  prescriber: MedPrescriber | null;
  color_category: ColorCategory | null;
  slots: MedSlot[];
  frequency?: "daily" | "weekly";
  day_of_week?: number | null;
  is_prn?: boolean;
}

export type MedStatus = 'active' | 'new' | 'expiring' | 'refill_needed';

export interface CycleLog {
  id: string;
  log_date: string;
  flow_intensity: string | null;
  symptoms: string[] | null;
  mood_label: string | null;
  notes: string | null;
  energy_level?: number | null;
}

export interface Prediction {
  predictedNextStart: string | null;
  avgCycleLength: number | null;
  avgPeriodLength?: number | null;
  cycleLengthsUsed: number;
  confidence: string;
  lastPeriodStart?: string;
  currentCycleDay?: number;
  predictedPeriodEnd?: string | null;
  ovulationDay?: string | null;
  fertileWindowStart?: string | null;
  fertileWindowEnd?: string | null;
  cycleLengths?: number[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function computeMedStatus(med: Medication): MedStatus {
  const daysSinceAdded = (Date.now() - new Date(med.created_at).getTime()) / 86400000;
  if (daysSinceAdded < 7) return 'new';
  if (med.refill_date) {
    const daysUntil = (new Date(med.refill_date).getTime() - Date.now()) / 86400000;
    if (daysUntil <= 0) return 'refill_needed';
    if (daysUntil <= 7) return 'expiring';
  }
  return 'active';
}

// Status badges pull colors from the theme so they follow dark mode and
// palette switches instead of hard-coded hex.
export function statusBadge(status: MedStatus, theme: any): { label: string; bg: string; fg: string } {
  switch (status) {
    case 'new':           return { label: 'New',           bg: theme.green.bg, fg: theme.green.sub };
    case 'expiring':      return { label: 'Refill soon',   bg: theme.amber.bg, fg: theme.amber.sub };
    case 'refill_needed': return { label: 'Refill needed', bg: theme.red.bg,   fg: theme.red.sub };
    case 'active':
    default:              return { label: 'Active',        bg: 'transparent',  fg: 'transparent' };
  }
}

export const TOD_HOUR: Record<string, number> = { morning: 8, midday: 12, evening: 20 };

export function nextDoseCallout(medications: Medication[]): string | null {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let earliest: { name: string; mins: number } | null = null;

  for (const med of medications) {
    for (const slot of med.slots) {
      if (slot.dose_log !== null) continue;
      let slotMins: number;
      if (slot.specific_time && slot.time_of_day === 'custom') {
        const [hh, mm] = slot.specific_time.split(':').map(Number);
        slotMins = (hh || 0) * 60 + (mm || 0);
      } else {
        slotMins = (TOD_HOUR[slot.time_of_day] ?? 8) * 60;
      }
      if (slotMins >= nowMins && (!earliest || slotMins < earliest.mins)) {
        earliest = { name: med.name, mins: slotMins };
      }
    }
  }

  if (!earliest) return null;
  const diffMins = earliest.mins - nowMins;
  if (diffMins < 60) return `${earliest.name} in ${diffMins} min`;
  const h = Math.floor(diffMins / 60);
  const m = diffMins % 60;
  return m > 0 ? `${earliest.name} in ${h}h ${m}m` : `${earliest.name} in ${h}h`;
}

export function getPhaseLabel(cycleDay: number): string {
  if (cycleDay <= 5) return 'Menstrual';
  if (cycleDay <= 11) return 'Follicular';
  if (cycleDay <= 16) return 'Ovulatory';
  return 'Luteal';
}

// Descriptive, never diagnostic — general phase info, not medical guidance.
export const PHASE_GUIDE: Record<string, { icon: string; days: string; body: string }> = {
  Menstrual: {
    icon: '🌙',
    days: 'Days 1–5',
    body: 'The period phase. Many people notice lower energy and prefer rest, warmth, and gentler routines during these days.',
  },
  Follicular: {
    icon: '🌱',
    days: 'Days 6–11',
    body: 'The stretch after the period ends. Energy often trends upward through this phase, and many people find it a good window for starting things.',
  },
  Ovulatory: {
    icon: '☀️',
    days: 'Days 12–16',
    body: 'The mid-cycle stretch around ovulation. Energy and mood are often at their highest point of the cycle here.',
  },
  Luteal: {
    icon: '🍂',
    days: 'Day 17+',
    body: 'The stretch before the next period. Some people notice PMS-type symptoms, cravings, or dips in energy as this phase progresses.',
  },
};

// ─── Shared modal styles ─────────────────────────────────────────────────────

export const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 2,
    borderBottomWidth: 0,
    padding: 20,
    maxHeight: '90%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', flex: 1, marginRight: 12 },
  input: {
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  timeChip: {
    borderWidth: 2,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  saveBtn: {
    borderWidth: 2,
    borderRadius: 22,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  suggestions: {
    borderWidth: 2,
    borderTopWidth: 0,
    borderRadius: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    zIndex: 10,
  },
  suggRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1 },
});
