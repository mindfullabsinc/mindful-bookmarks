import React from "react";
import { createRoot } from "react-dom/client";

/* Components */
import NewTabGate from "@/pages/NewTabGate";

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <NewTabGate/>
  </React.StrictMode>
);
