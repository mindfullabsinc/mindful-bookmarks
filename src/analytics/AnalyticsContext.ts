// src/analytics/AnalyticsContext.ts
import React, { createContext, useContext } from "react";

type CaptureProps = Record<string, any>;
export type AnalyticsCtx = {
  capture: (event: string, props?: CaptureProps) => void;
  optOut: boolean;
  setOptOut: (v: boolean) => void;
  userId: string | null;
};

export const AnalyticsContext = createContext<AnalyticsCtx | null>(null);

export function useAnalytics() {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) throw new Error("useAnalytics must be used within <AnalyticsProvider/>");
  return ctx;
}
