import { SmartImportPhase } from "@/core/types/smartImportPhase";


export const PHASE_MESSAGES: Partial<Record<SmartImportPhase, string>> = {
  initializing: "Starting Smart Import ...",
  collecting: "Collecting bookmarks, tabs, and history ...",
  filtering: "Cleaning up duplicates and clutter ...",
  categorizing: "Organizing everything neatly ...",
  persisting: "Saving your new workspace ...",
  finalizing: "Finishing up ...",
  done: "Your workspace is ready.",
};