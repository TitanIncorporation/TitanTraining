"use client";

import React, { useEffect, useState } from "react";
import {
  AthleteProfile,
  TrainingPlan,
  Workout,
  Goal,
  HRZones,
  Equipment,
} from "@/types";
import {
  loadProfile,
  saveProfile,
  loadPlan,
  savePlan,
  loadWorkouts,
  exportData,
  importData,
  clearAllData,
} from "@/lib/storage";
import { generateTrainingPlan } from "@/lib/plan-generator";
import { downloadICS } from "@/lib/export";
import { supabase } from "@/lib/supabase";
import Auth from "@/components/Auth";
import WorkoutDetail from "@/components/WorkoutDetail";
import {
  LayoutDashboard,
  User,
  Calendar,
  TrendingUp,
  Dumbbell,
  Mountain,
  RefreshCw,
  Download,
  Upload,
  Plus,
  CheckCircle2,
  Circle,
  Shield,
  ChevronDown,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { format, parseISO, isToday, isFuture, isPast, startOfWeek , addDays} from "date-fns";
import type { User as SupabaseUser } from "@supabase/supabase-js";

type Tab = "dashboard" | "profile" | "plan" | "sync";

const defaultHRZones = (maxHR = 190, resting = 55): HRZones => ({
  maxHR,
  restingHR: resting,
  zones: {
    z1: [Math.round(resting + (maxHR - resting) * 0.5), Math.round(resting + (maxHR - resting) * 0.6)],
    z2: [Math.round(resting + (maxHR - resting) * 0.6), Math.round(resting + (maxHR - resting) * 0.7)],
    z3: [Math.round(resting + (maxHR - resting) * 0.7), Math.round(resting + (maxHR - resting) * 0.8)],
    z4: [Math.round(resting + (maxHR - resting) * 0.8), Math.round(resting + (maxHR - resting) * 0.9)],
    z5: [Math.round(resting + (maxHR - resting) * 0.9), maxHR],
  },
});

const defaultEquipment: Equipment = {
  gymAccess: false,
  trailAccess: true,
  barbell: true,
  dumbbells: true,
  kettlebells: true,
  weightPlates: true,
  rack: true,
  bench: true,
  pullUpBar: true,
  dipBars: false,
  legExtension: false,
  legCurl: false,
  machines: false,
  cableMachine: false,
  treadmill: false,
  indoorBike: true,
  rower: false,
  resistanceBands: true,
  weightedVest: true,
  plyoBox: true,
  medicineBall: false,
  other: [],
};

export default function TitanTraining() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    const p = loadProfile();
    const pl = loadPlan();
    const w = loadWorkouts();
    if (p) setProfile(p);
    if (pl) setPlan(pl);
    setWorkouts(w);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0c0f14] text-slate-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Auth onAuth={() => supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))} />;
  }

  const handleSaveProfile = (updated: AthleteProfile) => {
    setProfile(updated);
    saveProfile(updated);
  };

  const handleGeneratePlan = () => {
    if (!profile) return;
    setGenerating(true);
    setTimeout(() => {
      // Pass existing plan so regeneration keeps completed history & continues forward
      const newPlan = generateTrainingPlan(profile, 4, plan || undefined);
      setPlan(newPlan);
      savePlan(newPlan);
      // Monthly longest-run refresh (1st of month): from completed run workouts
      try {
        const now = new Date();
        if (now.getDate() === 1 && profile.runningBaseline) {
          const completedRuns = (newPlan.workouts || [])
            .filter((w) => w.completed && w.plannedDistanceKm && (w.sport === "running" || w.sport === "trail_running"))
            .map((w) => w.plannedDistanceKm || 0);
          const maxD = completedRuns.length ? Math.max(...completedRuns) : profile.runningBaseline.longestRunLast30DaysKm;
          if (maxD && maxD !== profile.runningBaseline.longestRunLast30DaysKm) {
            const updated = {
              ...profile,
              runningBaseline: { ...profile.runningBaseline, longestRunLast30DaysKm: maxD },
              updatedAt: new Date().toISOString(),
            };
            setProfile(updated);
            // saveProfile if exists - try
          }
        }
      } catch {}
      setGenerating(false);
      setTab("plan");
    }, 800);
  };

  const toggleWorkoutComplete = (workoutId: string) => {
    if (!plan) return;
    const updatedWorkouts = plan.workouts.map((w) =>
      w.id === workoutId ? { ...w, completed: !w.completed } : w
    );
    const updatedPlan = { ...plan, workouts: updatedWorkouts };
    setPlan(updatedPlan);
    savePlan(updatedPlan);
  };

  const navItems = [
    { id: "profile" as Tab, label: "Profile", icon: User },
    { id: "dashboard" as Tab, label: "Dashboard", icon: LayoutDashboard },
    { id: "plan" as Tab, label: "Training Plan", icon: Calendar },
    { id: "sync" as Tab, label: "Data & Sync", icon: Shield },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-card border-b md:border-b-0 md:border-r border-border flex-shrink-0">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
              <Mountain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-lg tracking-tight">Titan Training</h1>
              <p className="text-xs text-muted">Intelligent Coaching</p>
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                tab === item.id
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-card-hover hover:text-foreground"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto p-3 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:bg-card-hover hover:text-foreground"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-4 md:p-8">
          {tab === "dashboard" && (
            <Dashboard
              profile={profile}
              plan={plan}
              workouts={workouts}
              onGenerate={handleGeneratePlan}
              generating={generating}
              setTab={setTab}
            />
          )}
          {tab === "profile" && (
            <ProfileEditor profile={profile} onSave={handleSaveProfile} />
          )}
          {tab === "plan" && (
            <PlanView
              plan={plan}
              profile={profile}
              onGenerate={handleGeneratePlan}
              generating={generating}
              onToggleComplete={toggleWorkoutComplete}
              onOpenWorkout={setSelectedWorkout}
            />
          )}
          {tab === "sync" && <SyncView plan={plan} />}
        </div>
      </main>

      {selectedWorkout && (
        <WorkoutDetail
          workout={selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
          onToggle={(id) => {
            toggleWorkoutComplete(id);
            setSelectedWorkout((prev) =>
              prev && prev.id === id ? { ...prev, completed: !prev.completed } : prev
            );
          }}
        />
      )}
    </div>
  );
}

