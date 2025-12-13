import { PurposeId } from "@shared/constants/purposeId";

/**
 * Supported purpose identifiers that instruct the grouping LLM about user intent.
 *
 * - `work`    → professional/workspace contexts
 * - `school`  → academic study or coursework
 * - `personal`→ general life organization
 */
export type PurposeIdType = 
  (typeof PurposeId)[keyof typeof PurposeId];