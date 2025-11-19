import React from "react";
import { createRoot } from "react-dom/client";

/* Configure Amplify */
import { Amplify } from "aws-amplify";
import config from "../../amplify_outputs.json";
Amplify.configure(config);

/* Components */
import PricingPage from "@/pages/marketingWebsite/PricingPage";

/* CSS styles */
import "@/styles/Index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error('[pricing.tsx] Root element with id "root" not found');
}
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <PricingPage />
  </React.StrictMode>
);
