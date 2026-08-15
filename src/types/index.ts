export type Sport = "running" | "trail_running" | "strength" | "cycling" | "swimming" | "other";

export type GoalType =
  | "race"
  | "distance"
  | "time"
  | "strength"
  | "hypertrophy"
  | "general_fitness"
  | "weight_loss"
  | "endurance"
  | "custom";

export interface Goal {
  id: string;
  type: GoalType;
  title: string;
  description?: string;
  targetDate?: string; // ISO
  priority: 1 | 2 | 3 | 4 | 5; // 5 = highest
  sport?: Sport;
  metrics?: {
    distanceKm?: number;
    timeMinutes?: number;
    weightKg?: number;
    reps?: number;
    other?: string;
  };
}

export interface HRZones {
  maxHR: number;
  restingHR: number;
  zones: {
    z1: [number, number]; // recovery
    z2: [number, number]; // aerobic
    z3: [number, number]; // tempo
    z4: [number, number]; // threshold
    z5: [number, number]; // anaerobic / VO2
  };
}

export interface Equipment {
  gymAccess: boolean;
  homeGym: boolean;
  freeWeights: boolean;
  machines: boolean;
  resistanceBands: boolean;
  pullUpBar: boolean;
  treadmill: boolean;
  trailAccess: boolean;
  other: string[];
}

export interface AthleteProfile {
  name: string;
  experienceLevel: "beginner" | "intermediate" | "advanced" | "elite";
  sports: Sport[];
  primarySport: Sport;
  goals: Goal[];
  hrZones: HRZones;
  equipment: Equipment;
  weeklyAvailability: {
    monday: number; // hours
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
  };
  constraints: string; // injuries, preferences, etc.
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkoutType =
  | "easy_run"
  | "long_run"
  | "tempo"
  | "intervals"
  | "hill_repeats"
  | "trail_run"
  | "recovery"
  | "strength"
  | "hypertrophy"
  | "power"
  | "mobility"
  | "rest"
  | "cross_training";

export interface Workout {
  id: string;
  date: string; // ISO date
  type: WorkoutType;
  sport: Sport;
  title: string;
  description: string;
  plannedDurationMin?: number;
  plannedDistanceKm?: number;
  plannedIntensity?: "z1" | "z2" | "z3" | "z4" | "z5" | "mixed";
  // Strength specific
  exercises?: {
    name: string;
    sets: number;
    reps: string; // e.g. "8-12" or "5"
    load?: string;
    notes?: string;
  }[];
  // Completed data (from Garmin/Strava or manual)
  completed?: boolean;
  actualDurationMin?: number;
  actualDistanceKm?: number;
  avgHR?: number;
  maxHR?: number;
  avgPace?: string;
  rpe?: number; // 1-10
  notes?: string;
  source?: "planned" | "garmin" | "strava" | "manual";
  externalId?: string;
}

export interface TrainingPlan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  basedOnProfileSnapshot: Partial<AthleteProfile>;
  workouts: Workout[];
  weeklyStructure: string;
  notes: string;
}

export interface ProgressSnapshot {
  date: string;
  estimatedFitness: number; // arbitrary score
  consistency: number; // 0-100
  volumeLoad: number;
  strengthProgress?: number;
  notes?: string;
}
