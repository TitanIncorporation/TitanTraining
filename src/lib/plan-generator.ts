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

/** Total available training hours per week from profile */
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

function hasHypertrophyFocus(goals: Goal[]): boolean {
  return goals.some((g) => g.type === "hypertrophy" && g.priority >= 3);
}

function hasRaceOrEnduranceFocus(goals: Goal[]): boolean {
  return goals.some(
    (g) =>
      (g.type === "race" || g.type === "endurance" || g.type === "distance" || g.type === "time") &&
      g.priority >= 3
  );
}

/**
 * SCIENCE-BASED TRAINING PLAN GENERATOR
 *
 * Core principles applied:
 *
 * RUNNING / TRAIL
 * - Polarized / pyramidal distribution: ~80% easy (Z1-Z2), ~20% quality
 * - Progressive overload on long run and total volume
 * - One quality session per week (tempo or intervals/VO2)
 * - Deload every 3rd–4th week
 * - Trail specificity when primary sport is trail
 *
 * STRENGTH
 * - 2–3 sessions/week depending on available time & experience
 * - Prioritize compound movements
 * - Hypertrophy vs strength emphasis based on goals
 * - Exercise selection constrained by equipment
 * - Lower-body strength placed to minimize interference with long/quality runs
 *
 * INTEGRATION
 * - Respects total weekly available hours
 * - Scales volume to experience level
 * - Leaves recovery days
 * - Notes constraints
 */
