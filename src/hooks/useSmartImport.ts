import { useCallback, useState } from "react";

/* Scripts */
import {
  runSmartImport,
  SmartImportProgress,
  SmartImportOptions,
} from "@/scripts/import/smartImport";

/* Types */
import type { SmartImportPhase } from "@/core/types/smartImportPhase";
import type { PurposeIdType } from "@shared/types/purposeId";

/**
 * Hook that orchestrates the smart import flow, exposing progress state and a start handler.
 *
 * @param baseOptions Static smart import options excluding purposes/onProgress.
 * @returns State and handler for running the smart import pipeline.
 */
export function useSmartImport(
  baseOptions: Omit<SmartImportOptions, "purposes" | "onProgress">
) {
  const [phase, setPhase] = useState<SmartImportPhase>("initializing");
  const [message, setMessage] = useState<string>("Starting Smart Import…");
  const [totalItems, setTotalItems] = useState<number | undefined>();
  const [processedItems, setProcessedItems] = useState<number | undefined>();

  const start = useCallback(
    async (purposes: PurposeIdType[]): Promise<string | null> => {
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

      const result = await runSmartImport({
        ...baseOptions,
        purposes,
        onProgress,
      });

      return result?.primaryWorkspaceId ?? null;
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

