export type Sport =
  | "running"
  | "trail_running"
  | "strength"
  | "hypertrophy"
  | "conditioning"
  | "cycling"
  | "swimming"
  | "triathlon"
  | "crossfit"
  | "other";

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

export type TrainingApproach =
  | "heavy_duty"
  | "strength"
  | "hypertrophy"
  | "functional"
  | "custom";

export interface Goal {
  id: string;
  type: GoalType;
  title: string;
  description?: string;
  targetDate?: string;
  priority: 1 | 2 | 3 | 4 | 5;
  sport?: Sport;
  metrics?: {
    distanceKm?: number;
    timeMinutes?: number;
    paceMinPerKm?: number;
    weightKg?: number;
    reps?: number;
    other?: string;
  };
}

export interface HRZones {
  maxHR: number;
  restingHR: number;
  zones: {
    z1: [number, number];
    z2: [number, number];
    z3: [number, number];
    z4: [number, number];
    z5: [number, number];
  };
}

export interface Equipment {
  gymAccess: boolean;
  homeGym?: boolean;
  outdoorAccess?: boolean;
  trailAccess: boolean;
  barbell: boolean;
  dumbbells: boolean;
  kettlebells: boolean;
  weightPlates: boolean;
  rack: boolean;
  bench: boolean;
  pullUpBar: boolean;
  dipBars: boolean;
  parallettes?: boolean;
  legExtension?: boolean;
  legCurl?: boolean;
  machines: boolean;
  cableMachine: boolean;
  treadmill: boolean;
  indoorBike: boolean;
  rower: boolean;
  resistanceBands: boolean;
  weightedVest: boolean;
  plyoBox: boolean;
  medicineBall?: boolean;
  other: string[];
}

export interface RunningBaseline {
  experience: "beginner" | "intermediate" | "advanced" | "elite";
  weeklyVolumeKm: number;
  longestRunLast30DaysKm: number;
  preferredSurface: "road" | "trail" | "mixed";
  /** 0=Mon … 6=Sun (same as plan generator). Availability still wins. */
  preferredLongRunDay?: number | null;
}

export interface StrengthBaseline {
  experience: "beginner" | "intermediate" | "advanced" | "elite";
  trainingApproaches: TrainingApproach[]; // multi-select
  trainingApproachOther?: string;
  physiquePriorities: string[];
  physiqueOther?: string;
  preferredStyle: string;
}

export interface AthleteProfile {
  name: string;
  age?: number;
  gender?: "male" | "female" | "other" | "prefer_not";
  fitnessLevel: "beginner" | "intermediate" | "advanced" | "elite";
  sports: Sport[];
  sportPriorities: { sport: Sport; priority: number }[];
  primarySport: Sport;
  secondarySport?: Sport;
  customSportsList?: string[]; // submitted custom sports
  trainingDaysPerWeek?: number;
  goals: Goal[];
  hrZones: HRZones;
  equipment: Equipment;
  weeklyAvailability: {
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
  };
  runningBaseline?: RunningBaseline;
  strengthBaseline?: StrengthBaseline;
  constraints: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  experienceLevel: "beginner" | "intermediate" | "advanced" | "elite";
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
  date: string;
  type: WorkoutType;
  sport: Sport;
  title: string;
  description: string;
  plannedDurationMin?: number;
  plannedDistanceKm?: number;
  plannedIntensity?: "z1" | "z2" | "z3" | "z4" | "z5" | "mixed";
  exercises?: {
    name: string;
    sets: number;
    reps: string;
    load?: string;
    notes?: string;
  }[];
  completed?: boolean;
  actualDurationMin?: number;
  actualDistanceKm?: number;
  avgHR?: number;
  maxHR?: number;
  avgPace?: string;
  rpe?: number;
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
  estimatedFitness: number;
  consistency: number;
  volumeLoad: number;
  strengthProgress?: number;
  notes?: string;
}
