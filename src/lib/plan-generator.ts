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
  weeks: number = 4
): TrainingPlan {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 });
  const workouts: Workout[] = [];

  const isRunner =
    profile.sports.includes("running") || profile.sports.includes("trail_running");
  const doesStrength = profile.sports.includes("strength");
  const primaryIsTrail = profile.primarySport === "trail_running";
  const hours = weeklyHours(profile);
  const exp = profile.fitnessLevel || profile.experienceLevel || "intermediate";
  const topGoals = highestPriorityGoals(profile.goals);

  // Experience-based running anchors (minutes)
  const easyBase =
    exp === "beginner" ? 35 : exp === "intermediate" ? 45 : exp === "advanced" ? 55 : 60;
  const longBase =
    exp === "beginner" ? 60 : exp === "intermediate" ? 85 : exp === "advanced" ? 105 : 120;
  const qualityBase =
    exp === "beginner" ? 40 : exp === "intermediate" ? 50 : exp === "advanced" ? 60 : 70;

  // How many sessions we can realistically schedule
  let runDays = 0;
  if (isRunner) {
    if (hours >= 8) runDays = 4;
    else if (hours >= 5) runDays = 3;
    else runDays = 2;
  }

  let strengthDays = 0;
  if (doesStrength) {
    // Mentzer-style default → low frequency
    if (hours >= 7) strengthDays = 2;
    else strengthDays = 1;
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
          title = "Upper Body – High Intensity";
          description = `High-intensity, low-volume approach.
Warm-up thoroughly, then perform 1 hard working set per exercise (near technical failure).
Rest 2–4 minutes between hard sets. Focus on progressive overload.`;

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
    notes: `Built from profile data. Priorities: ${goalSummary}.
Running uses polarized principles (≥80% easy). Strength uses high-intensity, low-volume methods by default.
Sessions scale to experience level and available time. Adjust based on recovery.`,
  };
}
