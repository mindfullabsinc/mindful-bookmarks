import { PurposeIdType } from "@shared/types/purposeId";
import { CategorizedGroup } from "@shared/types/llmGrouping";

export type WorkspaceRef = {
  id: string;
  purpose: PurposeIdType;
};

export interface WorkspaceService {
  createWorkspaceForPurpose(purpose: PurposeIdType): Promise<WorkspaceRef>;
  saveGroupsToWorkspace(workspaceId: string, groups: CategorizedGroup[]): Promise<void>;
  appendGroupsToWorkspace(workspaceId: string, groups: CategorizedGroup[]):Promise<void>;
}