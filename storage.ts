import { AthleteProfile, TrainingPlan, Workout } from "@/types";

const PROFILE_KEY = "titan_profile";
const PLAN_KEY = "titan_current_plan";
const WORKOUTS_KEY = "titan_workouts";
const DATA_VERSION = 1;

/** Full app data shape – used for export/import and future cloud sync */
export interface TitanData {
  version: number;
  exportedAt: string;
  profile: AthleteProfile | null;
  plan: TrainingPlan | null;
  workouts: Workout[];
}

// ---------- Local storage helpers ----------

export function loadProfile(): AthleteProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: AthleteProfile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadPlan(): TrainingPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePlan(plan: TrainingPlan) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
}

export function loadWorkouts(): Workout[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKOUTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWorkouts(workouts: Workout[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WORKOUTS_KEY, JSON.stringify(workouts));
}

// ---------- Full data (for export / import / future cloud) ----------

export function loadAllData(): TitanData {
  return {
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    profile: loadProfile(),
    plan: loadPlan(),
    workouts: loadWorkouts(),
  };
}

export function saveAllData(data: TitanData) {
  if (data.profile) saveProfile(data.profile);
  else localStorage.removeItem(PROFILE_KEY);

  if (data.plan) savePlan(data.plan);
  else localStorage.removeItem(PLAN_KEY);

  saveWorkouts(data.workouts || []);
}

/** Download all data as a JSON file */
export function exportData() {
  const data = loadAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `titan-training-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import data from a previously exported JSON file */
export function importData(file: File): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as TitanData;
        if (!data || typeof data !== "object") {
          resolve({ ok: false, message: "Invalid file format" });
          return;
        }
        // Basic validation
        if (data.version > DATA_VERSION) {
          resolve({
            ok: false,
            message: "This backup was created with a newer version of Titan Training",
          });
          return;
        }
        saveAllData(data);
        resolve({ ok: true, message: "Data imported successfully. Reloading…" });
      } catch {
        resolve({ ok: false, message: "Could not read the file. Make sure it is a valid Titan Training backup." });
      }
    };
    reader.onerror = () =>
      resolve({ ok: false, message: "Failed to read the file" });
    reader.readAsText(file);
  });
}

/** Clear all local data */
export function clearAllData() {
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(PLAN_KEY);
  localStorage.removeItem(WORKOUTS_KEY);
}