// ==================== DASHBOARD ====================
function Dashboard({
  profile,
  plan,
  workouts,
  onGenerate,
  generating,
  setTab,
}: {
  profile: AthleteProfile | null;
  plan: TrainingPlan | null;
  workouts: Workout[];
  onGenerate: () => void;
  generating: boolean;
  setTab: (t: Tab) => void;
}) {
  if (!profile) {
    return (
      <div className="text-center py-20">
        <Dumbbell className="w-12 h-12 mx-auto text-muted mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Welcome to Titan Training</h2>
        <p className="text-muted mb-6 max-w-md mx-auto">
          Set up your athlete profile first so we can build intelligent training plans tailored to you.
        </p>
        <button
          onClick={() => setTab("profile")}
          className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
        >
          Create Profile
        </button>
      </div>
    );
  }

  const upcoming = plan?.workouts
    .filter((w) => isFuture(parseISO(w.date)) || isToday(parseISO(w.date)))
    .slice(0, 5) || [];

  const completedCount = plan?.workouts.filter((w) => w.completed).length || 0;
  const totalPlanned = plan?.workouts.length || 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Hey {profile.name || "Athlete"}</h2>
        <p className="text-muted mt-1 capitalize">
          {(profile as any).fitnessLevel || profile.experienceLevel || "Athlete"}
          {" · "}
          {profile.primarySport?.replace("_", " ") || "training"}
          {(profile as any).secondarySport ? ` + ${String((profile as any).secondarySport).replace("_", " ")}` : ""}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Current Plan" value={plan ? "Active" : "None"} sub={plan?.name ?? undefined} />
        <StatCard
          label="Top goal"
          value={profile.goals.find((g) => g.priority === 5)?.title || profile.goals.sort((a, b) => b.priority - a.priority)[0]?.title || "—"}
          sub="Priority focus"
        />
        <StatCard
          label="Fitness level"
          value={((profile as any).fitnessLevel || profile.experienceLevel || "—") as string}
          sub={`${profile.sports.length} sports`}
        />
      </div>

      {/* CTA */}
      {!plan && (
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-lg">No active training plan</h3>
            <p className="text-muted text-sm mt-1">
              Generate a 4-week block based on your profile, goals, and equipment.
            </p>
          </div>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {generating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> Generate Plan
              </>
            )}
          </button>
        </div>
      )}

      {/* Progress snapshot (merged from old Progress tab) */}
      {plan && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h3 className="font-semibold">Progress</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted uppercase tracking-wide">Completion</p>
              <p className="text-lg font-semibold mt-0.5">
                {totalPlanned ? `${Math.round((completedCount / totalPlanned) * 100)}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wide">Done / Planned</p>
              <p className="text-lg font-semibold mt-0.5">{completedCount} / {totalPlanned}</p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wide">Block</p>
              <p className="text-lg font-semibold mt-0.5 truncate">{plan.name}</p>
            </div>
          </div>
          {profile.goals.filter((g) => g.priority === 5).length > 0 && (
            <p className="text-xs text-muted">
              Focus: {profile.goals.filter((g) => g.priority === 5).map((g) => g.title).join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Upcoming Workouts</h3>
          <div className="space-y-2">
            {upcoming.map((w) => (
              <div
                key={w.id}
                className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isToday(parseISO(w.date)) ? "bg-accent" : "bg-muted"
                    }`}
                  />
                  <div>
                    <p className="font-medium text-sm">{w.title}</p>
                    <p className="text-xs text-muted">
                      {format(parseISO(w.date), "EEE, MMM d")} · {w.plannedDurationMin} min
                    </p>
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-background text-muted capitalize">
                  {w.type.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number | undefined;
  sub?: string;
}) {
  const display = value === undefined || value === null ? "—" : String(value);
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold mt-1 truncate capitalize">{display}</p>
      {sub && <p className="text-xs text-muted mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

// ==================== PROFILE EDITOR ====================

function ProfileSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <details
      className="bg-card border border-border rounded-xl overflow-hidden"
      open={isOpen}
      onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="px-4 py-3 font-medium text-sm uppercase tracking-wide cursor-pointer select-none hover:bg-card-hover list-none">
        {title}
      </summary>
      <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">{children}</div>
    </details>
  );
}

