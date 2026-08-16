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

/** Mon=0 … Sun=6 (weekStartsOn Monday) */
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function dayAvailabilityMin(profile: AthleteProfile, dayOffset: number): number {
  const key = DAY_KEYS[((dayOffset % 7) + 7) % 7];
  const hours = (profile.weeklyAvailability as any)[key] || 0;
  // 2.5 means "+2h" in UI — treat as 150 min
  return Math.round(hours * 60);
}

function availableDayOffsets(profile: AthleteProfile): number[] {
  return DAY_KEYS.map((_, i) => i).filter((i) => dayAvailabilityMin(profile, i) > 0);
}

function capDuration(desiredMin: number, dayMin: number): number {
  if (dayMin <= 0) return 0;
  return Math.max(10, Math.min(desiredMin, dayMin));
}

function pickLongRunDay(profile: AthleteProfile, avoid: number[]): number {
  const avail = availableDayOffsets(profile);
  const ranked = [...avail].sort(
    (a, b) => dayAvailabilityMin(profile, b) - dayAvailabilityMin(profile, a)
  );
  for (const d of ranked) {
    if (!avoid.includes(d)) return d;
  }
  return ranked[0] ?? 6;
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

  // HARD CONSTRAINT: never plan longer than the longest day the athlete has
  const maxAvailMin = Math.max(
    0,
    ...(["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const).map(
      (k) => Math.round(((profile.weeklyAvailability as any)?.[k] || 0) * 60)
    )
  );
  // Cap base session lengths before any week loop
  const easyBaseCapped = maxAvailMin > 0 ? Math.min(easyBase, maxAvailMin) : easyBase;
  const longBaseCapped = maxAvailMin > 0 ? Math.min(longBase, maxAvailMin) : longBase;
  const qualityBaseCapped = maxAvailMin > 0 ? Math.min(qualityBase, maxAvailMin) : qualityBase;

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

  const availOffsets = availableDayOffsets(profile);
  const constraintWarnings: string[] = [];
  const maxDayMin = Math.max(0, ...DAY_KEYS.map((_, i) => dayAvailabilityMin(profile, i)));
  const hasMarathonGoal = topGoals.some(
    (g) =>
      (g.metrics?.distanceKm && g.metrics.distanceKm >= 30) ||
      /marathon/i.test(g.title)
  );
  if (hasMarathonGoal && (hours < 4 || maxDayMin < 75)) {
    constraintWarnings.push(
      `Constraint callout: A marathon-level goal with only ~${hours.toFixed(1)} h/week (longest available day ${maxDayMin} min) is not compatible with standard long-run progression. Sessions are capped to your stated availability. Consider more time on at least one day, or adjust the goal timeline.`
    );
  }
  if (hours > 0 && hours < 2.5 && (isRunner || doesStrength)) {
    constraintWarnings.push(
      `Low weekly availability (~${hours.toFixed(1)} h). Plan prioritizes recovery and short quality; full race prep may not be realistic until hours increase.`
    );
  }

  for (let w = 0; w < weeks; w++) {
    const weekStart = addWeeks(start, w);
    const isDeload = w === weeks - 1;
    const progress = isDeload ? 0.75 : 1 + w * 0.06;

    // Schedule only on days with availability; longest session on the day with most minutes
    const days = availOffsets.length
      ? availOffsets
      : []; // never invent days — if empty, no sessions this week
    if (!days.length && (isRunner || doesStrength)) {
      constraintWarnings.push(
        "No training days with hours set in Baseline. Set hours per day, then regenerate."
      );
    }
    const longDay = pickLongRunDay(profile, []);
    const otherDays = days.filter((d) => d !== longDay).sort((a, b) => a - b);

    // ========== RUNNING ==========
    if (isRunner && runDays >= 1) {
      // Easy runs on non-long days (respect count)
      const easyCount = Math.max(0, Math.min(runDays - 1, otherDays.length));
      otherDays.slice(0, easyCount).forEach((dayOffset, idx) => {
        const dayMin = dayAvailabilityMin(profile, dayOffset);
        if (dayMin <= 0) return;
        const desired = Math.round(easyBaseCapped * progress * (idx === 0 ? 1 : 0.9));
        const duration = capDuration(desired, dayMin);
        const date = format(addDays(weekStart, dayOffset), "yyyy-MM-dd");
        const trailEasy = primaryIsTrail && idx === 1;

        workouts.push(
          createWorkout(
            date,
            trailEasy ? "trail_run" : "easy_run",
            primaryIsTrail ? "trail_running" : "running",
            trailEasy ? "Trail Aerobic" : "Easy Run (Z2)",
            `Aerobic base (${duration} min, capped to your ${dayMin} min availability this day). Conversational Zone 2. Relaxed form.${
              duration < desired ? " Shortened to fit the day." : ""
            }`,
            {
              plannedDurationMin: duration,
              plannedIntensity: "z2",
              plannedDistanceKm:
                Math.round((duration / 60) * (exp === "beginner" ? 8.5 : 9.5) * 10) / 10,
            }
          )
        );
      });

      // Quality: mid-week if a free day remains and runDays >= 3
      if (runDays >= 3 && otherDays.length > easyCount) {
        const qDay = otherDays[easyCount] ?? otherDays[0];
        const dayMin = dayAvailabilityMin(profile, qDay);
        if (dayMin > 0) {
          const qDate = format(addDays(weekStart, qDay), "yyyy-MM-dd");
          const qDur = capDuration(Math.round(qualityBaseCapped * (isDeload ? 0.7 : progress)), dayMin);
          if (w % 2 === 0) {
            workouts.push(
              createWorkout(
                qDate,
                "tempo",
                "running",
                "Tempo / Threshold",
                `Warm-up 8–12 min Z1–Z2.
Main: continuous tempo (top Z3 / low Z4) within ${qDur} min total (day budget ${dayMin} min).
Cool-down easy.
Target: threshold durability for your priority race.`,
                { plannedDurationMin: qDur, plannedIntensity: "z3" }
              )
            );
          } else {
            const reps = isDeload ? 4 : 5;
            workouts.push(
              createWorkout(
                qDate,
                "intervals",
                "running",
                "VO2max Intervals",
                `Warm-up 10–12 min Z1–Z2 + 2–3 strides.
Main: ${reps} × 3 min hard (Z4–Z5) / 90–120 s jog, within ${qDur} min total.
Cool-down easy.
Stop the set early if form breaks down.`,
                { plannedDurationMin: qDur, plannedIntensity: "z5" }
              )
            );
          }
        }
      }

      // Long run — always on the day with the most available minutes
      {
        const dayMin = dayAvailabilityMin(profile, longDay);
        if (dayMin > 0) {
          const longDate = format(addDays(weekStart, longDay), "yyyy-MM-dd");
          const desired = Math.round(longBaseCapped * progress * (isDeload ? 0.8 : 1));
          const longDur = capDuration(desired, dayMin);
          workouts.push(
            createWorkout(
              longDate,
              primaryIsTrail ? "trail_run" : "long_run",
              primaryIsTrail ? "trail_running" : "running",
              primaryIsTrail ? "Long Trail Run" : "Long Run",
              `Long run ${longDur} min (~Z2)${
                longDur < desired
                  ? ` — capped from ~${desired} min to your ${dayMin} min availability this day`
                  : ""
              }. Baseline longest: ${longestRecent || "n/a"} km.
${primaryIsTrail ? "Trail: elevation + fueling practice when possible." : "Road: steady aerobic; fuel if >75 min."}
Finish tired, not broken.`,
              {
                plannedDurationMin: longDur,
                plannedDistanceKm:
                  Math.round((longDur / 60) * (exp === "beginner" ? 8 : 9) * 10) / 10,
                plannedIntensity: "z2",
              }
            )
          );
        }
      }
    }

    // ========== STRENGTH ==========
    if (doesStrength && strengthDays > 0) {
      // Prefer weekdays with availability that are not the long-run day
      const strengthCandidates = days.filter((d) => d !== longDay);
      const sDays = (strengthCandidates.length ? strengthCandidates : days).slice(0, strengthDays);

      sDays.forEach((dayOffset, idx) => {
        const dayMin = dayAvailabilityMin(profile, dayOffset);
        if (dayMin <= 0) return;
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
              plannedDurationMin: capDuration(45, dayMin),
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
    weeklyStructure: `${isRunner ? `${runDays}× Run (mostly Z2 + 1 quality + long)` : "No run"}${doesStrength ? ` · ${strengthDays}× Strength (${approachLabels.join(", ") || "Default"})` : ""} · Deload week ${weeks} · ${labelApproach(String(exp))} · ~${hours.toFixed(1)}h/wk`,
    notes: [
      // Time vs goal callouts first so they're visible
      ...constraintWarnings,
      maxAvailMin > 0 && maxAvailMin < 90 && hasMarathonGoal
        ? `Time vs goal: longest day is only ${maxAvailMin} min. Long runs are capped to ${maxAvailMin} min — not enough for classic marathon long-run progression until you free more time on at least one day.`
        : "",
      previousPlan
        ? "Update: kept completed past sessions; forward block rebuilt from Baseline."
        : "New block from Baseline only.",
      `Goal focus: ${goalSummary || "General development"}.`,
      `Availability (minutes): ${DAY_KEYS.map((k, i) => `${k.slice(0, 3)} ${dayAvailabilityMin(profile, i)}`).join(" · ")}. Longest day ${maxAvailMin} min. Weekly total ~${hours.toFixed(1)} h.`,
      isRunner
        ? `Running: sessions only on days with hours > 0; each duration ≤ that day's minutes; long run on longest day (≤ ${maxAvailMin} min). Volume anchor ${weeklyKm || "n/a"} km.`
        : "Running: not selected.",
      doesStrength
        ? `Strength: ${strengthDays} day(s)/week · ${approachLabels.join("; ") || "Default"} · also capped to daily minutes.`
        : "Strength: not selected.",
    ].filter(Boolean).join(" "),
  };
}
