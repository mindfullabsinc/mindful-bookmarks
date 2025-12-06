import { PurposeId } from "@shared/types/purposeId";

/**
 * Allowed origins for bookmark payloads reaching the grouping service.
 */
export type RawSource = "bookmarks" | "tabs" | "history";

/**
 * Minimal bookmark/tabs/history shape sent to the LLM for grouping.
 */
export type RawItem = {
  id: string;
  name: string;
  url: string;
  source: RawSource;
  lastVisitedAt?: number;
};

/**
 * Normalized group returned to the client/UI, containing categorized items.
 */
export type CategorizedGroup = {
  id: string;
  name: string;
  purpose: PurposeId;
  description?: string;
  items: RawItem[];
};

/**
 * Payload expected by the grouping LLM implementation.
 */
export type GroupingInput = {
  items: RawItem[];
  purposes: PurposeId[];
};

/**
 * Response format returned by the grouping LLM.
 */
export type GroupingLLMResponse = {
  groups: CategorizedGroup[];
};

/**
 * Interface consumed by hooks/services that perform bookmark grouping.
 */
export interface GroupingLLM {
  group(input: GroupingInput): Promise<GroupingLLMResponse>;
}
