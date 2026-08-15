"use client";

import { useEffect, useState } from "react";
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
import { format, parseISO, isToday, isFuture, isPast, startOfWeek } from "date-fns";
import type { User as SupabaseUser } from "@supabase/supabase-js";

type Tab = "dashboard" | "profile" | "plan" | "progress" | "sync";

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
  gymAccess: true,
  homeGym: true,
  outdoorAccess: true,
  trailAccess: true,
  barbell: true,
  dumbbells: true,
  kettlebells: true,
  weightPlates: true,
  rack: true,
  bench: true,
  pullUpBar: true,
  dipBars: false,
  parallettes: false,
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
    // Simulate a bit of thinking time
    setTimeout(() => {
      const newPlan = generateTrainingPlan(profile, 4);
      setPlan(newPlan);
      savePlan(newPlan);
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
    { id: "dashboard" as Tab, label: "Dashboard", icon: LayoutDashboard },
    { id: "profile" as Tab, label: "Profile", icon: User },
    { id: "plan" as Tab, label: "Training Plan", icon: Calendar },
    { id: "progress" as Tab, label: "Progress", icon: TrendingUp },
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
          {tab === "progress" && <ProgressView plan={plan} workouts={workouts} profile={profile} />}
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
        <p className="text-muted mt-1">
          {profile.primarySport === "trail_running" ? "Trail" : "Road"} running priority · Strength support
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Current Plan" value={plan ? "Active" : "None"} sub={plan?.name} />
        <StatCard
          label="Completion"
          value={totalPlanned ? `${Math.round((completedCount / totalPlanned) * 100)}%` : "—"}
          sub={`${completedCount}/${totalPlanned} workouts`}
        />
        <StatCard
          label="Primary Goal"
          value={profile.goals.sort((a, b) => b.priority - a.priority)[0]?.title || "—"}
          sub="Highest priority"
        />
        <StatCard
          label="Experience"
          value={profile.experienceLevel}
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
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold mt-1 truncate capitalize">{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

// ==================== PROFILE EDITOR ====================
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
      fitnessLevel: "intermediate",
      experienceLevel: "intermediate",
      sports: ["running", "strength"],
      sportPriorities: [
        { sport: "running", priority: 1 },
        { sport: "strength", priority: 2 },
      ],
      primarySport: "running",
      secondarySport: "strength",
      customSports: "",
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
        trainingApproaches: ["mentzer", "hypertrophy"],
        trainingApproachOther: "",
        physiquePriorities: ["general"],
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

  const addGoal = () => {
    if (!newGoalTitle.trim()) return;
    const goal: Goal = {
      id: Math.random().toString(36).slice(2),
      type: "custom",
      title: newGoalTitle.trim(),
      priority: 3,
    };
    setForm({ ...form, goals: [...form.goals, goal] });
    setNewGoalTitle("");
  };

  const handleSave = () => {
    onSave({
      ...form,
      updatedAt: new Date().toISOString(),
      createdAt: form.createdAt || new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-semibold">Athlete Profile</h2>
        <p className="text-muted mt-1">This data drives the training plan generator.</p>
      </div>

      {/* Baseline – General */}
      <section className="space-y-4">
        <h3 className="font-medium text-sm text-muted uppercase tracking-wide">Baseline – General</h3>
        <div className="grid gap-4">
          <label className="block">
            <span className="text-sm mb-1 block">Current fitness level</span>
            <select
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
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
                        primarySport: sports[0] || form.primarySport,
                      });
                    }}
                    className="rounded border-border"
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="block mt-3">
              <span className="text-sm mb-1 block">Other sports (custom)</span>
              <input
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. CrossFit, swimming, rowing..."
                value={(form as any).customSports || ""}
                onChange={(e) => setForm({ ...form, customSports: e.target.value } as any)}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm mb-1 block">Top priority sport</span>
              <select
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
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
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
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

          {/* Heart Rate */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm mb-1 block">Max HR</span>
              <input
                type="number"
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
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
                        z1: [Math.round(resting + (maxHR - resting) * 0.5), Math.round(resting + (maxHR - resting) * 0.6)],
                        z2: [Math.round(resting + (maxHR - resting) * 0.6), Math.round(resting + (maxHR - resting) * 0.7)],
                        z3: [Math.round(resting + (maxHR - resting) * 0.7), Math.round(resting + (maxHR - resting) * 0.8)],
                        z4: [Math.round(resting + (maxHR - resting) * 0.8), Math.round(resting + (maxHR - resting) * 0.9)],
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
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
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
                        z1: [Math.round(resting + (maxHR - resting) * 0.5), Math.round(resting + (maxHR - resting) * 0.6)],
                        z2: [Math.round(resting + (maxHR - resting) * 0.6), Math.round(resting + (maxHR - resting) * 0.7)],
                        z3: [Math.round(resting + (maxHR - resting) * 0.7), Math.round(resting + (maxHR - resting) * 0.8)],
                        z4: [Math.round(resting + (maxHR - resting) * 0.8), Math.round(resting + (maxHR - resting) * 0.9)],
                        z5: [Math.round(resting + (maxHR - resting) * 0.9), maxHR],
                      },
                    },
                  });
                }}
              />
            </label>
          </div>

          {/* Weekly availability */}
          <div>
            <span className="text-sm mb-2 block">Hours available per day</span>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {(["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const).map((day) => (
                <label key={day} className="block text-center">
                  <span className="text-xs text-muted capitalize">{day.slice(0,3)}</span>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    step={0.5}
                    className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-sm text-center mt-1"
                    value={form.weeklyAvailability[day]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        weeklyAvailability: {
                          ...form.weeklyAvailability,
                          [day]: Number(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Running Baseline */}
      <section className="space-y-4">
        <h3 className="font-medium text-sm text-muted uppercase tracking-wide">Running Baseline</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm mb-1 block">Running experience</span>
            <select
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).runningBaseline?.experience ?? "intermediate"}
              onChange={(e) =>
                setForm({
                  ...form,
                  runningBaseline: {
                    ...((form as any).runningBaseline || {}),
                    experience: e.target.value,
                    weeklyVolumeKm: (form as any).runningBaseline?.weeklyVolumeKm ?? 40,
                    longestRunLast30DaysKm: (form as any).runningBaseline?.longestRunLast30DaysKm ?? 15,
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
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).runningBaseline?.preferredSurface ?? "mixed"}
              onChange={(e) =>
                setForm({
                  ...form,
                  runningBaseline: {
                    ...((form as any).runningBaseline || {}),
                    experience: (form as any).runningBaseline?.experience ?? "intermediate",
                    weeklyVolumeKm: (form as any).runningBaseline?.weeklyVolumeKm ?? 40,
                    longestRunLast30DaysKm: (form as any).runningBaseline?.longestRunLast30DaysKm ?? 15,
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
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).runningBaseline?.weeklyVolumeKm ?? 40}
              onChange={(e) =>
                setForm({
                  ...form,
                  runningBaseline: {
                    ...((form as any).runningBaseline || {}),
                    experience: (form as any).runningBaseline?.experience ?? "intermediate",
                    weeklyVolumeKm: Number(e.target.value) || 0,
                    longestRunLast30DaysKm: (form as any).runningBaseline?.longestRunLast30DaysKm ?? 15,
                    preferredSurface: (form as any).runningBaseline?.preferredSurface ?? "mixed",
                  },
                } as any)
              }
            />
          </label>
          <label className="block">
            <span className="text-sm mb-1 block">Longest run last 30 days (km)</span>
            <input
              type="number"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).runningBaseline?.longestRunLast30DaysKm ?? 15}
              onChange={(e) =>
                setForm({
                  ...form,
                  runningBaseline: {
                    ...((form as any).runningBaseline || {}),
                    experience: (form as any).runningBaseline?.experience ?? "intermediate",
                    weeklyVolumeKm: (form as any).runningBaseline?.weeklyVolumeKm ?? 40,
                    longestRunLast30DaysKm: Number(e.target.value) || 0,
                    preferredSurface: (form as any).runningBaseline?.preferredSurface ?? "mixed",
                  },
                } as any)
              }
            />
          </label>
        </div>

        {/* Auto zones preview */}
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs text-muted mb-2">Proposed HR zones (from Max HR & Resting HR) — editable above</p>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            {(["z1","z2","z3","z4","z5"] as const).map((z) => (
              <div key={z} className="bg-background rounded p-2">
                <div className="font-medium uppercase text-muted">{z}</div>
                <div className="text-foreground mt-1">
                  {form.hrZones.zones[z][0]}–{form.hrZones.zones[z][1]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Strength Baseline */}
      <section className="space-y-4">
        <h3 className="font-medium text-sm text-muted uppercase tracking-wide">Strength / Hypertrophy Baseline</h3>
        <div className="grid gap-4">
          <label className="block">
            <span className="text-sm mb-1 block">Strength experience</span>
            <select
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              value={(form as any).strengthBaseline?.experience ?? "intermediate"}
              onChange={(e) =>
                setForm({
                  ...form,
                  strengthBaseline: {
                    ...((form as any).strengthBaseline || {}),
                    experience: e.target.value,
                    trainingApproaches: (form as any).strengthBaseline?.trainingApproaches ?? ["mentzer"],
                    physiquePriorities: (form as any).strengthBaseline?.physiquePriorities ?? ["general"],
                    preferredStyle: (form as any).strengthBaseline?.preferredStyle ?? "",
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
                ["mentzer", "Mike Mentzer / Heavy Duty"],
                ["strength", "Strength"],
                ["hypertrophy", "Hypertrophy"],
                ["hiit", "HIIT"],
                ["functional", "Functional Training"],
                ["moderate", "Moderate volume"],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={((form as any).strengthBaseline?.trainingApproaches ?? []).includes(value)}
                    onChange={(e) => {
                      const current = (form as any).strengthBaseline?.trainingApproaches ?? [];
                      const next = e.target.checked
                        ? [...current, value]
                        : current.filter((p: string) => p !== value);
                      setForm({
                        ...form,
                        strengthBaseline: {
                          ...((form as any).strengthBaseline || {}),
                          experience: (form as any).strengthBaseline?.experience ?? "intermediate",
                          trainingApproaches: next,
                          physiquePriorities: (form as any).strengthBaseline?.physiquePriorities ?? ["general"],
                          preferredStyle: (form as any).strengthBaseline?.preferredStyle ?? "",
                        },
                      } as any);
                    }}
                    className="rounded border-border"
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="block mt-2">
              <span className="text-sm mb-1 block">Other approach</span>
              <input
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Describe other approach..."
                value={(form as any).strengthBaseline?.trainingApproachOther || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    strengthBaseline: {
                      ...((form as any).strengthBaseline || {}),
                      trainingApproachOther: e.target.value,
                    },
                  } as any)
                }
              />
            </label>
          </div>

          <div>
            <span className="text-sm mb-2 block">Physique priorities</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["general", "General muscle growth"],
                ["chest", "Chest"],
                ["arms", "Arms"],
                ["back", "Back"],
                ["shoulders", "Shoulders"],
                ["legs", "Legs"],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={((form as any).strengthBaseline?.physiquePriorities ?? []).includes(value)}
                    onChange={(e) => {
                      const current = (form as any).strengthBaseline?.physiquePriorities ?? [];
                      const next = e.target.checked
                        ? [...current, value]
                        : current.filter((p: string) => p !== value);
                      setForm({
                        ...form,
                        strengthBaseline: {
                          ...((form as any).strengthBaseline || {}),
                          experience: (form as any).strengthBaseline?.experience ?? "intermediate",
                          trainingApproaches: (form as any).strengthBaseline?.trainingApproaches ?? ["mentzer"],
                          physiquePriorities: next,
                          preferredStyle: (form as any).strengthBaseline?.preferredStyle ?? "",
                        },
                      } as any);
                    }}
                    className="rounded border-border"
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="block mt-2">
              <span className="text-sm mb-1 block">Other physique focus</span>
              <input
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. core, glutes, calves..."
                value={(form as any).strengthBaseline?.physiqueOther || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    strengthBaseline: {
                      ...((form as any).strengthBaseline || {}),
                      physiqueOther: e.target.value,
                    },
                  } as any)
                }
              />
            </label>
          </div>
        </div>
      </section>

      {/* Goals */}
      <section className="space-y-4">
        <h3 className="font-medium text-sm text-muted uppercase tracking-wide">Goals & Priorities</h3>
        <div className="space-y-2">
          {form.goals.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2"
            >
              <span className="flex-1 text-sm">{g.title}</span>
              <select
                className="bg-background border border-border rounded px-2 py-1 text-xs"
                value={g.priority}
                onChange={(e) => {
                  const priority = Number(e.target.value) as 1 | 2 | 3 | 4 | 5;
                  setForm({
                    ...form,
                    goals: form.goals.map((goal) =>
                      goal.id === g.id ? { ...goal, priority } : goal
                    ),
                  });
                }}
              >
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>
                    P{p}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  setForm({ ...form, goals: form.goals.filter((x) => x.id !== g.id) })
                }
                className="text-muted hover:text-danger text-xs"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="Add a goal (e.g. Sub-4h marathon, +5kg bench)"
            value={newGoalTitle}
            onChange={(e) => setNewGoalTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGoal()}
          />
          <button
            onClick={addGoal}
            className="px-4 py-2 bg-accent/20 text-accent rounded-lg text-sm font-medium hover:bg-accent/30"
          >
            Add
          </button>
        </div>
      </section>

      {/* Equipment */}
      <section className="space-y-4">
        <h3 className="font-medium text-sm text-muted uppercase tracking-wide">Equipment</h3>
        <div className="space-y-4">
          {[
            {
              title: "Access",
              items: [
                ["gymAccess", "Gym Access"],
                ["homeGym", "Home Gym"],
                ["outdoorAccess", "Outdoor / Park"],
                ["trailAccess", "Trail Access"],
              ],
            },
            {
              title: "Free Weights",
              items: [
                ["barbell", "Barbell"],
                ["dumbbells", "Dumbbells"],
                ["kettlebells", "Kettlebells"],
                ["weightPlates", "Weight Plates"],
                ["rack", "Rack / Squat Rack"],
                ["bench", "Bench"],
              ],
            },
            {
              title: "Bodyweight",
              items: [
                ["pullUpBar", "Pull-up Bar"],
                ["dipBars", "Dip Bars"],
                ["parallettes", "Parallettes"],
              ],
            },
            {
              title: "Machines & Cardio",
              items: [
                ["machines", "Weight Machines"],
                ["cableMachine", "Cable Machine"],
                ["treadmill", "Treadmill"],
                ["indoorBike", "Indoor Bike"],
                ["rower", "Rower"],
              ],
            },
            {
              title: "Other",
              items: [
                ["resistanceBands", "Resistance Bands"],
                ["weightedVest", "Weighted Vest"],
                ["plyoBox", "Plyo Box"],
                ["medicineBall", "Medicine Ball"],
              ],
            },
          ].map((group) => (
            <details key={group.title} className="bg-background border border-border rounded-lg" open>
              <summary className="px-3 py-2 text-sm font-medium cursor-pointer select-none">
                {group.title}
              </summary>
              <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                {group.items.map(([key, label]) => (
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
            </details>
          ))}
        </div>
      </section>

      {/* Constraints */}
      <section className="space-y-4">
        <h3 className="font-medium text-sm text-muted uppercase tracking-wide">
          Constraints & Notes
        </h3>
        <textarea
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="Injuries, time constraints, preferences, past injuries, anything else the coach should know..."
          value={form.constraints}
          onChange={(e) => setForm({ ...form, constraints: e.target.value })}
        />
      </section>

      <button
        onClick={handleSave}
        className="w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
      >
        Save Profile
      </button>
    </div>
  );
}

// ==================== PLAN VIEW ====================
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

  // Group by week
  const byWeek: Record<string, Workout[]> = {};
  plan.workouts.forEach((w) => {
    const weekStart = format(startOfWeek(parseISO(w.date), { weekStartsOn: 1 }), "yyyy-MM-dd");
    if (!byWeek[weekStart]) byWeek[weekStart] = [];
    byWeek[weekStart].push(w);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{plan.name}</h2>
          <p className="text-muted text-sm mt-1">
            {format(parseISO(plan.startDate), "MMM d")} –{" "}
            {format(parseISO(plan.endDate), "MMM d, yyyy")} · Generated{" "}
            {format(parseISO(plan.generatedAt), "MMM d")}
          </p>
        </div>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="px-4 py-2 bg-card border border-border hover:bg-card-hover rounded-lg text-sm font-medium flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
          Regenerate
        </button>
      </div>

      <p className="text-sm text-muted bg-card border border-border rounded-lg p-4">
        {plan.notes}
      </p>

      {Object.entries(byWeek).map(([weekStart, weekWorkouts]) => (
        <div key={weekStart}>
          <h3 className="font-medium text-sm text-muted mb-3">
            Week of {format(parseISO(weekStart), "MMM d")}
          </h3>
          <div className="space-y-2">
            {weekWorkouts.map((w) => (
              <WorkoutCard key={w.id} workout={w} onToggle={onToggleComplete} onOpen={onOpenWorkout} />
            ))}
          </div>
        </div>
      ))}
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

// ==================== SYNC ====================
function SyncView({ plan }: { plan: TrainingPlan | null }) {
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importError, setImportError] = useState(false);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg(null);
    const result = await importData(file);
    setImportError(!result.ok);
    setImportMsg(result.message);
    if (result.ok) {
      // Reload the page so all state picks up the new data
      setTimeout(() => window.location.reload(), 1200);
    }
    e.target.value = "";
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-semibold">Data & Sync</h2>
        <p className="text-muted mt-1">
          Your data stays private on this device. Use backup to move it safely.
        </p>
      </div>

      {/* Privacy status */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-3">
        <Shield className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-foreground">Fully private mode</p>
          <p className="text-muted mt-1">
            All your profile, plans and workouts are stored only in this browser.
            Nothing is sent to any server. When you are ready we can connect your
            own private cloud for automatic sync across devices.
          </p>
        </div>
      </div>

      {/* Backup / Restore */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold">Backup & Restore</h3>
        <p className="text-sm text-muted">
          Download a full backup of your data, or restore it on another device / browser.
          Keep the file somewhere safe (it contains your training history and goals).
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => exportData()}
            className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Download Backup
          </button>

          <label className="px-4 py-2.5 bg-background border border-border hover:bg-card-hover rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" /> Restore Backup
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImport}
            />
          </label>
        </div>
        {importMsg && (
          <p className={`text-sm ${importError ? "text-red-400" : "text-success"}`}>
            {importMsg}
          </p>
        )}
      </div>

      {/* Garmin */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#000] flex items-center justify-center text-white font-bold text-sm">
            G
          </div>
          <div>
            <h3 className="font-semibold">Garmin Connect</h3>
            <p className="text-xs text-muted">Push plans · Pull activities</p>
          </div>
        </div>
        <p className="text-sm text-muted">
          Export your training plan as a calendar file and import it into Garmin Connect
          (or any calendar app).
        </p>
        <button
          onClick={() => plan && downloadICS(plan)}
          disabled={!plan}
          className="px-4 py-2 bg-background border border-border rounded-lg text-sm flex items-center gap-2 hover:bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" /> Export Plan as .ics
        </button>
        {!plan && (
          <p className="text-xs text-amber-400">Generate a training plan first to enable export.</p>
        )}
      </div>

      {/* Strava */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FC4C02] flex items-center justify-center text-white font-bold text-sm">
            S
          </div>
          <div>
            <h3 className="font-semibold">Strava</h3>
            <p className="text-xs text-muted">Import activities · Analyze effort</p>
          </div>
        </div>
        <p className="text-sm text-muted">
          Coming in a later update: connect Strava so completed runs automatically mark
          plan workouts as done.
        </p>
        <button
          disabled
          className="px-4 py-2 bg-[#FC4C02]/60 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-not-allowed"
        >
          <Upload className="w-4 h-4" /> Connect Strava (later)
        </button>
      </div>
    </div>
  );
}
