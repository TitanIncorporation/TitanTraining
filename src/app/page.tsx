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
import {
  cloudSaveProfile,
  cloudLoadProfile,
  cloudSavePlanAndWorkouts,
  cloudLoadLatestPlan,
  cloudSaveWorkouts,
} from "@/lib/cloud";
import Auth from "@/components/Auth";
import WorkoutDetail from "@/components/WorkoutDetail";

function ConstraintsBox({
  value,
  onSubmit,
  generating,
}: {
  value: string;
  onSubmit: (text: string) => void;
  generating?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-2">
      <h3 className="font-medium">Constraints &amp; notes</h3>
      <p className="text-xs text-muted">
        Active only while text is here. To clear an injury/travel note, delete the text and hit Submit (or Clear) — it will stop appearing in the plan description.
      </p>
      <textarea
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm min-h-[72px]"
        placeholder="e.g. Sore Achilles — easy only this week · Travel Tue off"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium"
          onClick={() => onSubmit(text.trim())}
        >
          Submit
        </button>
        <button
          type="button"
          className="px-4 py-2 bg-background border border-border rounded-lg text-sm"
          onClick={() => {
            setText("");
            onSubmit("");
          }}
        >
          Clear (constraint lifted)
        </button>
      </div>
      {generating && <p className="text-xs text-muted">Updating upcoming sessions…</p>}
    </div>
  );
}

