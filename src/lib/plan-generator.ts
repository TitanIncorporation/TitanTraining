import { AthleteProfile, TrainingPlan, Workout, WorkoutType, Sport, Goal } from "@/types";
import { addDays, format, startOfWeek, addWeeks } from "date-fns";

function uid() {
  return Math.random().toString(36).slice(2, 11);
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
  const useHeavyDuty =
    approaches.includes("heavy_duty") || approaches.includes("mentzer" as any);
  const physique = profile.strengthBaseline?.physiquePriorities || ["general"];
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
              `Warm-up 12–15 min easy.
Main set: ${Math.round(16 + w * 3)} min continuous at tempo effort (high Zone 3 / low Zone 4).
You should finish “comfortably hard”, not destroyed.
Cool-down 8–10 min easy.

Purpose: raise lactate threshold and improve sustainable race pace.`,
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
          `Endurance cornerstone. Mostly Zone 2.
${primaryIsTrail ? "Include elevation when possible. Practice fueling and technical downhill control." : "Practice fueling if longer than 75–80 min."}
Optional: a few 20–30 s pick-ups in the second half if feeling good.

Purpose: fat oxidation, connective tissue resilience, mental durability.
Finish tired but not broken.`,
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

        let exercises: { name: string; sets: number; reps: string; notes?: string }[] = [];
        let title = "";
        let description = "";

        if (isUpperFocus) {
          title = focusChest || focusArms ? "Upper Body – Priority Focus" : "Upper Body – High Intensity";
          description = useHeavyDuty
            ? `Heavy Duty style (from your Baseline approach).
Warm-up thoroughly, then 1 hard working set per exercise (near technical failure).
Rest 2–4 minutes. Progressive overload.
${focusChest ? "Chest emphasized." : ""} ${focusArms ? "Arms emphasized." : ""}`.trim()
            : `Strength session scaled to your Baseline.
Warm-up, then quality working sets. Progressive overload.
${focusChest ? "Chest emphasized." : ""} ${focusArms ? "Arms emphasized." : ""}`.trim();

          exercises = [
            {
              name: hasBarbell && hasBench ? "Incline Barbell Press" : hasDB ? "Incline Dumbbell Press" : "Incline Push-up variation",
              sets: 1,
              reps: "6–10",
              notes: "1 hard working set after warm-up.",
            },
            {
              name: hasBarbell && hasBench ? "Flat Bench Press or Weighted Dip" : hasDB ? "Flat Dumbbell Press" : "Push-up variation",
              sets: 1,
              reps: "6–10",
              notes: "1 hard set.",
            },
            {
              name: hasPullup ? "Pull-up or Chin-up" : hasBarbell ? "Barbell Row" : "Dumbbell / Band Row",
              sets: 1,
              reps: "6–10",
              notes: "Vertical or horizontal pull. 1 hard set.",
            },
            {
              name: hasDB || hasBarbell ? "Overhead Press" : "Pike Push-up",
              sets: 1,
              reps: "6–10",
            },
            {
              name: hasDB || hasBarbell ? "Biceps Curl (barbell or DB)" : "Band Curl",
              sets: 1,
              reps: "8–12",
              notes: "Direct arm work.",
            },
            {
              name: hasDB || hasBarbell ? "Triceps Extension or Close-grip work" : "Diamond Push-up",
              sets: 1,
              reps: "8–12",
              notes: "Direct arm work.",
            },
          ];
        } else {
          title = "Full Body / Lower Emphasis – High Intensity";
          description = `High-intensity, low-volume approach.
Keep lower-body work controlled so it does not compromise the next long run.
1 hard working set per exercise after warm-up.`;

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
    weeklyStructure: `Polarized running (≥80% easy). Strength on Heavy Duty / low-volume principles. Deload in final week. Scaled to ${exp} level and ~${hours.toFixed(1)}h available.`,
    notes: `${previousPlan ? "Updated from Baseline + history." : "From Baseline."} Focus: ${goalSummary || "general"}. ${runDays} run / ${strengthDays} strength sessions per week · ${approaches[0] || "strength"} · ${trainingDays} days available.`,
  };
}