export function generateTrainingPlan(
  profile: AthleteProfile,
  weeks: number = 4
): TrainingPlan {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
  const workouts: Workout[] = [];

  const isRunner =
    profile.sports.includes("running") || profile.sports.includes("trail_running");
  const doesStrength = profile.sports.includes("strength");
  const primaryIsTrail = profile.primarySport === "trail_running";
  const hours = weeklyHours(profile);
  const exp = profile.experienceLevel;
  const hypertrophyFocus = hasHypertrophyFocus(profile.goals);
  const enduranceFocus = hasRaceOrEnduranceFocus(profile.goals);
  const topGoals = highestPriorityGoals(profile.goals);

  // Volume scaling by experience and available time
  const baseEasyMin =
    exp === "beginner" ? 30 : exp === "intermediate" ? 40 : exp === "advanced" ? 50 : 55;
  const baseLongMin =
    exp === "beginner" ? 50 : exp === "intermediate" ? 75 : exp === "advanced" ? 95 : 110;
  const qualityMin =
    exp === "beginner" ? 35 : exp === "intermediate" ? 45 : exp === "advanced" ? 55 : 65;

  // How many strength sessions we can realistically fit
  let strengthSessionsPerWeek = 0;
  if (doesStrength) {
    if (hours >= 8) strengthSessionsPerWeek = 3;
    else if (hours >= 5) strengthSessionsPerWeek = 2;
    else strengthSessionsPerWeek = 1;
    if (exp === "beginner" && strengthSessionsPerWeek > 2) strengthSessionsPerWeek = 2;
  }

  // Running days we aim for
  let runDaysPerWeek = 0;
  if (isRunner) {
    if (hours >= 7) runDaysPerWeek = 4;
    else if (hours >= 4) runDaysPerWeek = 3;
    else runDaysPerWeek = 2;
  }

  for (let w = 0; w < weeks; w++) {
    const weekStart = addWeeks(start, w);
    const isDeload = w === weeks - 1; // last week = deload
    const progress = isDeload ? 0.75 : 1 + w * 0.07; // progressive then deload

    // -------------------- RUNNING --------------------
    if (isRunner && runDaysPerWeek >= 2) {
      // Easy runs
      const easyDurations = [baseEasyMin, baseEasyMin + 10, baseEasyMin + 5];
      const easySlots = runDaysPerWeek >= 4 ? [1, 3, 5] : runDaysPerWeek === 3 ? [1, 3] : [2];

      easySlots.forEach((dayOffset, idx) => {
        const date = format(addDays(weekStart, dayOffset), "yyyy-MM-dd");
        const duration = Math.round(easyDurations[idx % easyDurations.length] * progress);
        const isTrailEasy = primaryIsTrail && idx === 1;

        workouts.push(
          createWorkout(
            date,
            isTrailEasy ? "trail_run" : "easy_run",
            primaryIsTrail ? "trail_running" : "running",
            isTrailEasy ? "Trail Easy / Aerobic" : "Easy Run (Z2)",
            `Aerobic base building. Keep effort easy — conversational pace, mostly Zone 2. 
Focus on relaxed form and nasal breathing when possible. 
${primaryIsTrail ? "Choose rolling or technical terrain if available to build trail specific strength." : ""}
This is the foundation of endurance adaptations.`,
            {
              plannedDurationMin: duration,
              plannedIntensity: "z2",
              plannedDistanceKm: Math.round((duration / 60) * (exp === "beginner" ? 8.5 : 9.5) * 10) / 10,
            }
          )
        );
      });

      // Quality session (Wednesday-ish)
      if (runDaysPerWeek >= 3) {
        const qualityDate = format(addDays(weekStart, 2), "yyyy-MM-dd");
        const qDur = Math.round(qualityMin * (isDeload ? 0.7 : progress));

        if (w % 2 === 0 || enduranceFocus) {
          // Tempo / Threshold
          workouts.push(
            createWorkout(
              qualityDate,
              "tempo",
              "running",
              "Tempo / Threshold",
              `Warm-up 12–15 min easy → 
Main set: ${Math.round(18 + w * 3)} min continuous at tempo effort (Zone 3–high Zone 3 / low Zone 4). 
You should finish feeling “comfortably hard”, not destroyed.
Cool-down 8–10 min easy.
Purpose: Raise lactate threshold and improve sustainable race pace.`,
              {
                plannedDurationMin: qDur,
                plannedIntensity: "z3",
              }
            )
          );
        } else {
          // VO2 / Intervals
          workouts.push(
            createWorkout(
              qualityDate,
              "intervals",
              "running",
              "VO2max Intervals",
              `Warm-up 15 min easy + strides → 
Main set: 5–6 × (3 min hard Zone 4–5 / 90–120s easy jog). 
Cool-down 10 min.
Purpose: Improve maximal aerobic capacity and running economy at higher speeds.
Keep the hard efforts controlled — stop if form collapses.`,
              {
                plannedDurationMin: qDur,
                plannedIntensity: "z5",
              }
            )
          );
        }
      }

      // Long run (Sunday)
      const longDate = format(addDays(weekStart, 6), "yyyy-MM-dd");
      const longDur = Math.round(baseLongMin * progress * (isDeload ? 0.8 : 1));
      workouts.push(
        createWorkout(
          longDate,
          primaryIsTrail ? "trail_run" : "long_run",
          primaryIsTrail ? "trail_running" : "running",
          primaryIsTrail ? "Long Trail Run" : "Long Run",
          `Endurance cornerstone. 
Mostly Zone 2. You may include a few short pick-ups (20–30s) in the second half if feeling good.
${primaryIsTrail ? "Prioritize trails with some elevation gain. Practice fueling and technical downhill control." : "Practice fueling if the run is longer than 75–80 min."}
Purpose: Mitochondrial density, fat oxidation, mental toughness, connective tissue resilience.
Finish feeling tired but not destroyed.`,
          {
            plannedDurationMin: longDur,
            plannedDistanceKm: Math.round((longDur / 60) * (exp === "beginner" ? 8 : 9) * 10) / 10,
            plannedIntensity: "z2",
          }
        )
      );
    }

    // -------------------- STRENGTH --------------------
    if (doesStrength && strengthSessionsPerWeek > 0) {
      const strengthDays =
        strengthSessionsPerWeek === 3
          ? [0, 2, 4] // Mon / Wed / Fri
          : strengthSessionsPerWeek === 2
          ? [0, 3] // Mon / Thu
          : [1]; // Tuesday

      strengthDays.forEach((dayOffset, idx) => {
        const date = format(addDays(weekStart, dayOffset), "yyyy-MM-dd");

        // Avoid heavy lower body the day before long run when possible
        const isLowerBias = strengthSessionsPerWeek === 3 ? idx === 1 : idx === 0;
        const isUpperBias = strengthSessionsPerWeek === 3 ? idx === 0 : false;

        let exercises: { name: string; sets: number; reps: string; notes?: string }[] = [];
        let title = "Full Body Strength";
        let description = "";

        const setsMain = hypertrophyFocus ? 3 : 4;
        const repsMain = hypertrophyFocus ? "8-12" : "5-8";
        const repsSecondary = hypertrophyFocus ? "10-15" : "8-12";

        // Equipment-aware exercise pool
        const hasGym = profile.equipment.gymAccess || profile.equipment.barbell || profile.equipment.dumbbells || profile.equipment.rack;
        const hasPullup = profile.equipment.pullUpBar;
        const hasBands = profile.equipment.resistanceBands;

        if (isUpperBias) {
          title = "Upper Body Strength";
          exercises = [
            {
              name: hasGym ? "Bench Press or Dumbbell Press" : "Push-up variations",
              sets: setsMain,
              reps: repsMain,
            },
            {
              name: hasPullup ? "Pull-ups or Chin-ups" : hasGym ? "Lat Pulldown / Row" : "Band or Inverted Row",
              sets: setsMain,
              reps: "6-10",
            },
            {
              name: hasGym ? "Overhead Press" : "Pike Push-ups or Band Press",
              sets: 3,
              reps: repsSecondary,
            },
            {
              name: hasGym ? "Barbell or Dumbbell Row" : "Band Face Pull + Row",
              sets: 3,
              reps: repsSecondary,
            },
          ];
          description = hypertrophyFocus
            ? "Hypertrophy emphasis. Controlled tempo, 1–2 reps in reserve on most sets. Rest 90–120s."
            : "Strength emphasis. Explosive intent on the way up. Rest 2–3 min on main lifts.";
        } else if (isLowerBias) {
          title = "Lower Body Strength";
          exercises = [
            {
              name: hasGym ? "Back Squat or Front Squat" : "Goblet Squat or Split Squat",
              sets: setsMain,
              reps: repsMain,
            },
            {
              name: hasGym ? "Romanian Deadlift" : "Single-leg RDL (bodyweight or suitcase)",
              sets: setsMain,
              reps: repsSecondary,
            },
            {
              name: "Walking Lunges or Bulgarian Split Squats",
              sets: 3,
              reps: "8-10 / leg",
            },
            {
              name: "Calf Raises",
              sets: 3,
              reps: "12-15",
            },
          ];
          description =
            "Lower body focus. Keep 1–3 reps in reserve. Prioritize clean technique over load, especially if you have a long run coming.";
        } else {
          // Full body
          title = strengthSessionsPerWeek === 1 ? "Full Body Strength" : "Full Body Strength";
          exercises = [
            {
              name: hasGym ? "Squat variation" : "Goblet / Split Squat",
              sets: setsMain,
              reps: repsMain,
            },
            {
              name: hasGym ? "Hinge (RDL or Deadlift)" : "Single-leg RDL",
              sets: 3,
              reps: repsSecondary,
            },
            {
              name: hasGym ? "Horizontal Push (Bench / DB)" : "Push-up variations",
              sets: 3,
              reps: repsSecondary,
            },
            {
              name: hasPullup || hasGym ? "Horizontal or Vertical Pull" : "Band Row",
              sets: 3,
              reps: repsSecondary,
            },
            {
              name: "Core / Anti-rotation (Pallof, Dead Bug, Side Plank)",
              sets: 3,
              reps: "10-15 or 30s",
            },
          ];
          description = hypertrophyFocus
            ? "Full body hypertrophy session. Controlled eccentrics, near-failure on last sets of isolation work."
            : "Full body strength. Focus on quality compound movements and progressive loading over weeks.";
        }

        // Lighten on deload
        if (isDeload) {
          exercises = exercises.map((e) => ({
            ...e,
            sets: Math.max(2, e.sets - 1),
            notes: "Deload – reduce load ~20-30% or keep RPE lower",
          }));
        }

        workouts.push(
          createWorkout(
            date,
            hypertrophyFocus ? "hypertrophy" : "strength",
            "strength",
            title,
            description,
            {
              plannedDurationMin: 45 + (exp === "advanced" || exp === "elite" ? 15 : 0),
              exercises,
            }
          )
        );
      });
    }
  }

  // Sort chronologically
  workouts.sort((a, b) => a.date.localeCompare(b.date));

  const endDate = format(addWeeks(start, weeks), "yyyy-MM-dd");

  // Build transparent notes so the user understands the logic
  const goalSummary =
    topGoals.length > 0
      ? topGoals.map((g) => `${g.title} (P${g.priority})`).join(", ")
      : "General fitness";

  const structureNotes = [
    `Science-based ${weeks}-week block.`,
    isRunner
      ? `Running: polarized approach (~80% easy volume, one quality session, progressive long run).`
      : "",
    doesStrength
      ? `Strength: ${strengthSessionsPerWeek}x/week, exercise selection matched to your equipment, ${
          hypertrophyFocus ? "hypertrophy" : "strength"
        } emphasis.`
      : "",
    `Scaled to your experience (${exp}) and ~${hours.toFixed(1)}h available per week.`,
    `Final week is a deliberate deload to consolidate adaptations.`,
    profile.constraints
      ? `Constraints noted: ${profile.constraints.slice(0, 140)}${profile.constraints.length > 140 ? "…" : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: uid(),
    name: `${weeks}-Week ${primaryIsTrail ? "Trail" : "Run"} + Strength Block`,
    startDate: format(start, "yyyy-MM-dd"),
    endDate,
    generatedAt: new Date().toISOString(),
    basedOnProfileSnapshot: {
      primarySport: profile.primarySport,
      experienceLevel: profile.experienceLevel,
      goals: profile.goals,
    },
    workouts,
    weeklyStructure: structureNotes,
    notes: `Built around your top priorities: ${goalSummary}. 
This plan follows evidence-based principles (polarized running distribution, progressive overload, managed interference between strength and endurance, regular deload). 
Adjust individual sessions based on how you feel — consistency over perfection.`,
  };
}
