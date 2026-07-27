import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../api/client';

// ── Wizard answer types ────────────────────────────────────────────────────────

export interface WizardAnswers {
  goal: string;
  experience: string;
  equipment: string[];
  location: string;
  preferred_minutes: number;
  days_per_week: number;
  muscle_focus: string[];
  limitations: string[];
}

interface GeneratedExercise {
  exercise_id: string;
  name: string;
  category: string;
  equipment: string | null;
  primary_muscles: string[];
  sets: number;
  rep_range_min: number;
  rep_range_max: number;
}

interface GeneratedDay {
  day_number: number;
  focus: string;
  exercises: GeneratedExercise[];
}

// ── Option lists (UI labels → DB values) ──────────────────────────────────────

const GOALS = [
  { value: 'strength',        label: 'Build Strength',      desc: 'Lift heavier, get stronger' },
  { value: 'muscle_gain',     label: 'Build Muscle',        desc: 'Increase size and definition' },
  { value: 'fat_loss',        label: 'Lose Fat',            desc: 'Burn calories, get lean' },
  { value: 'endurance',       label: 'Build Endurance',     desc: 'Improve stamina and cardio' },
  { value: 'general_fitness', label: 'General Fitness',     desc: 'Feel better, move well' },
];

const EXPERIENCE = [
  { value: 'beginner',     label: 'Beginner',     desc: 'New to structured training' },
  { value: 'intermediate', label: 'Intermediate', desc: '1–3 years of consistent training' },
  { value: 'advanced',     label: 'Advanced',     desc: '3+ years, training is a habit' },
];

const EQUIPMENT_OPTIONS = [
  { value: 'barbell',       label: 'Barbell' },
  { value: 'dumbbell',      label: 'Dumbbells' },
  { value: 'cable',         label: 'Cable / Pulleys' },
  { value: 'machine',       label: 'Weight Machines' },
  { value: 'kettlebells',   label: 'Kettlebells' },
  { value: 'bands',         label: 'Resistance Bands' },
  { value: 'body only',     label: 'Bodyweight Only' },
  { value: 'e-z curl bar',  label: 'EZ Curl Bar' },
  { value: 'exercise ball', label: 'Exercise Ball' },
];

const LOCATIONS = [
  { value: 'gym',     label: 'Gym',          desc: 'Full equipment access' },
  { value: 'home',    label: 'Home',         desc: 'Limited or no equipment' },
  { value: 'outdoor', label: 'Outdoor',      desc: 'Parks, tracks, bodyweight' },
  { value: 'any',     label: 'Flexible',     desc: 'Mix of locations' },
];

const DURATIONS = [
  { value: 20,  label: '20 min',  desc: 'Quick session' },
  { value: 30,  label: '30 min',  desc: 'Efficient' },
  { value: 45,  label: '45 min',  desc: 'Standard' },
  { value: 60,  label: '60 min',  desc: 'Full workout' },
  { value: 90,  label: '90 min',  desc: 'Long session' },
];

const DAYS_OPTIONS = [2, 3, 4, 5, 6];

const MUSCLE_OPTIONS = [
  { value: 'chest',       label: 'Chest',     muscles: ['chest'] },
  { value: 'back',        label: 'Back',      muscles: ['lats', 'middle back'] },
  { value: 'shoulders',   label: 'Shoulders', muscles: ['shoulders'] },
  { value: 'arms',        label: 'Arms',      muscles: ['biceps', 'triceps'] },
  { value: 'core',        label: 'Core',      muscles: ['abdominals'] },
  { value: 'legs',        label: 'Legs',      muscles: ['quadriceps', 'hamstrings'] },
  { value: 'glutes',      label: 'Glutes',    muscles: ['glutes'] },
];

const LIMITATION_OPTIONS = [
  { value: 'knee_pain',       label: 'Knee pain',        exclude: ['plyometrics'] },
  { value: 'lower_back_pain', label: 'Lower back pain',  exclude: [] },
  { value: 'shoulder_pain',   label: 'Shoulder pain',    exclude: [] },
  { value: 'wrist_pain',      label: 'Wrist pain',       exclude: [] },
];

const FOCUS_LABEL: Record<string, string> = {
  push:      'Push (chest · shoulders · triceps)',
  pull:      'Pull (back · biceps)',
  legs:      'Legs (quads · hamstrings · glutes)',
  upper:     'Upper Body',
  lower:     'Lower Body',
  full_body: 'Full Body',
};

