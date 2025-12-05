import { PurposeId } from "./purposeId";

export type RawSource = "bookmarks" | "tabs" | "history";

export type RawItem = {
  id: string;
  name: string;
  url: string;
  source: RawSource;
  lastVisitedAt?: number;
};

export type CategorizedGroup = {
  id: string;
  name: string;
  purpose: PurposeId;
  description?: string;
  items: RawItem[];
};
export type GroupingInput = {
  items: RawItem[];
  purposes: PurposeId[]; 
};

export type GroupingLLMResponse = {
  groups: CategorizedGroup[];
};

// Interface the hook will call
export interface GroupingLLM {
  group(input: GroupingInput): Promise<GroupingLLMResponse>;
}
