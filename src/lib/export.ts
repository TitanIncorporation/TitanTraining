import { TrainingPlan } from "@/types";
import { format, parseISO } from "date-fns";

/**
 * Generate a basic iCalendar (.ics) file content from a training plan.
 * Can be imported into Garmin Connect, Google Calendar, Apple Calendar, etc.
 */
export function generateICS(plan: TrainingPlan): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Titan Training//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${plan.name}`,
  ];

  for (const w of plan.workouts) {
    const date = parseISO(w.date);
    const dtStart = format(date, "yyyyMMdd");
    // All-day events for simplicity
    const uid = `${w.id}@titan-training.app`;

    let description = w.description;
    if (w.exercises && w.exercises.length > 0) {
      description += "\\n\\nExercises:\\n" + w.exercises.map((e) => `- ${e.name}: ${e.sets}x${e.reps}`).join("\\n");
    }
    if (w.plannedDurationMin) {
      description = `Duration: ~${w.plannedDurationMin} min\\n` + description;
    }

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
    lines.push(`DTEND;VALUE=DATE:${dtStart}`);
    lines.push(`SUMMARY:${w.title}`);
    lines.push(`DESCRIPTION:${description.replace(/\n/g, "\\n")}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(plan: TrainingPlan) {
  const content = generateICS(plan);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${plan.name.replace(/\s+/g, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
