import { AthleteProfile, TrainingPlan, Workout, WorkoutType, Sport, Goal } from "@/types";
import { addDays, format, startOfWeek, addWeeks } from "date-fns";

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  const raw = (profile.weeklyAvailability as any)?.[key];
  const hours = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  // 0.5 h → 30 min; 2.5 (+2) → 150 min
  return Math.max(1, Math.round(hours * 60));
}

function availableDayOffsets(profile: AthleteProfile): number[] {
  return DAY_KEYS.map((_, i) => i).filter((i) => dayAvailabilityMin(profile, i) >= 15);
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

    // Per-day minute budgets (NOT weekly total) — one session per day max
    const dayBudget: Record<number, number> = {};
    for (let d = 0; d < 7; d++) {
      const m = dayAvailabilityMin(profile, d);
      if (m >= 15) dayBudget[d] = m;
    }
    const daysWithTime = Object.keys(dayBudget)
      .map(Number)
      .sort((a, b) => dayBudget[b] - dayBudget[a]);

    if (!daysWithTime.length) {
      if (w === 0) {
        constraintWarnings.push(
          "No days with hours ≥ 0.5. Set Mon–Sun hours in Baseline, Save, Update plan."
        );
      }
      continue;
    }

    const usedDays = new Set<number>();
    const takeDay = (prefer: number[] = []): number | null => {
      for (const d of prefer) {
        if (dayBudget[d] != null && dayBudget[d] >= 15 && !usedDays.has(d)) return d;
      }
      for (const d of daysWithTime) {
        if (!usedDays.has(d) && dayBudget[d] >= 15) return d;
      }
      return null;
    };
    const book = (d: number, mins: number) => {
      usedDays.add(d);
      dayBudget[d] = Math.max(0, (dayBudget[d] || 0) - mins);
    };

    // --- RUNNING (at most one session per day) ---
    if (isRunner) {
      const targetRunDays = Math.min(runDays, daysWithTime.length);

      // 1) Preferred long-run day if it has enough time; else longest available
      const prefRaw = (profile.runningBaseline as any)?.preferredLongRunDay;
      const prefDay =
        prefRaw === null || prefRaw === undefined || prefRaw === ""
          ? null
          : Number(prefRaw);
      const MIN_LONG_PREFER = 45; // prefer not to force "long" on a 30 min day
      let longD: number | null = null;
      if (
        prefDay != null &&
        Number.isFinite(prefDay) &&
        dayBudget[prefDay] != null &&
        dayBudget[prefDay] >= 15 &&
        !usedDays.has(prefDay)
      ) {
        if (dayBudget[prefDay] >= MIN_LONG_PREFER) {
          longD = prefDay;
        } else {
          // User asked for this day but availability is tight — still use it for the "main" run but call out
          longD = prefDay;
          if (w === 0) {
            constraintWarnings.push(
              `Long-run day: you preferred ${DAY_KEYS[prefDay]}, but that day only has ${dayBudget[prefDay]} min. Session is capped to availability (not a full long run).`
            );
          }
        }
      }
      if (longD == null) {
        longD = takeDay(daysWithTime);
        if (
          w === 0 &&
          prefDay != null &&
          Number.isFinite(prefDay) &&
          longD != null &&
          longD !== prefDay
        ) {
          constraintWarnings.push(
            `Long-run day: preferred ${DAY_KEYS[prefDay]} was unavailable or off; placed on ${DAY_KEYS[longD]} (more available time). Availability always wins.`
          );
        }
      }
      if (longD != null) {
        const dayMin = dayBudget[longD];
        const desired = Math.round(longBaseCapped * progress * (isDeload ? 0.8 : 1));
        const longDur = Math.min(desired, dayMin);
        const isReallyLong = dayMin >= 50 && longDur >= 45;
        workouts.push(
          createWorkout(
            format(addDays(weekStart, longD), "yyyy-MM-dd"),
            primaryIsTrail ? "trail_run" : isReallyLong ? "long_run" : "easy_run",
            primaryIsTrail ? "trail_running" : "running",
            isReallyLong
              ? primaryIsTrail
                ? "Long Trail Run"
                : "Long Run"
              : "Easy Run (Z2)",
            `${isReallyLong ? "Long run" : "Run"} ${longDur} min (this day only has ${dayMin} min). Zone 2.`,
            {
              plannedDurationMin: longDur,
              plannedDistanceKm:
                Math.round((longDur / 60) * (exp === "beginner" ? 8 : 9) * 10) / 10,
              plannedIntensity: "z2",
            }
          )
        );
        book(longD, longDur);
      }

      // 2) Quality once if we still have run slots and a free day with enough time
      let runsPlaced = longD != null ? 1 : 0;
      if (runsPlaced < targetRunDays && runDays >= 3) {
        const qD = takeDay(daysWithTime.filter((d) => d !== longD));
        if (qD != null && dayBudget[qD] >= 30) {
          const dayMin = dayBudget[qD];
          const qDur = Math.min(
            Math.round(qualityBaseCapped * (isDeload ? 0.7 : progress)),
            dayMin
          );
          workouts.push(
            createWorkout(
              format(addDays(weekStart, qD), "yyyy-MM-dd"),
              w % 2 === 0 ? "tempo" : "intervals",
              "running",
              w % 2 === 0 ? "Tempo / Threshold" : "VO2max Intervals",
              `Quality ${qDur} min (day budget ${dayMin} min).`,
              {
                plannedDurationMin: qDur,
                plannedIntensity: w % 2 === 0 ? "z3" : "z5",
              }
            )
          );
          book(qD, qDur);
          runsPlaced++;
        }
      }

      // 3) Easy runs on remaining free days until targetRunDays
      while (runsPlaced < targetRunDays) {
        const eD = takeDay();
        if (eD == null) break;
        const dayMin = dayBudget[eD];
        const duration = Math.min(
          Math.round(easyBaseCapped * progress * 0.9),
          dayMin
        );
        workouts.push(
          createWorkout(
            format(addDays(weekStart, eD), "yyyy-MM-dd"),
            "easy_run",
            "running",
            "Easy Run (Z2)",
            `Aerobic ${duration} min (day budget ${dayMin} min).`,
            {
              plannedDurationMin: duration,
              plannedIntensity: "z2",
              plannedDistanceKm:
                Math.round((duration / 60) * (exp === "beginner" ? 8.5 : 9.5) * 10) / 10,
            }
          )
        );
        book(eD, duration);
        runsPlaced++;
      }
    }

    // --- STRENGTH: only on free days that still have budget (never stack on a run day) ---
    if (doesStrength && strengthDays > 0) {
      let sPlaced = 0;
      const targetS = Math.min(strengthDays, daysWithTime.length);
      while (sPlaced < targetS) {
        const sD = takeDay();
        if (sD == null) break;
        const dayMin = dayBudget[sD];
        if (dayMin < 25) break;

        const isUpperFocus = sPlaced === 0;
        const hasBarbell = profile.equipment.barbell || profile.equipment.rack;
        const hasDB = profile.equipment.dumbbells;
        const hasKB = profile.equipment.kettlebells;
        const hasBench = profile.equipment.bench;
        const hasPullup = profile.equipment.pullUpBar;

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
        const useHeavyDutyRegion =
          regionApproach === "heavy_duty" || String(regionApproach) === "mentzer";
        const useHypertrophy =
          regionApproach === "hypertrophy" ||
          (approaches.includes("hypertrophy") && !useHeavyDutyRegion);
        const useStrength = regionApproach === "strength";
        const hardSets = useHeavyDutyRegion ? 1 : useHypertrophy ? 3 : useStrength ? 4 : 2;
        const repGuide = useHeavyDutyRegion
          ? "6–10"
          : useHypertrophy
            ? "8–12"
            : useStrength
              ? "3–6"
              : "6–12";
        const regionLabel = labelApproach(String(regionApproach || "strength"));

        let exercises: { name: string; sets: number; reps: string; notes?: string }[] = [];
        let title = "";
        let description = "";

        if (isUpperFocus) {
          title = `Upper – ${regionLabel}`;
          description = useHeavyDutyRegion
            ? `${regionLabel} (upper): warm-up, then ${hardSets} hard set(s). Day budget ${dayMin} min.${customSplit.raw ? ` Custom: ${customSplit.raw}.` : ""}`
            : `${regionLabel} (upper): ${hardSets} sets @ ${repGuide}. Day budget ${dayMin} min.${customSplit.raw ? ` Custom: ${customSplit.raw}.` : ""}`;
          exercises = [];
          if (hasBarbell && hasBench) {
            exercises.push({
              name: focusChest ? "Incline Barbell Press" : "Barbell Bench Press",
              sets: hardSets,
              reps: repGuide,
              notes: useHeavyDutyRegion ? "Warm-up then hard set(s)." : "Chest emphasis if selected.",
            });
          } else if (hasDB && hasBench) {
            exercises.push({
              name: focusChest ? "Incline DB Press" : "DB Bench Press",
              sets: hardSets,
              reps: repGuide,
            });
          }
          if (hasPullup) {
            exercises.push({ name: "Pull-Ups or Lat Pulldown", sets: hardSets, reps: repGuide });
          } else if (hasDB || hasKB) {
            exercises.push({ name: "One-Arm Row", sets: hardSets, reps: repGuide });
          }
          if (focusArms || true) {
            if (hasDB) {
              exercises.push({ name: "DB Curl", sets: Math.min(hardSets, 2), reps: repGuide, notes: "Arms." });
              exercises.push({ name: "Overhead Triceps Extension", sets: Math.min(hardSets, 2), reps: repGuide, notes: "Arms." });
            }
          }
          if (!exercises.length) {
            exercises.push({ name: "Push-Ups", sets: hardSets, reps: repGuide });
            exercises.push({ name: "Bodyweight Rows", sets: hardSets, reps: repGuide });
          }
        } else {
          title = `Lower – ${regionLabel}`;
          description = useHeavyDutyRegion
            ? `${regionLabel} (lower): hard sets after warm-up. Day budget ${dayMin} min. Protect legs for long run.`
            : `${regionLabel} (lower): ${hardSets} sets @ ${repGuide}. Day budget ${dayMin} min.`;
          exercises = [];
          if (hasBarbell) {
            exercises.push({
              name: "Back Squat or Goblet Squat",
              sets: hardSets,
              reps: repGuide,
              notes: "Leave 1–2 RIR if long run is next day.",
            });
          } else if (hasDB || hasKB) {
            exercises.push({ name: "Goblet Squat", sets: hardSets, reps: repGuide });
          }
          if (hasBarbell) {
            exercises.push({ name: "Romanian Deadlift", sets: hardSets, reps: repGuide });
          } else if (hasDB) {
            exercises.push({ name: "DB RDL", sets: hardSets, reps: repGuide });
          }
          exercises.push({ name: "Core (Dead Bug / Side Plank)", sets: 2, reps: "8–12 or 30s" });
        }

        if (isDeload) {
          exercises = exercises.map((e) => ({
            ...e,
            notes: (e.notes || "") + " Deload – reduce load ~20–30%.",
          }));
        }

        const sDur = Math.min(45, dayMin);
        workouts.push(
          createWorkout(
            format(addDays(weekStart, sD), "yyyy-MM-dd"),
            "hypertrophy",
            "strength",
            title,
            description,
            { plannedDurationMin: sDur, exercises }
          )
        );
        book(sD, sDur);
        sPlaced++;
      }
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
      (profile.runningBaseline as any)?.preferredLongRunDay != null
        ? `Preferred long-run day: ${DAY_KEYS[Number((profile.runningBaseline as any).preferredLongRunDay)] || "auto"} (moved if that day has too little time).`
        : `Preferred long-run day: auto (day with most hours).`,
      isRunner
        ? `Running: sessions only on days with hours > 0; each duration ≤ that day's minutes; long run on longest day (≤ ${maxAvailMin} min). Volume anchor ${weeklyKm || "n/a"} km.`
        : "Running: not selected.",
      doesStrength
        ? `Strength: ${strengthDays} day(s)/week · ${approachLabels.join("; ") || "Default"} · also capped to daily minutes.`
        : "Strength: not selected.",
    ].filter(Boolean).join(" "),
  };
}