const TOTAL_STEPS = 9; // 0–7 = wizard steps, 8 = generate/preview

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepHeader({ step, title, subtitle, theme }: {
  step: number; title: string; subtitle?: string; theme: any;
}) {
  return (
    <View style={{ marginBottom: 20 }}>
      {/* Progress dots */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1, height: 4, borderRadius: 2,
              backgroundColor: i <= step ? theme.teal?.solid ?? theme.ink : theme.cardBorder ?? '#E5E7EB',
            }}
          />
        ))}
      </View>
      <Text style={{ color: theme.textSoft, fontSize: 9, fontWeight: '900', letterSpacing: 0.6, marginBottom: 6 }}>
        STEP {step + 1} OF 8
      </Text>
      <Text style={{ color: theme.textStrong, fontSize: 22, fontWeight: '900', lineHeight: 28 }}>{title}</Text>
      {subtitle && (
        <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 6, lineHeight: 18 }}>{subtitle}</Text>
      )}
    </View>
  );
}

function OptionCard({ label, desc, selected, onPress, theme, ink }: {
  label: string; desc?: string; selected: boolean; onPress: () => void; theme: any; ink: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.optionCard,
        {
          borderColor: selected ? ink : theme.cardBorder ?? '#E5E7EB',
          backgroundColor: selected ? (theme.teal?.tint ?? '#E8F9F4') : theme.card,
          shadowColor: "rgba(60,40,20,0.1)",
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: selected ? (theme.teal?.fg ?? ink) : theme.textStrong, fontWeight: '800', fontSize: 15 }}>
          {label}
        </Text>
        {desc && (
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 3 }}>{desc}</Text>
        )}
      </View>
      <View style={[
        styles.radioOuter,
        { borderColor: selected ? (theme.teal?.solid ?? ink) : theme.cardBorder ?? '#D1D5DB' },
      ]}>
        {selected && (
          <View style={[styles.radioInner, { backgroundColor: theme.teal?.solid ?? ink }]} />
        )}
      </View>
    </Pressable>
  );
}

