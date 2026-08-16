import { AthleteProfile, TrainingPlan, Workout, WorkoutType, Sport, Goal } from "@/types";
import { addDays, format, startOfWeek, addWeeks, parseISO } from "date-fns";

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

/** Max 3 lines + constraint callouts */
function buildPlanNotes(o: {
  goalSummary: string;
  goalDateLine?: string;
  phaseLabel?: string;
  sport1: string | null;
  sport2: string | null;
  isRunner: boolean;
  doesStrength: boolean;
  runDays: number;
  strengthDays: number;
  hours: number;
  maxAvailMin: number;
  hasMarathonGoal: boolean;
  constraintWarnings: string[];
  profileConstraints: string;
  previousPlan: boolean;
}): string {
  const sports = [o.sport1, o.sport2].filter(Boolean).join(" + ") || "training";
  const goalBit = o.goalDateLine
    ? `${o.goalSummary} (${o.goalDateLine})`
    : o.goalSummary;
  const phaseBit = o.phaseLabel ? ` · ${o.phaseLabel}` : "";
  const line1 = `${goalBit}${phaseBit} · ${sports}.`;
  const line2 = o.isRunner
    ? `Up to ${o.runDays} run day(s)/week` +
      (o.doesStrength ? ` + ${o.strengthDays} strength` : "") +
      ` · ~${o.hours.toFixed(1)} h/wk · 1 session/day, capped to daily hours.`
    : o.doesStrength
      ? `${o.strengthDays} strength day(s)/week · ~${o.hours.toFixed(1)} h/wk · capped to daily hours.`
      : `~${o.hours.toFixed(1)} h/wk capacity.`;
  const callouts: string[] = [];
  if (o.profileConstraints) {
    callouts.push(`Constraint: ${o.profileConstraints}`);
  }
  for (const w of o.constraintWarnings) {
    if (w && !callouts.includes(w)) callouts.push(w);
  }
  if (o.hasMarathonGoal && (o.hours < 5 || o.maxAvailMin < 75)) {
    callouts.push(
      "Constraint callout: A marathon-level goal with the current availability is not compatible with standard long-run progression. Sessions are capped to your stated availability."
    );
  }
  const lines = [line1, line2, ...callouts].filter(Boolean);
  return lines.join("\n");
}

