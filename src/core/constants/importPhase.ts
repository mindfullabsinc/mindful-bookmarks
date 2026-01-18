import { ImportPhase } from "@/core/types/importPhase";

export type PhaseMessageMap = Partial<Record<ImportPhase, string>>;

export const PHASE_MESSAGES: PhaseMessageMap = {
  initializing: "Starting import ...",
  collecting: "Collecting bookmarks, tabs, and history ...",
  filtering: "Cleaning up duplicates and clutter ...",
  categorizing: "Organizing everything neatly ...",
  persisting: "Saving your new workspace ...",
  finalizing: "Finishing up ...",
  importing: "Importing your selections ...", 
  done: "Your workspace is ready.",
};