function ChipButton({ label, selected, onPress, theme, ink }: {
  label: string; selected: boolean; onPress: () => void; theme: any; ink: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? (theme.teal?.solid ?? ink) : theme.card,
          borderColor: selected ? ink : theme.cardBorder ?? '#D1D5DB',
          shadowColor: "rgba(60,40,20,0.1)",
        },
      ]}
    >
      <Text style={{ color: selected ? '#fff' : theme.textStrong, fontWeight: '700', fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function NavRow({ onBack, onNext, nextLabel = 'Next →', nextDisabled = false, theme, ink }: {
  onBack?: () => void; onNext: () => void; nextLabel?: string;
  nextDisabled?: boolean; theme: any; ink: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingTop: 16 }}>
      {onBack && (
        <Pressable
          onPress={onBack}
          style={[styles.backBtn, { borderColor: ink, backgroundColor: theme.card }]}
        >
          <Text style={{ color: ink, fontWeight: '700', fontSize: 14 }}>← Back</Text>
        </Pressable>
      )}
      <Pressable
        onPress={onNext}
        disabled={nextDisabled}
        style={[
          styles.nextBtn,
          { backgroundColor: nextDisabled ? theme.cardBorder : ink, borderColor: ink, flex: 1 },
        ]}
      >
        <Text style={{ color: nextDisabled ? theme.textSoft : (theme.page ?? '#fff'), fontWeight: '800', fontSize: 15 }}>
          {nextLabel}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Main wizard ────────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
}

export function WorkoutSetupWizard({ onComplete }: Props) {
  const { theme } = useTheme();
  const ink = theme.ink;

  const [step, setStep] = useState(0);

  // Wizard answers
  const [goal, setGoal] = useState('');
  const [experience, setExperience] = useState('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [duration, setDuration] = useState(0);
  const [daysPerWeek, setDaysPerWeek] = useState(0);
  const [muscleFocus, setMuscleFocus] = useState<string[]>([]);
  const [limitations, setLimitations] = useState<string[]>([]);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generatedDays, setGeneratedDays] = useState<GeneratedDay[] | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [skipping, setSkipping] = useState(false);

  function toggleSet<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, value: T) {
    setter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
  }

  // Expand muscle UI selections to actual DB muscle names
  function expandedMuscleFocus(): string[] {
    return MUSCLE_OPTIONS
      .filter((o) => muscleFocus.includes(o.value))
      .flatMap((o) => o.muscles);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGeneratedDays(null);
    try {
      const answers: WizardAnswers = {
        goal, experience, equipment, location,
        preferred_minutes: duration,
        days_per_week: daysPerWeek,
        muscle_focus: expandedMuscleFocus(),
        limitations,
      };
      const res = await api.generateWorkoutPlan(answers);
      setGeneratedDays(res.days ?? []);
    } catch {
      Alert.alert('Error', 'Could not generate your plan. Try again.');
      setStep(7); // go back to last wizard step
    } finally {
      setGenerating(false);
    }
  }

  async function handleAccept() {
    if (!generatedDays) return;
    setAccepting(true);
    try {
      const answers: WizardAnswers = {
        goal, experience, equipment, location,
        preferred_minutes: duration,
        days_per_week: daysPerWeek,
        muscle_focus: expandedMuscleFocus(),
        limitations,
      };
      await api.acceptWorkoutPlan({ answers, days: generatedDays });
      onComplete();
    } catch {
      Alert.alert('Error', 'Could not save your plan. Try again.');
    } finally {
      setAccepting(false);
    }
  }

  async function handleSkip() {
    setSkipping(true);
    try {
      await api.skipWorkoutWizard();
      onComplete();
    } catch {
      onComplete(); // fail open — don't block the user
    } finally {
      setSkipping(false);
    }
  }

  function goNext() { setStep((s) => s + 1); }
  function goBack() { setStep((s) => s - 1); }

  // Trigger generation once when step transitions to 8 (not in render body)
  useEffect(() => {
    if (step === 8 && !generating && generatedDays === null) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Step 8: Generate + Preview ─────────────────────────────────────────────

  if (step === 8) {
    if (generating) {
      return (
        <View style={[styles.centered, { backgroundColor: theme.page }]}>
          <ActivityIndicator size="large" color={theme.teal?.solid ?? ink} />
          <Text style={{ color: theme.textSoft, marginTop: 16, fontSize: 15 }}>
            Building your plan…
          </Text>
        </View>
      );
    }

    if (!generatedDays) {
      return (
        <View style={[styles.centered, { backgroundColor: theme.page }]}>
          <ActivityIndicator size="large" color={theme.teal?.solid ?? ink} />
        </View>
      );
    }

    return (
      <ScrollView
        style={{ backgroundColor: theme.page }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        <Text style={{ color: theme.textStrong, fontSize: 22, fontWeight: '900', letterSpacing: -0.8, marginBottom: 4 }}>
          Your starter plan
        </Text>
        <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 20, lineHeight: 18 }}>
          {daysPerWeek} day{daysPerWeek !== 1 ? 's' : ''}/week · {duration} min per session
        </Text>

        {generatedDays.map((day) => (
          <View
            key={day.day_number}
            style={[styles.dayCard, { backgroundColor: theme.card, borderColor: ink, shadowColor: "rgba(60,40,20,0.1)" }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <View style={[styles.dayBadge, { backgroundColor: theme.teal?.solid ?? ink }]}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>D{day.day_number}</Text>
              </View>
              <Text style={{ color: theme.textStrong, fontWeight: '800', fontSize: 15 }}>
                {FOCUS_LABEL[day.focus] ?? day.focus}
              </Text>
            </View>
            {day.exercises.map((ex, i) => (
              <View key={ex.exercise_id} style={[
                styles.exerciseRow,
                { borderTopColor: theme.cardBorder ?? '#E5E7EB', borderTopWidth: i === 0 ? 0 : 1 },
              ]}>
                <Text style={{ color: theme.textStrong, fontWeight: '700', fontSize: 13, flex: 1 }}>
                  {ex.name}
                </Text>
                <Text style={{ color: theme.teal?.fg ?? ink, fontSize: 12, fontWeight: '600' }}>
                  {ex.sets} × {ex.rep_range_min}–{ex.rep_range_max}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {/* Action buttons */}
        <View style={{ gap: 10, marginTop: 8 }}>
          <Pressable
            onPress={handleAccept}
            disabled={accepting}
            style={[styles.acceptBtn, { backgroundColor: ink, borderColor: ink }]}
          >
            {accepting
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: theme.page, fontWeight: '900', fontSize: 16 }}>✓ Use this plan</Text>
            }
          </Pressable>
          <Pressable
            onPress={() => { setGeneratedDays(null); setStep(0); }}
            style={[styles.outlineBtn, { borderColor: ink, backgroundColor: theme.card }]}
          >
            <Text style={{ color: ink, fontWeight: '700', fontSize: 14 }}>↺ Change answers</Text>
          </Pressable>
          <Pressable
            onPress={handleSkip}
            disabled={skipping}
            style={[styles.outlineBtn, { borderColor: theme.cardBorder ?? '#D1D5DB', backgroundColor: theme.card }]}
          >
            {skipping
              ? <ActivityIndicator color={theme.textSoft} size="small" />
              : <Text style={{ color: theme.textSoft, fontWeight: '600', fontSize: 13 }}>
                  Skip — I'll build my own sessions
                </Text>
            }
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── Steps 0–7: wizard questions ────────────────────────────────────────────

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Step 0: Goal ── */}
      {step === 0 && (
        <>
          <StepHeader step={0} title="What's your main goal?" theme={theme} />
          <View style={{ gap: 8 }}>
            {GOALS.map((g) => (
              <OptionCard
                key={g.value} label={g.label} desc={g.desc}
                selected={goal === g.value}
                onPress={() => setGoal(g.value)}
                theme={theme} ink={ink}
              />
            ))}
          </View>
          <NavRow
            onNext={goNext} nextDisabled={!goal}
            theme={theme} ink={ink}
          />
          <Pressable onPress={handleSkip} disabled={skipping} style={{ alignItems: 'center', paddingTop: 12 }}>
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>
              {skipping ? 'Skipping…' : 'Skip setup — I\'ll build sessions manually'}
            </Text>
          </Pressable>
        </>
      )}

      {/* ── Step 1: Experience ── */}
      {step === 1 && (
        <>
          <StepHeader step={1} title="What's your experience level?" theme={theme} />
          <View style={{ gap: 8 }}>
            {EXPERIENCE.map((e) => (
              <OptionCard
                key={e.value} label={e.label} desc={e.desc}
                selected={experience === e.value}
                onPress={() => setExperience(e.value)}
                theme={theme} ink={ink}
              />
            ))}
          </View>
          <NavRow
            onBack={goBack} onNext={goNext} nextDisabled={!experience}
            theme={theme} ink={ink}
          />
        </>
      )}

      {/* ── Step 2: Equipment ── */}
      {step === 2 && (
        <>
          <StepHeader
            step={2} title="What equipment do you have access to?"
            subtitle="Select all that apply."
            theme={theme}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EQUIPMENT_OPTIONS.map((e) => (
              <ChipButton
                key={e.value} label={e.label}
                selected={equipment.includes(e.value)}
                onPress={() => toggleSet(setEquipment, e.value)}
                theme={theme} ink={ink}
              />
            ))}
          </View>
          <NavRow
            onBack={goBack} onNext={goNext}
            nextDisabled={equipment.length === 0}
            theme={theme} ink={ink}
          />
        </>
      )}

      {/* ── Step 3: Location ── */}
      {step === 3 && (
        <>
          <StepHeader step={3} title="Where do you usually train?" theme={theme} />
          <View style={{ gap: 8 }}>
            {LOCATIONS.map((l) => (
              <OptionCard
                key={l.value} label={l.label} desc={l.desc}
                selected={location === l.value}
                onPress={() => setLocation(l.value)}
                theme={theme} ink={ink}
              />
            ))}
          </View>
          <NavRow
            onBack={goBack} onNext={goNext} nextDisabled={!location}
            theme={theme} ink={ink}
          />
        </>
      )}

      {/* ── Step 4: Preferred duration ── */}
      {step === 4 && (
        <>
          <StepHeader step={4} title="How long do you want to work out?" theme={theme} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {DURATIONS.map((d) => (
              <Pressable
                key={d.value}
                onPress={() => setDuration(d.value)}
                style={[
                  styles.durationChip,
                  {
                    borderColor: duration === d.value ? ink : (theme.cardBorder ?? '#D1D5DB'),
                    backgroundColor: duration === d.value ? (theme.teal?.tint ?? '#E8F9F4') : theme.card,
                    shadowColor: "rgba(60,40,20,0.1)",
                  },
                ]}
              >
                <Text style={{
                  color: duration === d.value ? (theme.teal?.fg ?? ink) : theme.textStrong,
                  fontWeight: '900', fontSize: 18,
                }}>{d.label}</Text>
                <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>{d.desc}</Text>
              </Pressable>
            ))}
          </View>
          <NavRow
            onBack={goBack} onNext={goNext} nextDisabled={duration === 0}
            theme={theme} ink={ink}
          />
        </>
      )}

      {/* ── Step 5: Days per week ── */}
      {step === 5 && (
        <>
          <StepHeader step={5} title="How many days per week?" theme={theme} />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {DAYS_OPTIONS.map((d) => (
              <Pressable
                key={d}
                onPress={() => setDaysPerWeek(d)}
                style={[
                  styles.daysChip,
                  {
                    borderColor: daysPerWeek === d ? ink : (theme.cardBorder ?? '#D1D5DB'),
                    backgroundColor: daysPerWeek === d ? ink : theme.card,
                    shadowColor: "rgba(60,40,20,0.1)",
                  },
                ]}
              >
                <Text style={{
                  color: daysPerWeek === d ? (theme.page ?? '#fff') : theme.textStrong,
                  fontWeight: '900', fontSize: 28,
                }}>{d}</Text>
                <Text style={{ color: daysPerWeek === d ? 'rgba(255,255,255,0.7)' : theme.textSoft, fontSize: 11 }}>
                  days
                </Text>
              </Pressable>
            ))}
          </View>
          <NavRow
            onBack={goBack} onNext={goNext} nextDisabled={daysPerWeek === 0}
            theme={theme} ink={ink}
          />
        </>
      )}

      {/* ── Step 6: Muscle focus (optional) ── */}
      {step === 6 && (
        <>
          <StepHeader
            step={6} title="Any muscle groups to prioritise?"
            subtitle="Optional — skip if you want a balanced plan."
            theme={theme}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MUSCLE_OPTIONS.map((m) => (
              <ChipButton
                key={m.value} label={m.label}
                selected={muscleFocus.includes(m.value)}
                onPress={() => toggleSet(setMuscleFocus, m.value)}
                theme={theme} ink={ink}
              />
            ))}
          </View>
          <NavRow
            onBack={goBack} onNext={goNext} nextLabel={muscleFocus.length ? 'Next →' : 'Skip →'}
            theme={theme} ink={ink}
          />
        </>
      )}

      {/* ── Step 7: Limitations (optional) ── */}
      {step === 7 && (
        <>
          <StepHeader
            step={7} title="Any physical limitations?"
            subtitle="Optional — we'll filter out exercises that could aggravate these areas."
            theme={theme}
          />

          <View style={[styles.disclaimer, { backgroundColor: theme.card, borderColor: theme.cardBorder ?? '#E5E7EB' }]}>
            <Text style={{ color: theme.textSoft, fontSize: 12, lineHeight: 17 }}>
              ⚠️ This filtering is general safety guidance only and is not medical advice.
              Consult a healthcare professional for specific conditions before beginning any exercise program.
            </Text>
          </View>

          <View style={{ gap: 8, marginTop: 12 }}>
            {LIMITATION_OPTIONS.map((l) => (
              <ChipButton
                key={l.value} label={l.label}
                selected={limitations.includes(l.value)}
                onPress={() => toggleSet(setLimitations, l.value)}
                theme={theme} ink={ink}
              />
            ))}
          </View>

          <NavRow
            onBack={goBack}
            onNext={() => { setStep(8); }}
            nextLabel="Generate my plan →"
            theme={theme} ink={ink}
          />

          <Pressable onPress={handleSkip} style={{ alignItems: 'center', paddingTop: 12 }}>
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>
              Skip setup — I'll build sessions manually
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    gap: 12,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  radioOuter: {
    width: 20, height: 20, borderRadius: 16, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  chip: {
    borderRadius: 20,
    borderWidth: 2,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  durationChip: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 16,
    alignItems: 'center',
    width: '30%',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  daysChip: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 16,
    alignItems: 'center',
    width: 76,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  backBtn: {
    borderRadius: 22,
    borderWidth: 2,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  nextBtn: {
    borderRadius: 22,
    borderWidth: 2,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  dayCard: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    marginBottom: 10,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  dayBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  acceptBtn: {
    borderRadius: 26,
    borderWidth: 2,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  outlineBtn: {
    borderRadius: 22,
    borderWidth: 2,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disclaimer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
});
