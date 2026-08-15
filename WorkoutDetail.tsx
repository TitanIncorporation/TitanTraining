"use client";

import { Workout } from "@/types";
import { format, parseISO } from "date-fns";
import { X, CheckCircle2, Circle } from "lucide-react";

export default function WorkoutDetail({
  workout,
  onClose,
  onToggle,
}: {
  workout: Workout;
  onClose: () => void;
  onToggle: (id: string) => void;
}) {
  const isStrength = workout.sport === "strength";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#141a22] border border-[#243041] rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#141a22] border-b border-[#243041] px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg text-white">{workout.title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {format(parseISO(workout.date), "EEEE, MMM d")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[#1a222d] text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status */}
          <button
            onClick={() => onToggle(workout.id)}
            className="flex items-center gap-3 w-full p-3 rounded-xl bg-[#0c0f14] border border-[#243041] hover:border-blue-500/50 transition-colors"
          >
            {workout.completed ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : (
              <Circle className="w-6 h-6 text-slate-500" />
            )}
            <span className="text-sm font-medium text-white">
              {workout.completed ? "Completed" : "Mark as complete"}
            </span>
          </button>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            {workout.plannedDurationMin && (
              <div className="bg-[#0c0f14] rounded-xl p-3">
                <p className="text-xs text-slate-400">Duration</p>
                <p className="text-white font-medium">{workout.plannedDurationMin} min</p>
              </div>
            )}
            {workout.plannedDistanceKm && (
              <div className="bg-[#0c0f14] rounded-xl p-3">
                <p className="text-xs text-slate-400">Distance</p>
                <p className="text-white font-medium">~{workout.plannedDistanceKm} km</p>
              </div>
            )}
            {workout.plannedIntensity && (
              <div className="bg-[#0c0f14] rounded-xl p-3">
                <p className="text-xs text-slate-400">Intensity</p>
                <p className="text-white font-medium uppercase">{workout.plannedIntensity}</p>
              </div>
            )}
            <div className="bg-[#0c0f14] rounded-xl p-3">
              <p className="text-xs text-slate-400">Type</p>
              <p className="text-white font-medium capitalize">{workout.type.replace("_", " ")}</p>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Description</h3>
            <p className="text-sm text-slate-400 whitespace-pre-line leading-relaxed">
              {workout.description}
            </p>
          </div>

          {/* Exercises */}
          {isStrength && workout.exercises && workout.exercises.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">Exercises</h3>
              <div className="space-y-2">
                {workout.exercises.map((ex, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 bg-[#0c0f14] rounded-xl px-4 py-3"
                  >
                    <span className="text-slate-500 text-sm w-5">{i + 1}.</span>
                    <div className="flex-1">
                      <p className="text-sm text-white font-medium">{ex.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {ex.sets} sets × {ex.reps}
                        {ex.load ? ` · ${ex.load}` : ""}
                      </p>
                      {ex.notes && (
                        <p className="text-xs text-slate-500 mt-1">{ex.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