function ProfileEditor({
  profile,
  onSave,
}: {
  profile: AthleteProfile | null;
  onSave: (p: AthleteProfile) => void;
}) {
  const [form, setForm] = useState<AthleteProfile>(
    profile || ({
      name: "",
      age: 35,
      gender: "prefer_not",
      fitnessLevel: "intermediate",
      experienceLevel: "intermediate",
      sports: ["running", "strength"],
      sportPriorities: [
        { sport: "running", priority: 1 },
        { sport: "strength", priority: 2 },
      ],
      primarySport: "running",
      secondarySport: "strength",
      customSportsList: [],
      trainingDaysPerWeek: 5,
      goals: [],
      hrZones: defaultHRZones(),
      equipment: defaultEquipment,
      weeklyAvailability: {
        monday: 1,
        tuesday: 1,
        wednesday: 1,
        thursday: 1,
        friday: 1,
        saturday: 3,
        sunday: 3,
      },
      runningBaseline: {
        experience: "intermediate",
        weeklyVolumeKm: 40,
        longestRunLast30DaysKm: 18,
        preferredSurface: "mixed",
      },
      strengthBaseline: {
        experience: "intermediate",
        trainingApproaches: ["heavy_duty", "hypertrophy"],
        trainingApproachOther: "",
        physiquePriorities: ["full_body"],
        physiqueOther: "",
        preferredStyle: "",
      },
      constraints: "",
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as AthleteProfile)
  );

  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalType, setNewGoalType] = useState<string>("race");
  const [newGoalDate, setNewGoalDate] = useState("");
  const [newGoalDistance, setNewGoalDistance] = useState("");
  const [newGoalTime, setNewGoalTime] = useState("");
  const [newGoalPace, setNewGoalPace] = useState("");
  const [newGoalElevation, setNewGoalElevation] = useState("");
  const [newGoalExercise, setNewGoalExercise] = useState("");
  const [newGoalWeight, setNewGoalWeight] = useState("");
  const [newGoalReps, setNewGoalReps] = useState("");
  const [newGoalIsTop, setNewGoalIsTop] = useState(false);
  const [customSportInput, setCustomSportInput] = useState("");
  const [approachOtherInput, setApproachOtherInput] = useState("");
  const [physiqueOtherInput, setPhysiqueOtherInput] = useState("");
  const [equipmentOtherInput, setEquipmentOtherInput] = useState("");

  const setZoneBound = (z: "z1"|"z2"|"z3"|"z4"|"z5", which: 0 | 1, raw: string) => {
    if (raw === "") return; // allow clearing while typing without forcing 0
    const val = Number(raw);
    if (Number.isNaN(val)) return;
    const order: ("z1"|"z2"|"z3"|"z4"|"z5")[] = ["z1","z2","z3","z4","z5"];
    const zones = { ...form.hrZones.zones };
    const idx = order.indexOf(z);
    let low = which === 0 ? val : zones[z][0];
    let high = which === 1 ? val : zones[z][1];
    if (low > high) {
      if (which === 0) high = low;
      else low = high;
    }
    // enforce non-overlap with neighbors
    if (idx > 0) {
      const prev = order[idx - 1];
      if (low <= zones[prev][1]) low = zones[prev][1] + 1;
      if (low > high) high = low;
    }
    if (idx < order.length - 1) {
      const next = order[idx + 1];
      if (high >= zones[next][0]) {
        // push next start up
        const nextLow = high + 1;
        const nextHigh = Math.max(zones[next][1], nextLow);
        zones[next] = [nextLow, nextHigh];
        // cascade further if needed
        for (let j = idx + 2; j < order.length; j++) {
          const cur = order[j];
          const prevZ = order[j - 1];
          if (zones[cur][0] <= zones[prevZ][1]) {
            const nl = zones[prevZ][1] + 1;
            zones[cur] = [nl, Math.max(zones[cur][1], nl)];
          }
        }
      }
    }
    zones[z] = [low, high];
    setForm({ ...form, hrZones: { ...form.hrZones, zones } });
  };


  const addGoal = () => {
    if (!newGoalTitle.trim()) return;
    const isRoadRace = newGoalType === "race";
    const isTrail = newGoalType === "trail_race";
    const isStrength = newGoalType === "strength";
    // parse hh:mm to minutes for storage
    let timeMinutes: number | undefined;
    if (newGoalTime.trim()) {
      const parts = newGoalTime.trim().split(":");
      if (parts.length === 2) {
        timeMinutes = (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
      } else {
        timeMinutes = Number(newGoalTime) || undefined;
      }
    }
    const goal: Goal = {
      id: Math.random().toString(36).slice(2),
      type: (isTrail ? "race" : newGoalType) as any,
      title: newGoalTitle.trim(),
      priority: (newGoalIsTop ? 5 : 3) as 1 | 2 | 3 | 4 | 5,
      targetDate: newGoalDate || undefined,
      sport: isTrail ? "trail_running" : isRoadRace ? "running" : isStrength ? "strength" : undefined,
      metrics: isRoadRace || isTrail
        ? {
            distanceKm: newGoalDistance ? Number(newGoalDistance) : undefined,
            timeMinutes,
            paceMinPerKm: !isTrail && newGoalPace ? Number(newGoalPace) : undefined,
            other: isTrail && newGoalElevation ? `elevation:${newGoalElevation}m` : undefined,
          }
        : isStrength
          ? {
              other: newGoalExercise || undefined,
              weightKg: newGoalWeight ? Number(newGoalWeight) : undefined,
              reps: newGoalReps ? Number(newGoalReps) : undefined,
            }
          : undefined,
    };
    let goals = [...form.goals, goal];
    if (newGoalIsTop) {
      goals = goals.map((g) =>
        g.id === goal.id ? g : g.priority === 5 ? { ...g, priority: 3 as 1 | 2 | 3 | 4 | 5 } : g
      );
    }
    setForm({ ...form, goals });
    setNewGoalTitle("");
    setNewGoalDate("");
    setNewGoalDistance("");
    setNewGoalTime("");
    setNewGoalPace("");
    setNewGoalElevation("");
    setNewGoalExercise("");
    setNewGoalWeight("");
    setNewGoalReps("");
    setNewGoalIsTop(false);
  };

  const addCustomSport = () => {
    const v = customSportInput.trim();
    if (!v) return;
    const list = [...((form as any).customSportsList || [])];
    if (!list.includes(v)) list.push(v);
    setForm({ ...form, customSportsList: list } as any);
    setCustomSportInput("");
  };

  const addApproachOther = () => {
    const v = approachOtherInput.trim();
    if (!v) return;
    setForm({
      ...form,
      strengthBaseline: {
        ...((form as any).strengthBaseline || {}),
        trainingApproachOther: v,
      },
    } as any);
    setApproachOtherInput("");
  };

  const addPhysiqueOther = () => {
    const v = physiqueOtherInput.trim();
    if (!v) return;
    const current = (form as any).strengthBaseline?.physiquePriorities || [];
    const next = current.includes(v) ? current : [...current, v];
    setForm({
      ...form,
      strengthBaseline: {
        ...((form as any).strengthBaseline || {}),
        physiquePriorities: next,
        physiqueOther: v,
      },
    } as any);
    setPhysiqueOtherInput("");
  };

  const addEquipmentOther = () => {
    const v = equipmentOtherInput.trim();
    if (!v) return;
    const other = [...(form.equipment.other || [])];
    if (!other.includes(v)) other.push(v);
    setForm({ ...form, equipment: { ...form.equipment, other } });
    setEquipmentOtherInput("");
  };

  const handleSave = () => {
    onSave({
      ...form,
      updatedAt: new Date().toISOString(),
      createdAt: form.createdAt || new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-2xl font-semibold">Athlete Profile</h2>
        <p className="text-muted mt-1">Everything here conditions the training plans.</p>
      </div>

      {/* ========== GENERAL ========== */}
      <ProfileSection title="Baseline – General">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm mb-1 block">Age</span>
            <input
              type="number"
              min={12}
              max={90}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).age ?? ""}
              onChange={(e) =>
                setForm({ ...form, age: Number(e.target.value) || undefined } as any)
              }
            />
          </label>
          <label className="block">
            <span className="text-sm mb-1 block">Gender</span>
            <select
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).gender || "prefer_not"}
              onChange={(e) => setForm({ ...form, gender: e.target.value } as any)}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not">Prefer not to say</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm mb-1 block">Current fitness level</span>
          <select
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            value={(form as any).fitnessLevel || form.experienceLevel || "intermediate"}
            onChange={(e) =>
              setForm({
                ...form,
                fitnessLevel: e.target.value,
                experienceLevel: e.target.value,
              } as AthleteProfile)
            }
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="elite">Elite</option>
          </select>
        </label>

        <div>
          <span className="text-sm mb-2 block">Sports to train</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["running", "Road Running"],
              ["trail_running", "Trail Running"],
              ["strength", "Strength / Hypertrophy"],
              ["conditioning", "Conditioning"],
              ["cycling", "Cycling"],
              ["triathlon", "Triathlon"],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.sports.includes(value as any)}
                  onChange={(e) => {
                    const sports = e.target.checked
                      ? [...form.sports, value as any]
                      : form.sports.filter((s) => s !== value);
                    setForm({
                      ...form,
                      sports,
                      primarySport: (sports[0] as any) || form.primarySport,
                    });
                  }}
                  className="rounded border-border"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <input
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="Other sport..."
              value={customSportInput}
              onChange={(e) => setCustomSportInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomSport())}
            />
            <button
              type="button"
              onClick={addCustomSport}
              className="px-3 py-2 bg-accent text-white rounded-lg text-sm"
            >
              Add
            </button>
          </div>
          {((form as any).customSportsList || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {((form as any).customSportsList as string[]).map((s) => (
                <span
                  key={s}
                  className="text-xs bg-background border border-border rounded-full px-2 py-1 flex items-center gap-1"
                >
                  {s}
                  <button
                    type="button"
                    className="text-muted hover:text-foreground"
                    onClick={() =>
                      setForm({
                        ...form,
                        customSportsList: ((form as any).customSportsList || []).filter(
                          (x: string) => x !== s
                        ),
                      } as any)
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm mb-1 block">Top priority sport</span>
            <select
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={form.primarySport}
              onChange={(e) => setForm({ ...form, primarySport: e.target.value as any })}
            >
              <option value="running">Road Running</option>
              <option value="trail_running">Trail Running</option>
              <option value="strength">Strength / Hypertrophy</option>
              <option value="conditioning">Conditioning</option>
              <option value="cycling">Cycling</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm mb-1 block">Second priority sport</span>
            <select
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).secondarySport || "strength"}
              onChange={(e) => setForm({ ...form, secondarySport: e.target.value } as any)}
            >
              <option value="running">Road Running</option>
              <option value="trail_running">Trail Running</option>
              <option value="strength">Strength / Hypertrophy</option>
              <option value="conditioning">Conditioning</option>
              <option value="cycling">Cycling</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm mb-1 block">Max HR</span>
            <input
              type="number"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={form.hrZones.maxHR}
              onChange={(e) => {
                const maxHR = Number(e.target.value) || 190;
                const resting = form.hrZones.restingHR;
                setForm({
                  ...form,
                  hrZones: {
                    maxHR,
                    restingHR: resting,
                    zones: {
                      z1: [
                        Math.round(resting + (maxHR - resting) * 0.5),
                        Math.round(resting + (maxHR - resting) * 0.6),
                      ],
                      z2: [
                        Math.round(resting + (maxHR - resting) * 0.6),
                        Math.round(resting + (maxHR - resting) * 0.7),
                      ],
                      z3: [
                        Math.round(resting + (maxHR - resting) * 0.7),
                        Math.round(resting + (maxHR - resting) * 0.8),
                      ],
                      z4: [
                        Math.round(resting + (maxHR - resting) * 0.8),
                        Math.round(resting + (maxHR - resting) * 0.9),
                      ],
                      z5: [Math.round(resting + (maxHR - resting) * 0.9), maxHR],
                    },
                  },
                });
              }}
            />
          </label>
          <label className="block">
            <span className="text-sm mb-1 block">Resting HR</span>
            <input
              type="number"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={form.hrZones.restingHR}
              onChange={(e) => {
                const resting = Number(e.target.value) || 55;
                const maxHR = form.hrZones.maxHR;
                setForm({
                  ...form,
                  hrZones: {
                    maxHR,
                    restingHR: resting,
                    zones: {
                      z1: [
                        Math.round(resting + (maxHR - resting) * 0.5),
                        Math.round(resting + (maxHR - resting) * 0.6),
                      ],
                      z2: [
                        Math.round(resting + (maxHR - resting) * 0.6),
                        Math.round(resting + (maxHR - resting) * 0.7),
                      ],
                      z3: [
                        Math.round(resting + (maxHR - resting) * 0.7),
                        Math.round(resting + (maxHR - resting) * 0.8),
                      ],
                      z4: [
                        Math.round(resting + (maxHR - resting) * 0.8),
                        Math.round(resting + (maxHR - resting) * 0.9),
                      ],
                      z5: [Math.round(resting + (maxHR - resting) * 0.9), maxHR],
                    },
                  },
                });
              }}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm mb-1 block">Training days per week</span>
          <select
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            value={(form as any).trainingDaysPerWeek ?? 5}
            onChange={(e) =>
              setForm({ ...form, trainingDaysPerWeek: Number(e.target.value) } as any)
            }
          >
            {[3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-sm mb-2 block">Hours available per day (optional detail)</span>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-muted text-xs">
                  {(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]).map((d) => (
                    <th key={d} className="font-normal pb-1 text-center w-[14.28%]">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {(
                    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
                  ).map((day) => (
                    <td key={day} className="px-0.5">
                      <select
                        className="w-full bg-background border border-border rounded-lg py-1.5 text-sm text-center"
                        value={String(form.weeklyAvailability[day] || 0)}
                        onChange={(e) => {
                          const v = e.target.value === "2+" ? 2.5 : Number(e.target.value);
                          setForm({
                            ...form,
                            weeklyAvailability: {
                              ...form.weeklyAvailability,
                              [day]: v,
                            },
                          });
                        }}
                      >
                        <option value="0">0</option>
                        <option value="0.5">0.5</option>
                        <option value="1">1</option>
                        <option value="1.5">1.5</option>
                        <option value="2">2</option>
                        <option value="2+">+2</option>
                      </select>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ProfileSection>

      {/* ========== RUNNING ========== */}
      <ProfileSection title="Running Baseline">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm mb-1 block">Running experience</span>
            <select
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).runningBaseline?.experience ?? "intermediate"}
              onChange={(e) =>
                setForm({
                  ...form,
                  runningBaseline: {
                    ...((form as any).runningBaseline || {}),
                    experience: e.target.value,
                    weeklyVolumeKm: (form as any).runningBaseline?.weeklyVolumeKm ?? 40,
                    longestRunLast30DaysKm:
                      (form as any).runningBaseline?.longestRunLast30DaysKm ?? 15,
                    preferredSurface: (form as any).runningBaseline?.preferredSurface ?? "mixed",
                  },
                } as any)
              }
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="elite">Elite</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm mb-1 block">Preferred surface</span>
            <select
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).runningBaseline?.preferredSurface ?? "mixed"}
              onChange={(e) =>
                setForm({
                  ...form,
                  runningBaseline: {
                    ...((form as any).runningBaseline || {}),
                    preferredSurface: e.target.value,
                  },
                } as any)
              }
            >
              <option value="road">Road</option>
              <option value="trail">Trail</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm mb-1 block">Weekly volume (km)</span>
            <input
              type="number"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).runningBaseline?.weeklyVolumeKm ?? 40}
              onChange={(e) =>
                setForm({
                  ...form,
                  runningBaseline: {
                    ...((form as any).runningBaseline || {}),
                    weeklyVolumeKm: Number(e.target.value) || 0,
                  },
                } as any)
              }
            />
          </label>
          <label className="block">
            <span className="text-sm mb-1 block">Longest run last 30 days (km)</span>
            <input
              type="number"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).runningBaseline?.longestRunLast30DaysKm ?? 15}
              onChange={(e) =>
                setForm({
                  ...form,
                  runningBaseline: {
                    ...((form as any).runningBaseline || {}),
                    longestRunLast30DaysKm: Number(e.target.value) || 0,
                  },
                } as any)
              }
            />
          </label>
        </div>

        <div className="bg-background border border-border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">
              HR zones (bpm). Auto from Max/Rest. Edit freely. % shown of HR reserve.
            </p>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-border hover:bg-card shrink-0"
              onClick={() => {
                const maxHR = form.hrZones.maxHR;
                const resting = form.hrZones.restingHR;
                setForm({
                  ...form,
                  hrZones: defaultHRZones(maxHR, resting),
                });
              }}
            >
              Reset zones
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            {(
              [
                ["z1", "50–60%"],
                ["z2", "60–70%"],
                ["z3", "70–80%"],
                ["z4", "80–90%"],
                ["z5", "90–100%"],
              ] as const
            ).map(([z, pct]) => (
              <div key={z} className="space-y-1">
                <div className="font-medium uppercase text-muted">{z}</div>
                <div className="text-[10px] text-muted">{pct}</div>
                <input
                  type="number"
                  className="w-full bg-card border border-border rounded px-1 py-1 text-center"
                  value={form.hrZones.zones[z][0]}
                  onChange={(e) => setZoneBound(z, 0, e.target.value)}
                />
                <input
                  type="number"
                  className="w-full bg-card border border-border rounded px-1 py-1 text-center"
                  value={form.hrZones.zones[z][1]}
                  onChange={(e) => setZoneBound(z, 1, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted mb-2">
              Approx flat paces by zone (estimated). Calibrate with a race time for accuracy — HR alone cannot fix exact pace.
            </p>
            <div className="grid grid-cols-5 gap-1 text-[10px] sm:text-xs text-center">
              {(["z1","z2","z3","z4","z5"] as const).map((z) => {
                // Relative to an easy-pace anchor from experience / goal race if present
                const raceGoal = form.goals.find((g) => g.priority === 5 && g.metrics?.paceMinPerKm);
                const baseEasy =
                  raceGoal?.metrics?.paceMinPerKm
                    ? raceGoal.metrics.paceMinPerKm * 1.25
                    : (form as any).runningBaseline?.experience === "elite"
                      ? 5.0
                      : (form as any).runningBaseline?.experience === "advanced"
                        ? 5.5
                        : (form as any).runningBaseline?.experience === "beginner"
                          ? 7.0
                          : 6.0;
                const mult: Record<string, [number, number]> = {
                  z1: [1.15, 1.25],
                  z2: [1.05, 1.15],
                  z3: [0.95, 1.05],
                  z4: [0.88, 0.95],
                  z5: [0.80, 0.88],
                };
                const [a, b] = mult[z];
                const fmt = (min: number) => {
                  const m = Math.floor(min);
                  const s = Math.round((min - m) * 60);
                  return `${m}:${String(s).padStart(2, "0")}`;
                };
                return (
                  <div key={z} className="bg-card rounded p-1">
                    <div className="text-muted uppercase">{z}</div>
                    <div className="font-medium mt-0.5">
                      {fmt(baseEasy * a)}–{fmt(baseEasy * b)}
                    </div>
                    <div className="text-muted">/km</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </ProfileSection>

      {/* ========== STRENGTH ========== */}
      <ProfileSection title="Strength / Hypertrophy Baseline">
        <label className="block">
          <span className="text-sm mb-1 block">Strength experience</span>
          <select
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            value={(form as any).strengthBaseline?.experience ?? "intermediate"}
            onChange={(e) =>
              setForm({
                ...form,
                strengthBaseline: {
                  ...((form as any).strengthBaseline || {}),
                  experience: e.target.value,
                },
              } as any)
            }
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="elite">Elite</option>
          </select>
        </label>

        <div>
          <span className="text-sm mb-2 block">Training approaches</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["heavy_duty", "Heavy Duty"],
              ["strength", "Strength"],
              ["hypertrophy", "Hypertrophy"],
              ["functional", "Functional Training"],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={((form as any).strengthBaseline?.trainingApproaches ?? []).includes(
                    value
                  )}
                  onChange={(e) => {
                    const current = (form as any).strengthBaseline?.trainingApproaches ?? [];
                    const next = e.target.checked
                      ? [...current, value]
                      : current.filter((p: string) => p !== value);
                    setForm({
                      ...form,
                      strengthBaseline: {
                        ...((form as any).strengthBaseline || {}),
                        trainingApproaches: next,
                      },
                    } as any);
                  }}
                  className="rounded border-border"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="Other approach..."
              value={approachOtherInput}
              onChange={(e) => setApproachOtherInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addApproachOther())}
            />
            <button
              type="button"
              onClick={addApproachOther}
              className="px-3 py-2 bg-accent text-white rounded-lg text-sm"
            >
              Add
            </button>
          </div>
          {(form as any).strengthBaseline?.trainingApproachOther && (
            <span className="inline-flex items-center gap-1 text-xs bg-background border border-border rounded-full px-2 py-1 mt-1">
              {(form as any).strengthBaseline.trainingApproachOther}
              <button
                type="button"
                className="text-muted hover:text-foreground ml-1"
                onClick={() =>
                  setForm({
                    ...form,
                    strengthBaseline: {
                      ...((form as any).strengthBaseline || {}),
                      trainingApproachOther: "",
                    },
                  } as any)
                }
              >
                ×
              </button>
            </span>
          )}
        </div>

        <div>
          <span className="text-sm mb-2 block">Physique priorities</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["full_body", "Full body"],
              ["chest", "Chest"],
              ["arms", "Arms"],
              ["back", "Back"],
              ["shoulders", "Shoulders"],
              ["legs", "Legs"],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={((form as any).strengthBaseline?.physiquePriorities ?? []).includes(
                    value
                  )}
                  onChange={(e) => {
                    const current = (form as any).strengthBaseline?.physiquePriorities ?? [];
                    const next = e.target.checked
                      ? [...current, value]
                      : current.filter((p: string) => p !== value);
                    setForm({
                      ...form,
                      strengthBaseline: {
                        ...((form as any).strengthBaseline || {}),
                        physiquePriorities: next,
                      },
                    } as any);
                  }}
                  className="rounded border-border"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="Other focus (e.g. core, glutes)..."
              value={physiqueOtherInput}
              onChange={(e) => setPhysiqueOtherInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPhysiqueOther();
                }
              }}
            />
            <button
              type="button"
              onClick={addPhysiqueOther}
              className="px-3 py-2 bg-accent text-white rounded-lg text-sm shrink-0"
            >
              Add
            </button>
          </div>
          {((form as any).strengthBaseline?.physiquePriorities || [])
            .filter((p: string) => !["full_body", "chest", "arms", "back", "shoulders", "legs"].includes(p))
            .map((p: string) => (
              <span
                key={p}
                className="inline-flex items-center gap-1 text-xs bg-background border border-border rounded-full px-2 py-1 mr-1 mt-1"
              >
                {p}
                <button
                  type="button"
                  className="text-muted hover:text-foreground"
                  onClick={() => {
                    const current = (form as any).strengthBaseline?.physiquePriorities ?? [];
                    setForm({
                      ...form,
                      strengthBaseline: {
                        ...((form as any).strengthBaseline || {}),
                        physiquePriorities: current.filter((x: string) => x !== p),
                      },
                    } as any);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
        </div>
      </ProfileSection>

      {/* ========== GOALS ========== */}
      <ProfileSection title="Goals & Races">
        <p className="text-xs text-muted">
          Add races and objectives. Mark one as top priority (checkbox). Targets depend on type.
        </p>
        <div className="space-y-2">
          {form.goals.length === 0 && (
            <p className="text-sm text-muted">No goals yet.</p>
          )}
          {form.goals.map((g) => (
            <div
              key={g.id}
              className="flex items-start gap-3 bg-background border border-border rounded-lg px-3 py-3"
            >
              <label className="flex items-center gap-1.5 shrink-0 pt-0.5 cursor-pointer" title="Top priority">
                <input
                  type="checkbox"
                  checked={g.priority === 5}
                  onChange={(e) => {
                    const goals = form.goals.map((goal) => {
                      if (goal.id === g.id) {
                        return { ...goal, priority: (e.target.checked ? 5 : 3) as 1 | 2 | 3 | 4 | 5 };
                      }
                      // only one top priority
                      if (e.target.checked && goal.priority === 5) {
                        return { ...goal, priority: 3 as 1 | 2 | 3 | 4 | 5 };
                      }
                      return goal;
                    });
                    setForm({ ...form, goals });
                  }}
                  className="rounded border-border"
                />
                <span className="text-[10px] text-muted">Top</span>
              </label>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{g.title}</p>
                <p className="text-xs text-muted mt-0.5">
                  {g.type}
                  {g.targetDate ? ` · ${g.targetDate}` : ""}
                  {g.metrics?.distanceKm ? ` · ${g.metrics.distanceKm} km` : ""}
                  {g.metrics?.timeMinutes ? ` · ${g.metrics.timeMinutes} min` : ""}
                  {g.metrics?.paceMinPerKm ? ` · ${g.metrics.paceMinPerKm} min/km` : ""}
                  {g.metrics?.other ? ` · ${g.metrics.other}` : ""}
                  {g.metrics?.weightKg ? ` · ${g.metrics.weightKg} kg` : ""}
                  {g.metrics?.reps ? ` · ${g.metrics.reps} reps` : ""}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-muted hover:text-red-400 shrink-0"
                onClick={() =>
                  setForm({ ...form, goals: form.goals.filter((x) => x.id !== g.id) })
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">Add goal</p>
          <input
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="Name (e.g. Valencia Marathon)"
            value={newGoalTitle}
            onChange={(e) => setNewGoalTitle(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={newGoalType}
              onChange={(e) => setNewGoalType(e.target.value)}
            >
              <option value="race">Race (road)</option>
              <option value="trail_race">Trail running race</option>
              <option value="strength">Strength</option>
              <option value="custom">Custom</option>
            </select>
            <input
              type="date"
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={newGoalDate}
              onChange={(e) => setNewGoalDate(e.target.value)}
            />
          </div>

          {/* Running targets */}
          {newGoalType === "race" && (
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Distance (km)"
                value={newGoalDistance}
                onChange={(e) => setNewGoalDistance(e.target.value)}
              />
              <input
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Time (hh:mm)"
                value={newGoalTime}
                onChange={(e) => setNewGoalTime(e.target.value)}
              />
              <input
                type="number"
                step="0.1"
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Pace (min/km)"
                value={newGoalPace}
                onChange={(e) => setNewGoalPace(e.target.value)}
              />
            </div>
          )}
          {newGoalType === "trail_race" && (
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Distance (km)"
                value={newGoalDistance}
                onChange={(e) => setNewGoalDistance(e.target.value)}
              />
              <input
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Time (hh:mm)"
                value={newGoalTime}
                onChange={(e) => setNewGoalTime(e.target.value)}
              />
              <input
                type="number"
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Elevation (m)"
                value={newGoalElevation}
                onChange={(e) => setNewGoalElevation(e.target.value)}
              />
            </div>
          )}

          {/* Strength targets */}
          {newGoalType === "strength" && (
            <div className="grid grid-cols-3 gap-2">
              <input
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Exercise / movement"
                value={newGoalExercise}
                onChange={(e) => setNewGoalExercise(e.target.value)}
              />
              <input
                type="number"
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Weight (kg)"
                value={newGoalWeight}
                onChange={(e) => setNewGoalWeight(e.target.value)}
              />
              <input
                type="number"
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Reps"
                value={newGoalReps}
                onChange={(e) => setNewGoalReps(e.target.value)}
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={newGoalIsTop}
              onChange={(e) => setNewGoalIsTop(e.target.checked)}
              className="rounded border-border"
            />
            Mark as top priority
          </label>

          <button
            type="button"
            onClick={addGoal}
            className="w-full py-2 bg-accent text-white rounded-lg text-sm"
          >
            Add goal
          </button>
        </div>
      </ProfileSection>

      {/* ========== EQUIPMENT ========== */}
      <ProfileSection title="Equipment" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["gymAccess", "Gym Access"],
              ["trailAccess", "Trail Access"],
              ["barbell", "Barbell"],
              ["dumbbells", "Dumbbells"],
              ["kettlebells", "Kettlebells"],
              ["weightPlates", "Weight Plates"],
              ["rack", "Rack"],
              ["bench", "Bench"],
              ["pullUpBar", "Pull-up Bar"],
              ["dipBars", "Dip Bars"],
              ["legExtension", "Leg Extension"],
              ["legCurl", "Leg Curl"],
              ["machines", "Weight Machines"],
              ["cableMachine", "Cable Machine"],
              ["treadmill", "Treadmill"],
              ["indoorBike", "Indoor Bike"],
              ["rower", "Rower"],
              ["resistanceBands", "Resistance Bands"],
              ["weightedVest", "Weighted Vest"],
              ["plyoBox", "Plyo Box"],
              ["medicineBall", "Medicine Ball"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={(form.equipment as any)[key] || false}
                onChange={(e) =>
                  setForm({
                    ...form,
                    equipment: { ...form.equipment, [key]: e.target.checked },
                  })
                }
                className="rounded border-border"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="Other equipment..."
            value={equipmentOtherInput}
            onChange={(e) => setEquipmentOtherInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEquipmentOther();
              }
            }}
          />
          <button
            type="button"
            onClick={addEquipmentOther}
            className="px-3 py-2 bg-accent text-white rounded-lg text-sm shrink-0"
          >
            Add
          </button>
        </div>
        {(form.equipment.other || []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {form.equipment.other.map((s) => (
              <span
                key={s}
                className="text-xs bg-background border border-border rounded-full px-2 py-1"
              >
                {s}{" "}
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      equipment: {
                        ...form.equipment,
                        other: form.equipment.other.filter((x) => x !== s),
                      },
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </ProfileSection>

      {/* ========== CONSTRAINTS ========== */}
      <ProfileSection title="Constraints & Notes" defaultOpen={false}>
        <label className="block">
          <span className="text-sm mb-1 block">Constraints (injuries, limits…)</span>
          <textarea
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm min-h-[80px]"
            value={form.constraints}
            onChange={(e) => setForm({ ...form, constraints: e.target.value })}
            placeholder="e.g. knee sensitive on downhills, limited shoulder ROM..."
          />
        </label>
        <label className="block">
          <span className="text-sm mb-1 block">Notes</span>
          <textarea
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm min-h-[80px]"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Anything else the engine should know..."
          />
        </label>
      </ProfileSection>

      <div className="sticky bottom-0 pt-4 pb-2 bg-background/95 backdrop-blur border-t border-border -mx-1 px-1 z-10">
        <button
          type="button"
          onClick={handleSave}
          className="w-full py-3.5 bg-accent hover:opacity-90 active:scale-[0.99] text-white rounded-xl font-semibold text-base shadow-lg"
        >
          Save profile
        </button>
      </div>
    </div>
  );
}

function PlanView({
  plan,
  profile,
  onGenerate,
  generating,
  onToggleComplete,
  onOpenWorkout,
}: {
  plan: TrainingPlan | null;
  profile: AthleteProfile | null;
  onGenerate: () => void;
  generating: boolean;
  onToggleComplete: (id: string) => void;
  onOpenWorkout: (w: Workout) => void;
}) {
  if (!plan) {
    return (
      <div className="text-center py-20">
        <Calendar className="w-12 h-12 mx-auto text-muted mb-4" />
        <h2 className="text-2xl font-semibold mb-2">No Training Plan Yet</h2>
        <p className="text-muted mb-6">
          {profile
            ? "Generate a personalized 4-week block based on your profile."
            : "Create a profile first, then generate a plan."}
        </p>
        {profile && (
          <button
            onClick={onGenerate}
            disabled={generating}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium"
          >
            {generating ? "Generating…" : "Generate 4-Week Plan"}
          </button>
        )}
      </div>
    );
  }

  const [calMonth, setCalMonth] = useState(() => startOfWeek(parseISO(plan.startDate), { weekStartsOn: 1 }));

  const workoutsByDate: Record<string, Workout[]> = {};
  plan.workouts.forEach((w) => {
    if (!workoutsByDate[w.date]) workoutsByDate[w.date] = [];
    workoutsByDate[w.date].push(w);
  });

  // Build calendar grid (Mon–Sun) covering plan range for current month view
  const monthStart = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i));
  }

  const sortedWorkouts = [...plan.workouts].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{plan.name}</h2>
          <p className="text-muted text-sm mt-1">
            {format(parseISO(plan.startDate), "MMM d")} –{" "}
            {format(parseISO(plan.endDate), "MMM d, yyyy")}
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="px-4 py-2 bg-card border border-border hover:bg-card-hover rounded-lg text-sm font-medium flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
          Update plan
        </button>
      </div>

      {plan.notes && (
        <p className="text-sm text-muted bg-card border border-border rounded-lg p-4">{plan.notes}</p>
      )}

      {/* Calendar */}
      <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            className="px-2 py-1 text-sm border border-border rounded-lg"
            onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
          >
            Prev
          </button>
          <h3 className="font-semibold text-sm sm:text-base">
            {format(calMonth, "MMMM yyyy")}
          </h3>
          <button
            type="button"
            className="px-2 py-1 text-sm border border-border rounded-lg"
            onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
          >
            Next
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] sm:text-xs text-muted mb-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const inMonth = day.getMonth() === calMonth.getMonth();
            const list = workoutsByDate[key] || [];
            const isToday = key === format(new Date(), "yyyy-MM-dd");
            return (
              <button
                key={key}
                type="button"
                disabled={list.length === 0}
                onClick={() => list[0] && onOpenWorkout(list[0])}
                className={`min-h-[52px] sm:min-h-[64px] rounded-lg border p-1 text-left transition-colors ${
                  inMonth ? "border-border bg-background" : "border-transparent opacity-40"
                } ${isToday ? "ring-1 ring-accent" : ""} ${
                  list.length ? "hover:border-accent/50 cursor-pointer" : "cursor-default"
                }`}
              >
                <div className="text-[10px] sm:text-xs text-muted">{format(day, "d")}</div>
                <div className="mt-0.5 space-y-0.5">
                  {list.slice(0, 2).map((w) => (
                    <div
                      key={w.id}
                      className={`truncate text-[9px] sm:text-[10px] px-0.5 rounded ${
                        w.completed ? "bg-success/20 text-success" : "bg-accent/15 text-accent"
                      }`}
                    >
                      {w.title}
                    </div>
                  ))}
                  {list.length > 2 && (
                    <div className="text-[9px] text-muted">+{list.length - 2}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div>
        <h3 className="font-semibold mb-3">All sessions</h3>
        <div className="space-y-2">
          {sortedWorkouts.map((w) => (
            <WorkoutCard key={w.id} workout={w} onToggle={onToggleComplete} onOpen={onOpenWorkout} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkoutCard({
  workout,
  onToggle,
  onOpen,
}: {
  workout: Workout;
  onToggle: (id: string) => void;
  onOpen: (w: Workout) => void;
}) {
  const isStrength = workout.sport === "strength";
  return (
    <div
      className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-accent/40 transition-colors"
      onClick={() => onOpen(workout)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(workout.id); }}
            className="mt-0.5 hover:scale-110 transition-transform"
            title={workout.completed ? "Mark incomplete" : "Mark complete"}
          >
            {workout.completed ? (
              <CheckCircle2 className="w-5 h-5 text-success" />
            ) : (
              <Circle className="w-5 h-5 text-muted hover:text-accent" />
            )}
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium">{workout.title}</h4>
              <span className="text-xs px-2 py-0.5 rounded-full bg-background text-muted capitalize">
                {workout.type.replace("_", " ")}
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              {format(parseISO(workout.date), "EEEE, MMM d")}
              {workout.plannedDurationMin && ` · ${workout.plannedDurationMin} min`}
              {workout.plannedDistanceKm && ` · ~${workout.plannedDistanceKm} km`}
              {workout.plannedIntensity && ` · ${workout.plannedIntensity.toUpperCase()}`}
            </p>
            <p className="text-sm text-muted mt-2">{workout.description}</p>
            {isStrength && workout.exercises && (
              <ul className="mt-3 space-y-1">
                {workout.exercises.map((ex, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted w-4">{i + 1}.</span>
                    <span>
                      {ex.name} — {ex.sets}×{ex.reps}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== PROGRESS ====================
function ProgressView({
  plan,
  workouts,
  profile,
}: {
  plan: TrainingPlan | null;
  workouts: Workout[];
  profile: AthleteProfile | null;
}) {
  if (!plan) {
    return (
      <div className="text-center py-20 text-muted">
        Generate a plan first to start tracking progress.
      </div>
    );
  }

  const completed = plan.workouts.filter((w) => w.completed).length;
  const total = plan.workouts.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  // Simple volume estimate
  const plannedMinutes = plan.workouts.reduce(
    (sum, w) => sum + (w.plannedDurationMin || 0),
    0
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Progress & Trajectory</h2>
        <p className="text-muted mt-1">Where you are vs where the plan is taking you.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted">Plan Completion</p>
          <p className="text-3xl font-semibold mt-1">{pct}%</p>
          <div className="mt-3 h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted mt-2">
            {completed} of {total} workouts done
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted">Planned Volume</p>
          <p className="text-3xl font-semibold mt-1">
            {Math.round(plannedMinutes / 60)}h
          </p>
          <p className="text-xs text-muted mt-2">Total training time in current block</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted">Potential Focus</p>
          <p className="text-lg font-semibold mt-1 capitalize">
            {profile?.goals.sort((a, b) => b.priority - a.priority)[0]?.title ||
              "General fitness"}
          </p>
          <p className="text-xs text-muted mt-2">Highest priority goal driving the plan</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-medium mb-3">Coach Notes on Trajectory</h3>
        <ul className="space-y-2 text-sm text-muted">
          <li>
            • Current block emphasizes progressive overload in both running volume/intensity and
            strength.
          </li>
          <li>
            • Final week includes a deliberate deload to consolidate adaptations.
          </li>
          <li>
            • Consistency &gt; perfection. Missing a session is fine — just get the next one done.
          </li>
          <li>
            • Once Garmin/Strava sync is active, actual vs planned load and HR response will refine
            future plans automatically.
          </li>
        </ul>
      </div>
    </div>
  );
}

// ==================== SYNC / STRAVA ====================
function SyncView({ plan }: { plan: TrainingPlan | null }) {
  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-semibold">Strava</h2>
        <p className="text-muted mt-1">
          Strava is the single source of truth for activity history.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FC4C02] flex items-center justify-center text-white font-bold text-sm">
            S
          </div>
          <div>
            <h3 className="font-semibold">Connect Strava</h3>
            <p className="text-xs text-muted">OAuth — coming next</p>
          </div>
        </div>
        <p className="text-sm text-muted">
          Connect your Strava account so Titan can read your activities and match them
          to planned workouts automatically.
        </p>
        <button
          type="button"
          disabled
          className="px-4 py-2.5 bg-[#FC4C02]/80 text-white rounded-lg text-sm font-medium opacity-60 cursor-not-allowed"
        >
          Connect Strava (soon)
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold">Import history</h3>
        <p className="text-sm text-muted">
          Until live connect is ready, you can import a Strava export (GPX/TCX/JSON)
          so the engine has past volume and pace context.
        </p>
        <label className="inline-flex px-4 py-2.5 bg-background border border-border hover:bg-card-hover rounded-lg text-sm font-medium items-center gap-2 cursor-pointer">
          Import Strava history
          <input
            type="file"
            accept=".json,.gpx,.tcx,.fit,application/json"
            className="hidden"
            onChange={() => {
              alert("Strava history import will be wired in the next integration step.");
            }}
          />
        </label>
        {plan && (
          <p className="text-xs text-muted">
            Active plan: {plan.name}. Matching imported activities to planned sessions comes with connect.
          </p>
        )}
      </div>
    </div>
  );
}
