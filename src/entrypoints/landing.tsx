import React from "react";
import { createRoot } from "react-dom/client";

/* Configure Amplify */
import { Amplify } from 'aws-amplify';
import config from '../../amplify_outputs.json';
Amplify.configure(config);

/* Components */
import LandingPage from "@/pages/LandingPage"

/* CSS styles */
import "@/styles/Index.css"

const container = document.getElementById("root");
if (!container) {
  throw new Error('[popup.tsx] Root element with id "root" not found');
}
const root = createRoot(container); // container is HTMLElement after the check

root.render(
  <React.StrictMode>
    <LandingPage /> 
  </React.StrictMode>
);