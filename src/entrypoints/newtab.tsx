import React from "react";
import { createRoot } from "react-dom/client";

/* Components */
import NewTabGate from "@/pages/NewTabGate";

const container = document.getElementById("root");
if (!container) {
  throw new Error('[newtab.tsx] Root element with id "root" not found');
}
const root = createRoot(container); // container is HTMLElement here after the check

root.render(
  <React.StrictMode>
    <NewTabGate/>
  </React.StrictMode>
);