export function generateTrainingPlan(
  profile: AthleteProfile,
  weeksInput: number = 4,
  previousPlan?: TrainingPlan
): TrainingPlan {
  let weeks = weeksInput;
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
  // Dated objectives (race / goal with targetDate) drive block length & phase
  // Only TOP-priority dated goal drives periodization (taper/peak).
  // Other dated races = training stimuli (B/C races), not full tapers — avoids monthly taper trap.
  const allDated = (profile.goals || [])
    .filter((g) => g.targetDate)
    .map((g) => ({
      goal: g,
      daysOut: Math.ceil(
        (parseISO(g.targetDate as string).getTime() - new Date().setHours(0, 0, 0, 0)) /
          (1000 * 60 * 60 * 24)
      ),
    }))
    .filter((x) => x.daysOut >= 0);

  const maxPriority = (profile.goals || []).reduce(
    (m, g) => Math.max(m, g.priority || 0),
    0
  );
  // Top tier: highest priority among goals that have a date; if none dated at max, use highest dated priority
  const datedMaxP = allDated.reduce((m, x) => Math.max(m, x.goal.priority || 0), 0);
  const primaryDated =
    allDated
      .filter((x) => x.goal.priority === datedMaxP && datedMaxP > 0)
      .sort((a, b) => a.daysOut - b.daysOut)[0] || null;

  // Secondary dated events (not the A-goal) → treat as training races inside the block
  const trainingRaces = allDated.filter(
    (x) => !primaryDated || x.goal.id !== primaryDated.goal.id
  );

  const weeksToGoal = primaryDated
    ? Math.max(1, Math.ceil(primaryDated.daysOut / 7))
    : null;
  if (weeksToGoal != null) {
    weeks = Math.min(Math.max(weeks, 1), Math.min(8, weeksToGoal));
    if (weeksToGoal <= 4) weeks = Math.min(weeksToGoal, 4);
  }
  type Phase = "base" | "build" | "peak" | "taper" | "race" | "general";
  let trainingPhase: Phase = "general";
  if (weeksToGoal != null) {
    if (weeksToGoal <= 1) trainingPhase = "race";
    else if (weeksToGoal <= 3) trainingPhase = "taper";
    else if (weeksToGoal <= 8) trainingPhase = "peak";
    else if (weeksToGoal <= 16) trainingPhase = "build";
    else trainingPhase = "base";
  }
  const phaseLabel =
    trainingPhase === "general"
      ? undefined
      : trainingPhase === "race"
        ? "Race week (A-goal)"
        : trainingPhase === "taper"
          ? `Taper to A-goal · ${weeksToGoal} wk`
          : trainingPhase === "peak"
            ? `Peak toward A-goal · ${weeksToGoal} wk`
            : trainingPhase === "build"
              ? `Build toward A-goal · ${weeksToGoal} wk`
              : `Base · ${weeksToGoal} wk to A-goal`;
  const goalDateLine = primaryDated
    ? format(parseISO(primaryDated.goal.targetDate as string), "d MMM yyyy")
    : undefined;

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
  if (hasMarathonGoal && (hours < 5 || maxDayMin < 75)) {
    constraintWarnings.push(
      "Constraint callout: A marathon-level goal with the current availability is not compatible with standard long-run progression. Sessions are capped to your stated availability."
    );
  }
  if (trainingRaces.length > 0) {
    const names = trainingRaces
      .slice(0, 3)
      .map((t) => t.goal.title)
      .join(", ");
    constraintWarnings.push(
      `Training races (not tapered): ${names}. Treated as hard sessions inside the A-goal plan.`
    );
  } else if (hours > 0 && hours < 3 && isRunner) {
    constraintWarnings.push(
      "Constraint callout: Current weekly availability is low for race-focused volume. Sessions are capped to your stated availability."
    );
  }

  for (let w = 0; w < weeks; w++) {
    const weekStart = addWeeks(start, w);
    // Phase-aware load: taper/race reduce volume; build/peak progress carefully
    let isDeload = w === weeks - 1 && trainingPhase !== "taper" && trainingPhase !== "race";
    if (trainingPhase === "taper") {
      // Progressive volume drop toward race
      isDeload = false;
    }
    let progress = 1 + w * 0.06;
    if (trainingPhase === "taper") {
      progress = Math.max(0.55, 0.9 - w * 0.12);
    } else if (trainingPhase === "race") {
      progress = 0.5;
    } else if (trainingPhase === "peak") {
      progress = 1 + w * 0.04;
    } else if (trainingPhase === "base") {
      progress = 0.85 + w * 0.05;
    }
    if (isDeload) progress = Math.min(progress, 0.75);

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

    // Secondary dated goals = training races (no full taper) — hard long/quality that day only
    for (const tr of trainingRaces) {
      const raceDate = parseISO(tr.goal.targetDate as string);
      const raceWeekStart = startOfWeek(raceDate, { weekStartsOn: 1 });
      if (format(raceWeekStart, "yyyy-MM-dd") !== format(weekStart, "yyyy-MM-dd")) continue;
      const dayOffset = Math.min(6, Math.max(0, Math.round((raceDate.getTime() - weekStart.getTime()) / 86400000)));
      if (usedDays.has(dayOffset)) continue;
      const dayMin = dayBudget[dayOffset] ?? dayAvailabilityMin(profile, dayOffset);
      if (dayMin < 20) continue;
      const raceDur = Math.min(Math.max(dayMin, 30), Math.min(dayMin, Math.round(longBaseCapped * 0.95)));
      const raceTitle = tr.goal.title || "Training race";
      workouts.push(
        createWorkout(
          format(raceDate, "yyyy-MM-dd"),
          primaryIsTrail || (tr.goal.sport || "").includes("trail") ? "trail_run" : "long_run",
          primaryIsTrail ? "trail_running" : "running",
          `Training race · ${raceTitle}`,
          `B/C race used as training (not an A-goal taper). Effort controlled; recover next day. Day budget ${dayMin} min.`,
          {
            plannedDurationMin: raceDur,
            plannedIntensity: "z3",
            plannedDistanceKm: tr.goal.metrics?.distanceKm,
          }
        )
      );
      book(dayOffset, raceDur);
    }

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
              "Constraint callout: Preferred long-run day does not have enough time for a full long run. Session is capped to your stated availability."
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
            "Constraint callout: Preferred long-run day was not usable with current availability; long run was placed on a day with more time."
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

        // Body region title + physique focus (tag = approach, not in title)
        const focusBits: string[] = [];
        if (isUpperFocus) {
          if (focusChest) focusBits.push("Chest focus");
          if (focusArms) focusBits.push("Arms focus");
          if (!focusBits.length) focusBits.push("Upper body");
          else focusBits.unshift("Upper body");
        } else {
          focusBits.push("Lower body");
        }
        const bodyTitle = focusBits.join(" · ");

        if (isUpperFocus) {
          title = bodyTitle;
          description = useHeavyDutyRegion
            ? `${regionLabel}: warm-up, then ${hardSets} hard set(s). Day budget ${dayMin} min.${customSplit.raw ? ` Custom: ${customSplit.raw}.` : ""}`
            : `${regionLabel}: ${hardSets} sets @ ${repGuide}. Day budget ${dayMin} min.${customSplit.raw ? ` Custom: ${customSplit.raw}.` : ""}`;
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
          title = bodyTitle;
          description = useHeavyDutyRegion
            ? `${regionLabel}: hard sets after warm-up. Day budget ${dayMin} min. Protect legs for long run.`
            : `${regionLabel}: ${hardSets} sets @ ${repGuide}. Day budget ${dayMin} min.`;
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
        const ra = String(regionApproach || "strength");
        const strengthType: WorkoutType =
          ra === "heavy_duty" || ra === "mentzer"
            ? "heavy_duty"
            : ra === "hypertrophy"
              ? "hypertrophy"
              : ra === "functional"
                ? "functional"
                : "strength";
        workouts.push(
          createWorkout(
            format(addDays(weekStart, sD), "yyyy-MM-dd"),
            strengthType,
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

  // Keep ALL past & completed sessions; only future planned sessions were regenerated above
  // Never keep brand-new planned sessions in the past
  {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    for (let i = workouts.length - 1; i >= 0; i--) {
      if (workouts[i].date < todayStr && !workouts[i].completed) {
        workouts.splice(i, 1);
      }
    }
  }

  if (previousPlan?.workouts?.length) {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const idSet = new Set(workouts.map((w) => w.id));
    const dateTitle = new Set(workouts.map((w) => w.date + "|" + w.title));
    for (const w of previousPlan.workouts) {
      const isPast = w.date < todayStr;
      const isTodayDone = w.date === todayStr && w.completed;
      if (!(isPast || isTodayDone || w.completed)) continue;
      if (idSet.has(w.id)) continue;
      const key = w.date + "|" + w.title;
      if (dateTitle.has(key)) continue;
      workouts.push(w);
      idSet.add(w.id);
      dateTitle.add(key);
    }
    // Drop any newly generated sessions that fall in the past (should not happen, belt-and-braces)
    const futureOrToday = workouts.filter(
      (w) => w.date >= todayStr || w.completed || w.date < todayStr
    );
    // Prefer: keep past from history; for dates >= today keep new planned unless completed already carried
    workouts.length = 0;
    const past = futureOrToday.filter((w) => w.date < todayStr || w.completed);
    const futureNew = futureOrToday.filter((w) => w.date >= todayStr && !w.completed);
    // Avoid duplicate dates for future: one planned per day from new gen (already enforced in loop)
    const seenFutureDates = new Set<string>();
    for (const w of past) workouts.push(w);
    for (const w of futureNew) {
      if (seenFutureDates.has(w.date + "|" + (w.sport || ""))) continue;
      seenFutureDates.add(w.date + "|" + (w.sport || ""));
      workouts.push(w);
    }
  }

  workouts.sort((a, b) => a.date.localeCompare(b.date));

  const endDate = format(addWeeks(start, weeks), "yyyy-MM-dd");
  const topGoal =
    profile.goals
      .slice()
      .sort((a, b) => b.priority - a.priority)[0] || null;
  const goalSummary = topGoal ? topGoal.title : "General development";
  const sport1 = profile.primarySport
    ? labelApproach(String(profile.primarySport).replace(/_/g, " "))
    : null;
  const sport2 = profile.secondarySport
    ? labelApproach(String(profile.secondarySport).replace(/_/g, " "))
    : profile.sportPriorities
        ?.slice()
        .sort((a, b) => a.priority - b.priority)[1]
        ?.sport
      ? labelApproach(
          String(
            profile.sportPriorities.slice().sort((a, b) => a.priority - b.priority)[1]
              .sport
          ).replace(/_/g, " ")
        )
      : null;

  return {
    id: uid(),
    name: primaryDated
      ? `${weeks}-Week block → ${primaryDated.goal.title}`
      : `${weeks}-Week Evidence-Based Block`,
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
    notes: buildPlanNotes({
      goalSummary,
      goalDateLine,
      phaseLabel,
      sport1,
      sport2,
      isRunner,
      doesStrength,
      runDays,
      strengthDays,
      hours,
      maxAvailMin,
      hasMarathonGoal,
      constraintWarnings,
      profileConstraints: (profile.constraints || "").trim(),
      previousPlan: !!previousPlan,
    }),
    // trainingRaces available for notes via constraintWarnings

  };
}
