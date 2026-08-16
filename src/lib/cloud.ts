import { supabase } from "./supabase";
import type { AthleteProfile, TrainingPlan, Workout } from "@/types";

export type CloudResult = { ok: true } | { ok: false; message: string };

async function requireUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Profile → database (required when logged in) */
export async function cloudSaveProfile(profile: AthleteProfile): Promise<CloudResult> {
  const uid = await requireUserId();
  if (!uid) return { ok: false, message: "Not signed in" };

  const { error } = await supabase.from("profiles").upsert({
    id: uid,
    data: profile,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return {
      ok: false,
      message:
        error.message.includes("data") || error.message.includes("schema")
          ? "Database missing profiles.data column. Run supabase/setup.sql in Supabase SQL Editor."
          : error.message,
    };
  }
  return { ok: true };
}

export async function cloudLoadProfile(): Promise<AthleteProfile | null> {
  const uid = await requireUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("data")
    .eq("id", uid)
    .maybeSingle();
  if (error || !data?.data) return null;
  return data.data as AthleteProfile;
}

/** Plan → database */
export async function cloudSavePlan(plan: TrainingPlan): Promise<CloudResult> {
  const uid = await requireUserId();
  if (!uid) return { ok: false, message: "Not signed in" };

  const { error } = await supabase.from("training_plans").upsert({
    id: plan.id,
    user_id: uid,
    data: plan,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return {
      ok: false,
      message:
        error.message.includes("schema") || error.message.includes("does not exist")
          ? "Database missing training_plans table. Run supabase/setup.sql."
          : error.message,
    };
  }
  return { ok: true };
}

export async function cloudLoadLatestPlan(): Promise<TrainingPlan | null> {
  const uid = await requireUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("training_plans")
    .select("data")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error || !data?.[0]?.data) return null;
  return data[0].data as TrainingPlan;
}

/** Workouts batch → database (planned + completed; Strava later same table/source) */
export async function cloudSaveWorkouts(workouts: Workout[]): Promise<CloudResult> {
  const uid = await requireUserId();
  if (!uid) return { ok: false, message: "Not signed in" };
  if (!workouts.length) return { ok: true };

  const rows = workouts.map((w) => ({
    id: w.id,
    user_id: uid,
    data: w,
    date: w.date,
    source: w.source || "planned",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("workouts").upsert(rows);
  if (error) {
    return {
      ok: false,
      message:
        error.message.includes("schema") || error.message.includes("does not exist")
          ? "Database missing workouts table. Run supabase/setup.sql."
          : error.message,
    };
  }
  return { ok: true };
}

/** Save plan + all its workouts in one go */
export async function cloudSavePlanAndWorkouts(plan: TrainingPlan): Promise<CloudResult> {
  const p = await cloudSavePlan(plan);
  if (!p.ok) return p;
  return cloudSaveWorkouts(plan.workouts || []);
}