function formatWorkoutType(type: string): string {
  const map: Record<string, string> = {
    heavy_duty: "Heavy Duty",
    hypertrophy: "Hypertrophy",
    functional: "Functional",
    strength: "Strength",
    easy_run: "Easy run",
    long_run: "Long run",
    trail_run: "Trail run",
    tempo: "Tempo",
    intervals: "Intervals",
  };
  return map[type] || type.replace(/_/g, " ");
}

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
  const [cloudStatus, setCloudStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [cloudMsg, setCloudMsg] = useState("");
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

  // Load local first; then merge/prefer cloud profile if logged in
  useEffect(() => {
    const p = loadProfile();
    const pl = loadPlan();
    const w = loadWorkouts();
    if (p) setProfile(p);
    if (pl) setPlan(pl);
    setWorkouts(w);

    (async () => {
      try {
        const cloud = await cloudLoadProfile();
        if (cloud) {
          const localUpdated = p?.updatedAt ? new Date(p.updatedAt).getTime() : 0;
          const cloudUpdated = cloud.updatedAt ? new Date(cloud.updatedAt).getTime() : 0;
          if (!p || cloudUpdated >= localUpdated) {
            setProfile(cloud);
            saveProfile(cloud);
          }
        }
        const cloudPlan = await cloudLoadLatestPlan();
        if (cloudPlan) {
          if (!pl || (cloudPlan.generatedAt && (!pl.generatedAt || cloudPlan.generatedAt >= pl.generatedAt))) {
            setPlan(cloudPlan);
            savePlan(cloudPlan);
          }
        }
      } catch (e) {
        console.warn("Cloud load skipped", e);
      }
    })();
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

  const handleSaveProfile = async (updated: AthleteProfile) => {
    saveProfile(updated);
    setProfile(updated);
    const result = await cloudSaveProfile(updated);
    if (result.ok) {
      setCloudStatus("ok");
      setCloudMsg("Profile Saved");
    } else {
      setCloudStatus("fail");
      setCloudMsg(result.message);
      alert("Save to database failed:\n" + result.message);
    }
    // Auto-rebuild future sessions only from new profile
    setGenerating(true);
    try {
      const newPlan = generateTrainingPlan(updated, 4, plan || undefined);
      setPlan(newPlan);
      savePlan(newPlan);
      const cloud = await cloudSavePlanAndWorkouts(newPlan);
      if (cloud.ok) {
        setCloudStatus("ok");
        setCloudMsg("Plan Saved");
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleConstraintsChange = async (text: string) => {
    if (!profile) return;
    const updated = { ...profile, constraints: text };
    saveProfile(updated);
    setProfile(updated);
    await cloudSaveProfile(updated);
    setGenerating(true);
    try {
      const newPlan = generateTrainingPlan(updated, 4, plan || undefined);
      setPlan(newPlan);
      savePlan(newPlan);
      await cloudSavePlanAndWorkouts(newPlan);
      setCloudStatus("ok");
      setCloudMsg("Plan Saved");
    } finally {
      setGenerating(false);
    }
  };

  const handleGeneratePlan = () => {
    if (!profile) return;
    setGenerating(true);
    setTimeout(async () => {
      // Pass existing plan so regeneration keeps completed history & continues forward
      const newPlan = generateTrainingPlan(profile, 4, plan || undefined);
      setPlan(newPlan);
      savePlan(newPlan);
      const cloud = await cloudSavePlanAndWorkouts(newPlan);
      if (cloud.ok) {
        setCloudStatus("ok");
        setCloudMsg("Plan Saved");
      } else {
        setCloudStatus("fail");
        setCloudMsg(cloud.message);
      }
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

  const updateWorkoutNotes = async (workoutId: string, notes: string) => {
    if (!plan) return;
    const updatedWorkouts = plan.workouts.map((w) =>
      w.id === workoutId ? { ...w, notes } : w
    );
    const updatedPlan = { ...plan, workouts: updatedWorkouts };
    setPlan(updatedPlan);
    savePlan(updatedPlan);
    setSelectedWorkout((sw) => (sw && sw.id === workoutId ? { ...sw, notes } : sw));
    // notes live inside workout JSON — no new DB column required
    const w = updatedWorkouts.find((x) => x.id === workoutId);
    if (w) {
      try {
        await cloudSaveWorkouts([w]);
      } catch {
        /* local already saved */
      }
    }
  };

  const navItems = [
    { id: "dashboard" as Tab, label: "Dashboard", icon: LayoutDashboard },
    { id: "plan" as Tab, label: "Training Plan", icon: Calendar },
    { id: "profile" as Tab, label: "Profile", icon: User },
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

      {cloudStatus !== "idle" && (
          <div
            className={`mx-4 mt-2 px-3 py-2 rounded-lg text-xs ${
              cloudStatus === "ok" ? "bg-success/15 text-success" : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {cloudMsg}
          </div>
        )}
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
              onConstraintsChange={handleConstraintsChange}
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
              onConstraintsChange={handleConstraintsChange}
            />
          )}
          {tab === "sync" && <SyncView plan={plan} />}
        </div>
      </main>

      {selectedWorkout && (
        <WorkoutDetail
          workout={selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
          onNotesChange={updateWorkoutNotes}
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
  onConstraintsChange,
}: {
  profile: AthleteProfile | null;
  plan: TrainingPlan | null;
  workouts: Workout[];
  onGenerate: () => void;
  generating: boolean;
  setTab: (t: Tab) => void;
  onConstraintsChange: (text: string) => void;
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

      <ConstraintsBox
        value={profile.constraints || ""}
        onSubmit={onConstraintsChange}
        generating={generating}
      />

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
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Progress & trajectory</h3>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${totalPlanned ? Math.round((completedCount / totalPlanned) * 100) : 0}%` }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted uppercase tracking-wide">Completion</p>
              <p className="text-lg font-semibold mt-0.5">
                {totalPlanned ? `${Math.round((completedCount / totalPlanned) * 100)}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wide">Sessions</p>
              <p className="text-lg font-semibold mt-0.5">{completedCount}/{totalPlanned}</p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wide">Planned load</p>
              <p className="text-lg font-semibold mt-0.5">
                {Math.round(plan.workouts.reduce((s, w) => s + (w.plannedDurationMin || 0), 0) / 60)}h
              </p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wide">Block</p>
              <p className="text-sm font-semibold mt-0.5 truncate">{plan.name}</p>
            </div>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Consistency beats perfection. Mark sessions done so the next update keeps history and adapts load.
            {profile.goals.filter((g) => g.priority === 5).length > 0
              ? ` Top focus: ${profile.goals.filter((g) => g.priority === 5).map((g) => g.title).join(", ")}.`
              : ""}
          </p>
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
                  {formatWorkoutType(w.type)}
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
        preferredLongRunDay: 6,
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
      additionalConsiderations: "",
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as AthleteProfile)
  );

  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalType, setNewGoalType] = useState<string>("running");
  const [goalNameError, setGoalNameError] = useState(false);
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

  // Draft strings so mobile typing is not blocked; non-overlap on blur
  const [hrDraft, setHrDraft] = useState<{ max?: string; rest?: string }>({});
  const [zoneDraft, setZoneDraft] = useState<Record<string, string>>({});
  const zoneVal = (z: string, which: 0 | 1) => {
    const key = `${z}_${which}`;
    if (key in zoneDraft) return zoneDraft[key];
    return String(form.hrZones.zones[z as "z1"][which]);
  };
  const setZoneTyping = (z: "z1"|"z2"|"z3"|"z4"|"z5", which: 0 | 1, raw: string) => {
    setZoneDraft((d) => ({ ...d, [`${z}_${which}`]: raw }));
  };
  const commitZone = (z: "z1"|"z2"|"z3"|"z4"|"z5", which: 0 | 1) => {
    const key = `${z}_${which}`;
    const raw = zoneDraft[key];
    if (raw === undefined) return;
    const val = Number(raw);
    if (raw === "" || Number.isNaN(val)) {
      setZoneDraft((d) => {
        const n = { ...d };
        delete n[key];
        return n;
      });
      return;
    }
    const zones = {
      z1: [...form.hrZones.zones.z1] as [number, number],
      z2: [...form.hrZones.zones.z2] as [number, number],
      z3: [...form.hrZones.zones.z3] as [number, number],
      z4: [...form.hrZones.zones.z4] as [number, number],
      z5: [...form.hrZones.zones.z5] as [number, number],
    };
    zones[z][which] = val;
    if (zones[z][0] > zones[z][1]) {
      if (which === 0) zones[z][1] = zones[z][0];
      else zones[z][0] = zones[z][1];
    }
    const order: ("z1"|"z2"|"z3"|"z4"|"z5")[] = ["z1","z2","z3","z4","z5"];
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i];
      const b = order[i + 1];
      if (zones[b][0] <= zones[a][1]) {
        zones[b][0] = zones[a][1] + 1;
        if (zones[b][1] < zones[b][0]) zones[b][1] = zones[b][0];
      }
    }
    setForm({ ...form, hrZones: { ...form.hrZones, zones } });
    setZoneDraft((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
  };



  const commitZoneSelect = (z: "z1"|"z2"|"z3"|"z4"|"z5", which: 0 | 1, val: number) => {
    const zones = {
      z1: [...form.hrZones.zones.z1] as [number, number],
      z2: [...form.hrZones.zones.z2] as [number, number],
      z3: [...form.hrZones.zones.z3] as [number, number],
      z4: [...form.hrZones.zones.z4] as [number, number],
      z5: [...form.hrZones.zones.z5] as [number, number],
    };
    zones[z][which] = val;
    if (zones[z][0] > zones[z][1]) {
      if (which === 0) zones[z][1] = zones[z][0];
      else zones[z][0] = zones[z][1];
    }
    const order: ("z1"|"z2"|"z3"|"z4"|"z5")[] = ["z1","z2","z3","z4","z5"];
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i];
      const b = order[i + 1];
      if (zones[b][0] <= zones[a][1]) {
        zones[b][0] = zones[a][1] + 1;
        if (zones[b][1] < zones[b][0]) zones[b][1] = zones[b][0];
      }
    }
    setForm({ ...form, hrZones: { ...form.hrZones, zones } });
  };

  const addGoal = () => {
    if (!newGoalTitle.trim()) {
      setGoalNameError(true);
      return;
    }
    setGoalNameError(false);
    const isRoadRace = newGoalType === "running" || newGoalType === "race";
    const isTrail = newGoalType === "trail_running" || newGoalType === "trail_race";
    const isStrength = newGoalType === "strength";
    const isCustom = newGoalType === "custom";
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
      type: (isTrail || isRoadRace ? "race" : isCustom ? "custom" : newGoalType) as any,
      title: newGoalTitle.trim(),
      priority: (newGoalIsTop ? 5 : 3) as 1 | 2 | 3 | 4 | 5,
      targetDate: newGoalDate || undefined,
      sport: isTrail ? "trail_running" : isRoadRace ? "running" : isStrength ? "strength" : isCustom ? undefined : undefined,
      metrics: isRoadRace || isTrail
        ? {
            distanceKm: newGoalDistance ? Number(newGoalDistance) : undefined,
            timeMinutes,
            paceMinPerKm: !isTrail && newGoalPace
              ? (newGoalPace.includes(":")
                  ? (() => {
                      const [m, s] = newGoalPace.split(":");
                      return (Number(m) || 0) + (Number(s) || 0) / 60;
                    })()
                  : Number(newGoalPace))
              : undefined,
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

  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    try {
      onSave({
        ...form,
        updatedAt: new Date().toISOString(),
        createdAt: form.createdAt || new Date().toISOString(),
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } finally {
      setSaving(false);
    }
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
          <label className="block col-span-2">
            <span className="text-sm mb-1 block">Name</span>
            <input
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="Your name"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
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
              value={form.sports.includes(form.primarySport) ? form.primarySport : (form.sports[0] || "")}
              onChange={(e) => setForm({ ...form, primarySport: e.target.value as any })}
            >
              {form.sports.length === 0 && <option value="">Select sports first</option>}
              {form.sports.includes("running") && <option value="running">Road Running</option>}
              {form.sports.includes("trail_running") && <option value="trail_running">Trail Running</option>}
              {form.sports.includes("strength") && <option value="strength">Strength / Hypertrophy</option>}
              {form.sports.includes("conditioning") && <option value="conditioning">Conditioning</option>}
              {form.sports.includes("cycling") && <option value="cycling">Cycling</option>}
              {form.sports.includes("triathlon") && <option value="triathlon">Triathlon</option>}
              {((form as any).customSportsList || []).map((s: string) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm mb-1 block">Second priority sport</span>
            <select
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={
                form.sports.includes((form as any).secondarySport)
                  ? (form as any).secondarySport
                  : form.sports.find((s) => s !== form.primarySport) || ""
              }
              onChange={(e) => setForm({ ...form, secondarySport: e.target.value } as any)}
            >
              <option value="">None</option>
              {form.sports.includes("running") && form.primarySport !== "running" && (
                <option value="running">Road Running</option>
              )}
              {form.sports.includes("trail_running") && form.primarySport !== "trail_running" && (
                <option value="trail_running">Trail Running</option>
              )}
              {form.sports.includes("strength") && form.primarySport !== "strength" && (
                <option value="strength">Strength / Hypertrophy</option>
              )}
              {form.sports.includes("conditioning") && form.primarySport !== "conditioning" && (
                <option value="conditioning">Conditioning</option>
              )}
              {form.sports.includes("cycling") && form.primarySport !== "cycling" && (
                <option value="cycling">Cycling</option>
              )}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm mb-1 block">Max HR</span>
            <input
              type="number"
              inputMode="numeric"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={hrDraft.max ?? String(form.hrZones.maxHR)}
              onChange={(e) => setHrDraft((d) => ({ ...d, max: e.target.value }))}
              onBlur={() => {
                const raw = hrDraft.max;
                if (raw === undefined) return;
                const maxHR = raw === "" || Number.isNaN(Number(raw)) ? form.hrZones.maxHR : Number(raw);
                const resting = form.hrZones.restingHR;
                setForm({ ...form, hrZones: defaultHRZones(maxHR, resting) });
                setHrDraft((d) => {
                  const n = { ...d };
                  delete n.max;
                  return n;
                });
              }}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <label className="block">
            <span className="text-sm mb-1 block">Resting HR</span>
            <input
              type="number"
              inputMode="numeric"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={hrDraft.rest ?? String(form.hrZones.restingHR)}
              onChange={(e) => setHrDraft((d) => ({ ...d, rest: e.target.value }))}
              onBlur={() => {
                const raw = hrDraft.rest;
                if (raw === undefined) return;
                const resting = raw === "" || Number.isNaN(Number(raw)) ? form.hrZones.restingHR : Number(raw);
                const maxHR = form.hrZones.maxHR;
                setForm({ ...form, hrZones: defaultHRZones(maxHR, resting) });
                setHrDraft((d) => {
                  const n = { ...d };
                  delete n.rest;
                  return n;
                });
              }}
              onFocus={(e) => e.target.select()}
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
          <span className="text-sm mb-2 block">Hours available per day</span>
          <p className="text-xs text-muted mb-2">Set hours for each day you train (no zero — use training days/week above for how many days).</p>
          <div className="space-y-2">
            {(
              [
                ["monday", "Monday"],
                ["tuesday", "Tuesday"],
                ["wednesday", "Wednesday"],
                ["thursday", "Thursday"],
                ["friday", "Friday"],
                ["saturday", "Saturday"],
                ["sunday", "Sunday"],
              ] as const
            ).map(([day, label]) => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-24 text-sm text-muted shrink-0">{label}</span>
                <select
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  value={(() => {
                    const h = Number(form.weeklyAvailability[day] ?? 0);
                    if (h >= 2.4) return "2+";
                    if (h === 0) return "0";
                    if (Math.abs(h - 0.5) < 0.01) return "0.5";
                    if (Math.abs(h - 1.5) < 0.01) return "1.5";
                    if (Math.abs(h - 1) < 0.01) return "1";
                    if (Math.abs(h - 2) < 0.01) return "2";
                    return String(h);
                  })()}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const v = raw === "2+" ? 2.5 : parseFloat(raw);
                    setForm({
                      ...form,
                      weeklyAvailability: {
                        ...form.weeklyAvailability,
                        [day]: Number.isFinite(v) ? v : 0,
                      },
                    });
                  }}
                >
                  <option value="0">0 h (off)</option>
                  <option value="0.5">0.5 h</option>
                  <option value="1">1 h</option>
                  <option value="1.5">1.5 h</option>
                  <option value="2">2 h</option>
                  <option value="2+">+2 h</option>
                </select>
              </div>
            ))}
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
            <span className="text-sm mb-1 block">Preferred long-run day</span>
            <select
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={
                (form as any).runningBaseline?.preferredLongRunDay === null ||
                (form as any).runningBaseline?.preferredLongRunDay === undefined
                  ? ""
                  : String((form as any).runningBaseline.preferredLongRunDay)
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  runningBaseline: {
                    ...((form as any).runningBaseline || {}),
                    preferredLongRunDay:
                      e.target.value === "" ? null : Number(e.target.value),
                  },
                } as any)
              }
            >
              <option value="">Auto (longest available day)</option>
              <option value="0">Monday</option>
              <option value="1">Tuesday</option>
              <option value="2">Wednesday</option>
              <option value="3">Thursday</option>
              <option value="4">Friday</option>
              <option value="5">Saturday</option>
              <option value="6">Sunday</option>
            </select>
            <p className="text-[10px] text-muted mt-1">
              Availability still wins: if that day has too little time, long run moves and we note it in the plan.
            </p>
          </label>
          <label className="block">
            <span className="text-sm mb-1 block">Weekly volume (km)</span>
            <input
              type="number"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={
                (form as any).runningBaseline?.weeklyVolumeKm === "" ||
                (form as any).runningBaseline?.weeklyVolumeKm === undefined
                  ? ""
                  : (form as any).runningBaseline?.weeklyVolumeKm
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  runningBaseline: {
                    ...((form as any).runningBaseline || {}),
                    weeklyVolumeKm: e.target.value === "" ? ("" as any) : Number(e.target.value),
                  },
                } as any)
              }
              onFocus={(e) => e.target.select()}
            />
          </label>
          <label className="block">
            <span className="text-sm mb-1 block">Longest run last 30 days (km)</span>
            <input
              type="number"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={
                (form as any).runningBaseline?.longestRunLast30DaysKm === "" ||
                (form as any).runningBaseline?.longestRunLast30DaysKm === undefined ||
                (form as any).runningBaseline?.longestRunLast30DaysKm === null
                  ? ""
                  : (form as any).runningBaseline?.longestRunLast30DaysKm
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  runningBaseline: {
                    ...((form as any).runningBaseline || {}),
                    longestRunLast30DaysKm: e.target.value === "" ? ("" as any) : Number(e.target.value),
                  },
                } as any)
              }
              onFocus={(e) => e.target.select()}
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
                <select
                  className="w-full bg-card border border-border rounded px-0.5 py-1.5 text-center text-foreground text-[11px]"
                  value={form.hrZones.zones[z][0]}
                  onChange={(e) => commitZoneSelect(z, 0, Number(e.target.value))}
                >
                  {Array.from({ length: 121 }, (_, i) => i + 80).map((bpm) => (
                    <option key={`l${bpm}`} value={bpm}>{bpm}</option>
                  ))}
                </select>
                <select
                  className="w-full bg-card border border-border rounded px-0.5 py-1.5 text-center text-foreground text-[11px]"
                  value={form.hrZones.zones[z][1]}
                  onChange={(e) => commitZoneSelect(z, 1, Number(e.target.value))}
                >
                  {Array.from({ length: 121 }, (_, i) => i + 80).map((bpm) => (
                    <option key={`h${bpm}`} value={bpm}>{bpm}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted mb-2">
              Approx flat paces by zone — Time (mm:ss) per km. Calibrate with a race goal for accuracy.
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
                  {g.metrics?.paceMinPerKm ? ` · ${Math.floor(g.metrics.paceMinPerKm)}:${String(Math.round((g.metrics.paceMinPerKm % 1) * 60)).padStart(2, "0")}/km` : ""}
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
          <div>
            <input
              className={`w-full bg-background border rounded-lg px-3 py-2 text-sm ${
                goalNameError ? "border-red-500 ring-1 ring-red-500" : "border-border"
              }`}
              placeholder="Name (required)"
              value={newGoalTitle}
              onChange={(e) => {
                setNewGoalTitle(e.target.value);
                if (e.target.value.trim()) setGoalNameError(false);
              }}
            />
            {goalNameError && (
              <p className="text-xs text-red-500 mt-1">Name is required to add a goal.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
              value={newGoalType}
              onChange={(e) => setNewGoalType(e.target.value)}
            >
              <option value="running">Running</option>
              <option value="trail_running">Trail Running</option>
              <option value="strength">Strength</option>
              <option value="custom">Custom</option>
            </select>
            <div className="relative flex gap-1">
              <input
                type="date"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm min-w-0"
                value={newGoalDate}
                onChange={(e) => setNewGoalDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" || e.key === "Delete") {
                    e.preventDefault();
                    setNewGoalDate("");
                  }
                }}
              />
              {newGoalDate && (
                <button
                  type="button"
                  className="px-2 text-xs text-muted border border-border rounded-lg shrink-0"
                  onClick={() => setNewGoalDate("")}
                  title="Clear date"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Running targets */}
          {newGoalType === "running" && (
            <div className="space-y-1">
            <p className="text-[10px] text-muted">Distance (km) · Time (hh:mm) · Pace/km (mm:ss)</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <input
                  type="number"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="Distance (km)"
                  value={newGoalDistance}
                  onChange={(e) => setNewGoalDistance(e.target.value)}
                />
              </div>
              <div>
                <input
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="Time (hh:mm)"
                  value={newGoalTime}
                  onChange={(e) => setNewGoalTime(e.target.value)}
                />
              </div>
              <div>
                <input
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="Pace/km (mm:ss)"
                  inputMode="text"
                  value={newGoalPace}
                  onChange={(e) => setNewGoalPace(e.target.value)}
                />
              </div>
            </div>
            </div>
          )}
          {newGoalType === "trail_running" && (
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
      <ProfileSection title="Additional considerations" defaultOpen={true}>
        <p className="text-xs text-muted mb-2">
          Extra instructions for the engine (e.g. use indoor bike as running cross-training, prefer morning sessions).
        </p>
        <textarea
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm min-h-[72px]"
          placeholder="e.g. Include indoor bike sessions as part of running volume when needed"
          value={(form as any).additionalConsiderations || ""}
          onChange={(e) =>
            setForm({ ...form, additionalConsiderations: e.target.value } as any)
          }
        />
      </ProfileSection>

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

      {savedFlash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-success text-white text-sm font-medium shadow-lg">
          Profile Saved
        </div>
      )}
      <div className="sticky bottom-0 pt-4 pb-2 bg-background/95 backdrop-blur border-t border-border -mx-1 px-1 z-10">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 bg-accent hover:opacity-90 active:scale-[0.99] disabled:opacity-70 text-white rounded-xl font-semibold text-base shadow-lg"
        >
          {saving ? "Saving…" : savedFlash ? "Saved ✓" : "Save profile"}
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
  onConstraintsChange,
}: {
  plan: TrainingPlan | null;
  profile: AthleteProfile | null;
  onGenerate: () => void;
  generating: boolean;
  onToggleComplete: (id: string) => void;
  onOpenWorkout: (w: Workout) => void;
  onConstraintsChange: (text: string) => void;
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
          {generating ? "Updating…" : "Update plan"}
        </button>
      </div>

      {plan.notes && (
        <div className="text-sm text-muted bg-card border border-border rounded-lg px-4 py-3 leading-relaxed space-y-1">
          {plan.notes.split("\n").filter(Boolean).map((line, i) => (
            <p
              key={i}
              className={
                /constraint|callout/i.test(line)
                  ? "text-amber-400/90 font-medium"
                  : "text-muted"
              }
            >
              {line.trim()}
            </p>
          ))}
        </div>
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

      {/* Constraints between calendar and list */}
      {profile && (
        <ConstraintsBox
          value={profile.constraints || ""}
          onSubmit={onConstraintsChange}
        />
      )}

      {/* List grouped by week */}
      <div className="space-y-6">
        <h3 className="font-semibold">Sessions by week</h3>
        {(() => {
          const byWeek: { label: string; key: string; items: typeof sortedWorkouts }[] = [];
          const map = new Map<string, typeof sortedWorkouts>();
          sortedWorkouts.forEach((w) => {
            const ws = startOfWeek(parseISO(w.date), { weekStartsOn: 1 });
            const we = addDays(ws, 6);
            const key = format(ws, "yyyy-MM-dd");
            const label = `Week: ${format(ws, "d MMM")} – ${format(we, "d MMM")}`;
            if (!map.has(key)) {
              map.set(key, []);
              byWeek.push({ label, key, items: map.get(key)! });
            }
            map.get(key)!.push(w);
          });
          return byWeek.map((week) => (
            <div key={week.key}>
              <h4 className="text-sm font-medium text-muted mb-2">{week.label}</h4>
              <div className="space-y-2">
                {week.items.map((w) => (
                  <WorkoutCard key={w.id} workout={w} onToggle={onToggleComplete} onOpen={onOpenWorkout} />
                ))}
              </div>
            </div>
          ));
        })()}
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
                {formatWorkoutType(workout.type)}
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              {format(parseISO(workout.date), "EEE d MMM")}
              {workout.plannedDurationMin ? ` · ${workout.plannedDurationMin} min` : ""}
              {workout.plannedDistanceKm ? ` · ~${workout.plannedDistanceKm} km` : ""}
              {workout.plannedIntensity ? ` · ${workout.plannedIntensity.toUpperCase()}` : ""}
            </p>
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
        <h2 className="text-2xl font-semibold">Data &amp; Sync</h2>
        <p className="text-muted mt-1">
          Bring in past files and connect live sources when you are ready.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-medium">1. Import history</h3>
        <p className="text-sm text-muted">
          Upload activity files exported from Strava, Garmin, or similar (GPX, FIT, TCX, or CSV). This does not require a live Strava connection.
        </p>
        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border text-sm cursor-pointer hover:border-accent">
          <span>Choose files</span>
          <input
            type="file"
            accept=".gpx,.fit,.tcx,.csv,.json"
            multiple
            className="hidden"
            onChange={() => {
              alert("File import will process GPX/FIT/TCX/CSV in the next step. Files are selected for now.");
            }}
          />
        </label>
        {plan && (
          <p className="text-xs text-muted">
            Current plan: {plan.name} ({plan.workouts?.length || 0} sessions)
          </p>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-medium">2. Connect Strava</h3>
        <p className="text-sm text-muted">
          Link Strava for ongoing activity sync and matching to planned sessions.
        </p>
        <button
          type="button"
          disabled
          className="px-4 py-2 rounded-lg bg-accent/80 text-white text-sm cursor-not-allowed opacity-70"
        >
          Connect Strava (next)
        </button>
      </div>
    </div>
  );
}

