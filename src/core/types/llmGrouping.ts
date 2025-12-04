import { PurposeId } from "./purposeId";


export type GroupedBookmark = {
  id: string;          // the internal bookmark id
  name: string;
  url: string;
  description?: string;
};

export type GroupingInput = {
  bookmarks: GroupedBookmark[];
  purposes: PurposeId[]; 
};

export type GroupResult = {
  id: string;          // group id 
  name: string;
  description?: string;
  bookmarkIds: string[];
};

export type GroupingLLMResponse = {
  groups: GroupResult[];
};

// Interface the hook will call
export interface GroupingLLM {
  group(input: GroupingInput): Promise<GroupingLLMResponse>;
}
