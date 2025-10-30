// src/scripts/CacheKeys.ts
export const WS_PREFIX = (wsid: string) => `WS_${String(wsid)}`;

export const fpGroupsIndexKey = (wsid: string) =>
  `${WS_PREFIX(wsid)}::groups_index_v1`;   // tiny list [{id, groupName}]

export const fpGroupsBlobKey = (wsid: string) =>
  `${WS_PREFIX(wsid)}::groups_blob_v1`;    // full groups snapshot for first paint
