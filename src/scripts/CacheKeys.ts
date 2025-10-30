// src/scripts/CacheKeys.ts
const V_FP_INDEX = 'v1';
const V_FP_BLOB  = 'v1';
export const normalizeWsId = (wsid: string) => String(wsid ?? '').trim();
export const WS_PREFIX = (wsid: string) => `WS_${normalizeWsId(wsid)}`;

export const fpGroupsIndexKey = (wsid: string) =>
  `${WS_PREFIX(wsid)}::groups_index_${V_FP_INDEX}`;   // tiny list [{id, groupName}]

export const fpGroupsBlobKey = (wsid: string) => 
  `${WS_PREFIX(wsid)}::groups_blob_${V_FP_BLOB}`;     // full groups snapshot for first paint