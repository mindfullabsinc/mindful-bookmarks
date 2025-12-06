import { useCallback, useState } from "react";

import {
  runSmartImport,
  SmartImportProgress,
  SmartImportOptions,
} from "@/scripts/import/smartImport";
import { SmartImportPhase } from "@/core/types/smartImportPhase";
import type { PurposeId } from "@shared/types/purposeId";

/**
 * You can add more fields as needed (e.g. error states)
 */
export function useSmartImport(
  baseOptions: Omit<
    SmartImportOptions,
    "purposes" | "onProgress"
  >
) {
  const [phase, setPhase] = useState<SmartImportPhase>("initializing");
  const [message, setMessage] = useState<string>("Starting Smart Import…");
  const [totalItems, setTotalItems] = useState<number | undefined>();
  const [processedItems, setProcessedItems] = useState<number | undefined>();

  const start = useCallback(
    async (purposes: PurposeId[]) => {
      setPhase("initializing");
      setMessage("Starting Smart Import…");
      setTotalItems(undefined);
      setProcessedItems(undefined);

      const onProgress = (p: SmartImportProgress) => {
        setPhase(p.phase);
        if (p.message) setMessage(p.message);
        if (typeof p.totalItems === "number") setTotalItems(p.totalItems);
        if (typeof p.processedItems === "number")
          setProcessedItems(p.processedItems);
      };

      await runSmartImport({
        ...baseOptions,
        purposes,
        onProgress,
      });
    },
    [baseOptions]
  );

  return {
    phase,
    message,
    totalItems,
    processedItems,
    start,
  };
}
