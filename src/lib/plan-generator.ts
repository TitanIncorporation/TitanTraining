import { AthleteProfile, TrainingPlan, Workout, WorkoutType, Sport, Goal } from "@/types";
import { addDays, format, startOfWeek, addWeeks } from "date-fns";

function uid() {
  return Math.random().toString(36).slice(2, 11);
}

function labelApproach(code: string): string {
  const map: Record<string, string> = {
    heavy_duty: "Heavy Duty",
    hypertrophy: "Hypertrophy",
    strength: "Strength",
    functional: "Functional Training",
    mentzer: "Heavy Duty",
    full_body: "Full body",
    upper_chest: "Chest",
    chest: "Chest",
    arms: "Arms",
    back: "Back",
    shoulders: "Shoulders",
    legs: "Legs",
    general: "Full body",
  };
  if (map[code]) return map[code];
  // humanize snake_case / kebab
  return code
    .replace(/[_-]+/g, " ")
    .replace(/\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Parse free-text like "Heavy Duty for upper body, Hypertrophy for lower" */
function parseCustomApproach(text: string | undefined | null): {
  upper?: "heavy_duty" | "hypertrophy" | "strength" | "functional";
  lower?: "heavy_duty" | "hypertrophy" | "strength" | "functional";
  raw?: string;
} {
  if (!text || !text.trim()) return {};
  const t = text.toLowerCase();
  const detect = (chunk: string) => {
    if (/heavy\s*duty|mentzer|hit/.test(chunk)) return "heavy_duty" as const;
    if (/hypertrophy|hyper/.test(chunk)) return "hypertrophy" as const;
    if (/functional/.test(chunk)) return "functional" as const;
    if (/strength|power/.test(chunk)) return "strength" as const;
    return undefined;
  };
  const upperChunk = t.split(/lower/)[0] || t;
  const lowerChunk = t.includes("lower") ? t.split(/lower/)[1] || "" : t;
  const upper = /upper/.test(t) ? detect(upperChunk) : detect(t);
  const lower = /lower/.test(t) ? detect("lower " + lowerChunk) : detect(t);
  return { upper, lower, raw: text.trim() };
}


function createWorkout(
  date: string,
  type: WorkoutType,
  sport: Sport,
  title: string,
  description: string,
  opts: Partial<Workout> = {}
): Workout {
  return {
    id: uid(),
    date,
    type,
    sport,
    title,
    description,
    completed: false,
    source: "planned",
    ...opts,
  };
}

function weeklyHours(profile: AthleteProfile): number {
  const a = profile.weeklyAvailability;
  return (
    (a.monday || 0) +
    (a.tuesday || 0) +
    (a.wednesday || 0) +
    (a.thursday || 0) +
    (a.friday || 0) +
    (a.saturday || 0) +
    (a.sunday || 0)
  );
}

function highestPriorityGoals(goals: Goal[], limit = 3): Goal[] {
  return [...goals].sort((a, b) => b.priority - a.priority).slice(0, limit);
}

/**
 * PHD-LEVEL TRAINING PLAN GENERATOR
 * Evidence-based principles only.
 *
 * RUNNING (Seiler, Stöggl, Nielsen, etc.)
 * - Polarized distribution: ≥80% easy (Z1–Z2), ≤20% hard
 * - One primary quality session per week
 * - Progressive long run with controlled volume increases
 * - Regular recovery / deload
 * - Trail specificity when relevant
 *
 * HYPERTROPHY / STRENGTH
 * - Default: Heavy Duty / Mentzer-inspired (low volume, high intensity, long recovery)
 * - Still supports moderate volume when needed
 * - Exercise selection constrained by equipment
 * - Upper chest + arms bias when requested
 * - Lower-body work managed to protect running
 *
 * INTEGRATION
 * - Respects available days and hours
 * - Protects recovery between hard sessions
 * - Scales to experience level
 */
export function generateTrainingPlan(
  profile: AthleteProfile,
  weeks: number = 4,
  previousPlan?: TrainingPlan
): TrainingPlan {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 });
  const workouts: Workout[] = [];

  const isRunner =
    profile.sports.includes("running") || profile.sports.includes("trail_running");
  const doesStrength = profile.sports.includes("strength");
  const primaryIsTrail =
    profile.primarySport === "trail_running" ||
    profile.runningBaseline?.preferredSurface === "trail";
  const hours = weeklyHours(profile);
  const trainingDays = (profile as any).trainingDaysPerWeek || 5;
  const exp =
    profile.runningBaseline?.experience ||
    profile.fitnessLevel ||
    profile.experienceLevel ||
    "intermediate";
  const strengthExp =
    profile.strengthBaseline?.experience ||
    profile.fitnessLevel ||
    profile.experienceLevel ||
    "intermediate";
  const topGoals = highestPriorityGoals(profile.goals);
  const approaches = profile.strengthBaseline?.trainingApproaches || ["heavy_duty"];
  const approachOther = (profile.strengthBaseline as any)?.trainingApproachOther as string | undefined;
  const customSplit = parseCustomApproach(approachOther);
  const useHeavyDuty =
    approaches.includes("heavy_duty") ||
    approaches.includes("mentzer" as any) ||
    customSplit.upper === "heavy_duty" ||
    customSplit.lower === "heavy_duty";
  const physique = profile.strengthBaseline?.physiquePriorities || ["general"];
  const approachLabels = [
    ...approaches.map(labelApproach),
    ...(approachOther ? [approachOther.trim()] : []),
  ].filter(Boolean);
  const physiqueLabels = physique.map(labelApproach);
  const focusChest = physique.includes("chest") || physique.includes("upper_chest");
  const focusArms = physique.includes("arms");

  // Scale running from baseline volume when available
  const weeklyKm = profile.runningBaseline?.weeklyVolumeKm || 0;
  const longestRecent = profile.runningBaseline?.longestRunLast30DaysKm || 0;

  const easyBase =
    weeklyKm > 0
      ? Math.max(30, Math.round((weeklyKm * 0.2) * 6)) // ~min from share of volume
      : exp === "beginner"
        ? 35
        : exp === "intermediate"
          ? 45
          : exp === "advanced"
            ? 55
            : 60;
  const longBase =
    longestRecent > 0
      ? Math.round(Math.min(longestRecent * 6.5, longestRecent * 5 + 20)) // min approx
      : exp === "beginner"
        ? 60
        : exp === "intermediate"
          ? 85
          : exp === "advanced"
            ? 105
            : 120;
  const qualityBase =
    exp === "beginner" ? 40 : exp === "intermediate" ? 50 : exp === "advanced" ? 60 : 70;

  // Session count from training days + hours
  let runDays = 0;
  if (isRunner) {
    if (trainingDays >= 6 || hours >= 8) runDays = 4;
    else if (trainingDays >= 4 || hours >= 5) runDays = 3;
    else runDays = 2;
  }

  let strengthDays = 0;
  if (doesStrength) {
    if (useHeavyDuty) {
      strengthDays = trainingDays >= 5 && hours >= 6 ? 2 : 1;
    } else {
      strengthDays = trainingDays >= 5 ? 2 : 1;
    }
  }

  for (let w = 0; w < weeks; w++) {
    const weekStart = addWeeks(start, w);
    const isDeload = w === weeks - 1;
    const progress = isDeload ? 0.75 : 1 + w * 0.06;

    // ========== RUNNING ==========
    if (isRunner && runDays >= 2) {
      // Easy runs (majority of volume)
      const easySlots = runDays >= 4 ? [1, 3, 5] : runDays === 3 ? [1, 4] : [2];
      easySlots.forEach((dayOffset, idx) => {
        const date = format(addDays(weekStart, dayOffset), "yyyy-MM-dd");
        const duration = Math.round(easyBase * progress * (idx === 0 ? 1 : 0.9));
        const trailEasy = primaryIsTrail && idx === 1;

        workouts.push(
          createWorkout(
            date,
            trailEasy ? "trail_run" : "easy_run",
            primaryIsTrail ? "trail_running" : "running",
            trailEasy ? "Trail Aerobic" : "Easy Run (Z2)",
            `Aerobic base. Keep effort conversational (mostly Zone 2).
Focus on relaxed form and consistent breathing.
${primaryIsTrail ? "Prefer trails with gentle rolling terrain when possible." : ""}
This session builds mitochondrial density and fatigue resistance without high stress.`,
            {
              plannedDurationMin: duration,
              plannedIntensity: "z2",
              plannedDistanceKm:
                Math.round((duration / 60) * (exp === "beginner" ? 8.5 : 9.5) * 10) / 10,
            }
          )
        );
      });

      // One quality session
      if (runDays >= 3) {
        const qDate = format(addDays(weekStart, 2), "yyyy-MM-dd");
        const qDur = Math.round(qualityBase * (isDeload ? 0.7 : progress));

        if (w % 2 === 0) {
          // Tempo / Threshold
          workouts.push(
            createWorkout(
              qDate,
              "tempo",
              "running",
              "Tempo / Threshold",
              `Warm-up 12–15 min Z1–Z2.
Main: ${Math.round(16 + w * 3)} min continuous tempo (top Z3 / low Z4) — talk in short phrases only.
Cool-down 8–10 min easy.
Target: threshold durability for your priority race. If goal pace is set, tempo ≈ slightly slower than goal 10k effort.`,
              {
                plannedDurationMin: qDur,
                plannedIntensity: "z3",
              }
            )
          );
        } else {
          // VO2 intervals
          workouts.push(
            createWorkout(
              qDate,
              "intervals",
              "running",
              "VO2max Intervals",
              `Warm-up 15 min easy + 2–3 strides.
Main set: 5–6 × (3 min hard Zone 4–5 / 90–120 s easy jog).
Cool-down 10 min.

Purpose: improve maximal aerobic capacity and running economy at higher speeds.
Stop if form collapses.`,
              {
                plannedDurationMin: qDur,
                plannedIntensity: "z5",
              }
            )
          );
        }
      }

      // Long run
      const longDate = format(addDays(weekStart, 6), "yyyy-MM-dd");
      const longDur = Math.round(longBase * progress * (isDeload ? 0.8 : 1));
      workouts.push(
        createWorkout(
          longDate,
          primaryIsTrail ? "trail_run" : "long_run",
          primaryIsTrail ? "trail_running" : "running",
          primaryIsTrail ? "Long Trail Run" : "Long Run",
          `Long run ${longDur} min (~Z2). Build from Baseline longest (${longestRecent || "n/a"} km).
${primaryIsTrail ? "Trail: seek elevation; practice fueling + downhill control." : "Road: steady aerobic; fuel if >75 min."}
Optional late pick-ups 3×20–30s if good. Finish tired, not broken.`,
          {
            plannedDurationMin: longDur,
            plannedDistanceKm:
              Math.round((longDur / 60) * (exp === "beginner" ? 8 : 9) * 10) / 10,
            plannedIntensity: "z2",
          }
        )
      );
    }

    // ========== STRENGTH / HYPERTROPHY (Mentzer-inspired default) ==========
    if (doesStrength && strengthDays > 0) {
      const sDays = strengthDays === 2 ? [0, 3] : [1]; // Mon + Thu or Tue

      sDays.forEach((dayOffset, idx) => {
        const date = format(addDays(weekStart, dayOffset), "yyyy-MM-dd");
        const isUpperFocus = idx === 0; // first session of week = upper bias

        const hasBarbell = profile.equipment.barbell || profile.equipment.rack;
        const hasDB = profile.equipment.dumbbells;
        const hasKB = profile.equipment.kettlebells;
        const hasBench = profile.equipment.bench;
        const hasPullup = profile.equipment.pullUpBar;
        // Body-region approach: custom text can set upper vs lower differently
        const regionApproach = isUpperFocus
          ? customSplit.upper ||
            (approaches.includes("heavy_duty")
              ? "heavy_duty"
              : approaches.includes("hypertrophy")
                ? "hypertrophy"
                : approaches.includes("strength")
                  ? "strength"
                  : approaches[0])
          : customSplit.lower ||
            (approaches.includes("hypertrophy")
              ? "hypertrophy"
              : approaches.includes("heavy_duty")
                ? "heavy_duty"
                : approaches.includes("strength")
                  ? "strength"
                  : approaches[0]);
        const useHeavyDutyRegion = regionApproach === "heavy_duty" || String(regionApproach) === "mentzer";
        const useHypertrophy = regionApproach === "hypertrophy" || approaches.includes("hypertrophy") && !useHeavyDutyRegion;
        const useStrength = regionApproach === "strength";
        const hardSets = useHeavyDutyRegion ? 1 : useHypertrophy ? 3 : useStrength ? 4 : 2;
        const repGuide = useHeavyDutyRegion ? "6–10" : useHypertrophy ? "8–12" : useStrength ? "3–6" : "6–12";
        const regionLabel = labelApproach(String(regionApproach || "strength"));

        let exercises: { name: string; sets: number; reps: string; notes?: string }[] = [];
        let title = "";
        let description = "";

        if (isUpperFocus) {
          title = focusChest || focusArms ? "Upper Body – Priority Focus" : "Upper Body Strength";
          description = useHeavyDutyRegion
            ? `${regionLabel} (upper): warm-up, then ${hardSets} hard set(s) near technical failure. Rest 2–4 min. Progressive overload. ${focusChest ? "Chest priority." : ""} ${focusArms ? "Arms priority." : ""}${customSplit.raw ? ` Custom: ${customSplit.raw}.` : ""}`.trim()
            : useHypertrophy
              ? `${regionLabel} (upper): ${hardSets} sets @ ${repGuide}, controlled tempo. ${focusChest ? "Chest priority." : ""} ${focusArms ? "Arms priority." : ""}${customSplit.raw ? ` Custom: ${customSplit.raw}.` : ""}`.trim()
              : `${regionLabel} (upper): ${hardSets} sets @ ${repGuide}. ${focusChest ? "Chest priority." : ""} ${focusArms ? "Arms priority." : ""}${customSplit.raw ? ` Custom: ${customSplit.raw}.` : ""}`.trim();

          exercises = [
            {
              name: hasBarbell && hasBench ? "Incline Barbell Press" : hasDB ? "Incline Dumbbell Press" : "Incline Push-up variation",
              sets: hardSets,
              reps: repGuide,
              notes: useHeavyDutyRegion ? "Warm-up then 1 hard set." : "Chest emphasis if selected.",
            },
            {
              name: hasBarbell && hasBench ? "Flat Bench Press or Weighted Dip" : hasDB ? "Flat Dumbbell Press" : "Push-up variation",
              sets: hardSets,
              reps: repGuide,
            },
            {
              name: hasPullup ? "Pull-up or Chin-up" : hasBarbell ? "Barbell Row" : "Dumbbell / Band Row",
              sets: hardSets,
              reps: repGuide,
            },
            {
              name: hasDB || hasBarbell ? "Overhead Press" : "Pike Push-up",
              sets: Math.max(1, hardSets - (useHeavyDuty ? 0 : 1)),
              reps: repGuide,
            },
            {
              name: hasDB || hasBarbell ? "Biceps Curl (barbell or DB)" : "Band Curl",
              sets: focusArms ? hardSets : Math.max(1, hardSets - 1),
              reps: useHypertrophy ? "10–15" : "8–12",
              notes: "Direct arm work.",
            },
            {
              name: hasDB || hasBarbell ? "Triceps Extension or Close-grip work" : "Diamond Push-up",
              sets: focusArms ? hardSets : Math.max(1, hardSets - 1),
              reps: useHypertrophy ? "10–15" : "8–12",
              notes: "Direct arm work.",
            },
          ];
        } else {
          title = `Lower emphasis – ${regionLabel}`;
          description = useHeavyDutyRegion
            ? `${regionLabel} (lower): 1 hard set per lift after warm-up. Protect legs for long run days.${customSplit.raw ? ` Custom: ${customSplit.raw}.` : ""}`
            : `${regionLabel} (lower): ${hardSets} sets @ ${repGuide}. Controlled eccentric; leave 1–2 RIR if long run is next day.${customSplit.raw ? ` Custom: ${customSplit.raw}.` : ""}`;

          exercises = [
            {
              name: hasBarbell ? "Squat or Front Squat" : hasDB || hasKB ? "Goblet / Split Squat" : "Bulgarian Split Squat",
              sets: 1,
              reps: "6–10",
              notes: "1 hard set. Leave 1–2 reps in reserve if legs feel heavy.",
            },
            {
              name: hasBarbell ? "Romanian Deadlift" : "Single-leg RDL",
              sets: 1,
              reps: "6–10",
            },
            {
              name: hasPullup ? "Pull-up" : "Row variation",
              sets: 1,
              reps: "6–10",
            },
            {
              name: hasDB || hasBarbell ? "Incline Press (lighter)" : "Push-up",
              sets: 1,
              reps: "8–12",
            },
            {
              name: "Calf Raise",
              sets: 1,
              reps: "10–15",
            },
            {
              name: "Core (Dead Bug / Side Plank / Pallof)",
              sets: 2,
              reps: "8–12 or 30s",
            },
          ];
        }

        if (isDeload) {
          exercises = exercises.map((e) => ({
            ...e,
            notes: (e.notes || "") + " Deload – reduce load ~20–30%.",
          }));
        }

        workouts.push(
          createWorkout(
            date,
            "hypertrophy",
            "strength",
            title,
            description,
            {
              plannedDurationMin: 45,
              exercises,
            }
          )
        );
      });
    }
  }

  if (previousPlan?.workouts?.length) {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const carried = previousPlan.workouts.filter((w) => w.completed && w.date < todayStr);
    const keys = new Set(workouts.map((w) => w.date + "|" + w.title));
    for (const w of carried) {
      const key = w.date + "|" + w.title;
      if (!keys.has(key)) workouts.push(w);
    }
  }

  workouts.sort((a, b) => a.date.localeCompare(b.date));

  const endDate = format(addWeeks(start, weeks), "yyyy-MM-dd");
  const goalSummary =
    topGoals.length > 0
      ? topGoals.map((g) => `${g.title} (P${g.priority})`).join(", ")
      : "General development";

  return {
    id: uid(),
    name: `${weeks}-Week Evidence-Based Block`,
    startDate: format(start, "yyyy-MM-dd"),
    endDate,
    generatedAt: new Date().toISOString(),
    basedOnProfileSnapshot: {
      primarySport: profile.primarySport,
      experienceLevel: profile.fitnessLevel || profile.experienceLevel,
      goals: profile.goals,
    },
    workouts,
    weeklyStructure: `${isRunner ? `${runDays}× run (mostly Z2 + 1 quality + long)` : "No run"}${doesStrength ? ` · ${strengthDays}× strength (${approachLabels.join(", ") || "default"})` : ""} · deload week ${weeks} · ${labelApproach(String(exp))} · ~${hours.toFixed(1)}h/wk`,
    notes: [
      previousPlan ? "Update: kept completed past sessions; forward block rebuilt from Baseline." : "New block from Baseline only (no hard-coded athlete defaults).",
      `Goal focus: ${goalSummary || "general development"}.`,
      isRunner
        ? `Running: ${runDays} days/week · easy Z2 base · 1 quality (tempo or intervals) · long run progressing from ~${Math.round(longBase * 0.85)} toward ~${longBase} min · weekly volume anchor ${weeklyKm || "n/a"} km · surface ${primaryIsTrail ? "trail bias" : "road"}.`
        : "Running: not selected in Baseline.",
      doesStrength
        ? `Strength: ${strengthDays} day(s)/week · approach ${approachLabels.join("; ") || "default"} · physique ${physiqueLabels.join(", ") || "Full body"} · equipment-constrained · lower body managed around long-run days.`
        : "Strength: not selected.",
      `Load budget: ~${hours.toFixed(1)} h/week across ${trainingDays} training days. Final week = deload (~25% less intensity/volume).`,
    ].join(" "),
  };
}
