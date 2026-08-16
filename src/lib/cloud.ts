import { supabase } from "./supabase";
import type { AthleteProfile, TrainingPlan, Workout } from "@/types";

export type CloudResult = { ok: true } | { ok: false; message: string };

function fmtErr(error: { message: string; code?: string; details?: string; hint?: string }): string {
  const parts = [error.message];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.details) parts.push(String(error.details));
  if (error.hint) parts.push(String(error.hint));
  return parts.filter(Boolean).join(" | ");
}

async function requireUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Prefer crypto UUID so id fits uuid columns if needed */
export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function cloudSaveProfile(profile: AthleteProfile): Promise<CloudResult> {
  const uid = await requireUserId();
  if (!uid) return { ok: false, message: "Not signed in" };

  const { error } = await supabase.from("profiles").upsert({
    id: uid,
    data: profile,
    updated_at: new Date().toISOString(),
  });

  if (error) return { ok: false, message: fmtErr(error) };
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

export async function cloudSavePlan(plan: TrainingPlan): Promise<CloudResult> {
  const uid = await requireUserId();
  if (!uid) return { ok: false, message: "Not signed in" };

  // Fits both: structured columns (your table) + full JSON in data
  const row: Record<string, unknown> = {
    id: plan.id,
    user_id: uid,
    name: plan.name,
    start_date: plan.startDate,
    end_date: plan.endDate,
    generated_at: plan.generatedAt || new Date().toISOString(),
    weekly_structure: plan.weeklyStructure || null,
    notes: plan.notes || null,
    data: plan,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("training_plans").upsert(row);
  if (error) return { ok: false, message: fmtErr(error) };
  return { ok: true };
}

export async function cloudLoadLatestPlan(): Promise<TrainingPlan | null> {
  const uid = await requireUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("training_plans")
    .select("data, name, start_date, end_date, generated_at, weekly_structure, notes, id")
    .eq("user_id", uid)
    .order("generated_at", { ascending: false })
    .limit(1);
  if (error || !data?.[0]) return null;
  const row = data[0] as any;
  if (row.data) return row.data as TrainingPlan;
  // Fallback if only structured columns
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    generatedAt: row.generated_at,
    weeklyStructure: row.weekly_structure,
    notes: row.notes,
    workouts: [],
    basedOnProfileSnapshot: {},
  } as TrainingPlan;
}

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
  if (error) return { ok: false, message: fmtErr(error) };
  return { ok: true };
}

export async function cloudSavePlanAndWorkouts(plan: TrainingPlan): Promise<CloudResult> {
  const p = await cloudSavePlan(plan);
  if (!p.ok) return p;
  return cloudSaveWorkouts(plan.workouts || []);
}
