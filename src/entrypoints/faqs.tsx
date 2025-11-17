import React from "react";
import { createRoot } from "react-dom/client";

/* Configure Amplify */
import { Amplify } from "aws-amplify";
import config from "../../amplify_outputs.json";
Amplify.configure(config);

/* Components */
import FAQsPage from "@/pages/marketingWebsite/FAQsPage";

/* CSS styles */
import "@/styles/Index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error('[faqs.tsx] Root element with id "root" not found');
}
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <FAQsPage />
  </React.StrictMode>
);
