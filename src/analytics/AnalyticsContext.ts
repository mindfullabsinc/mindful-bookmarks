// src/analytics/AnalyticsContext.ts
import React, { createContext, useContext } from "react";

type CaptureProps = Record<string, any>;
export type AnalyticsCtxType = {
  capture: (event: string, props?: CaptureProps) => void;
  optOut: boolean;
  setOptOut: (v: boolean) => void;
  userId: string | null;
};

export type AnalyticsType = {
  capture: (event: string, props?: Record<string, unknown>) => void;
  identify: (id: string, traits?: Record<string, unknown>) => void;
  optOut: boolean;
  setOptOut: (v: boolean) => void;
  userId?: string;
};

const fallback: AnalyticsType = {
  capture: () => {},
  identify: () => {},
  optOut: false,
  setOptOut: () => {},
  userId: undefined,
};

export const AnalyticsContext = React.createContext<AnalyticsType | null>(null);

export function useAnalytics(): AnalyticsType {
  const ctx = React.useContext(AnalyticsContext);
  return ctx ?? fallback; // <— never throws in tests
}