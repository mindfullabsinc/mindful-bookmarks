import { PurposeId } from "@shared/types/purposeId";
import { CategorizedGroup } from "@shared/types/llmGrouping";

export type WorkspaceRef = {
  id: string;
  purpose: PurposeId;
};

export interface WorkspaceService {
  createWorkspaceForPurpose(purpose: PurposeId): Promise<WorkspaceRef>;
  saveGroupsToWorkspace(workspaceId: string, groups: CategorizedGroup[]): Promise<void>;
  appendGroupsToWorkspace(workspaceId: string, groups: CategorizedGroup[]):Promise<void>;
}