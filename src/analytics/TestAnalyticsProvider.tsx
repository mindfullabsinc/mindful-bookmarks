import React from "react";
import { AnalyticsContext, type AnalyticsType } from "@/analytics/AnalyticsContext"; 

const stub: AnalyticsType = {
  capture: () => {},
  identify: () => {},
  optOut: false,
  setOptOut: () => {},
  userId: "test",
};

export function TestAnalyticsProvider({ children }: { children: React.ReactNode }) {
  return <AnalyticsContext.Provider value={stub}>{children}</AnalyticsContext.Provider>;
}
