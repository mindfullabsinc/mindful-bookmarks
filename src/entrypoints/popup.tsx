// src/entrypoints/popup.tsx
import React from "react";
import { createRoot } from "react-dom/client";

/* Components */
import PopupPage from "@/pages/PopupPage";

/* CSS styles */
import "@/styles/Index.css";

/* Theme helpers */
import { loadInitialTheme, applyTheme } from "@/hooks/applyTheme";

// Pre-boot: apply theme before React renders to avoid white→dark flash
(async () => {
  const initial = await loadInitialTheme();
  applyTheme(initial);

  const container = document.getElementById("root");
  if (!container) {
    throw new Error('[popup.tsx] Root element with id "root" not found');
  }

  const root = createRoot(container);

  root.render(
    <React.StrictMode>
      <PopupPage />
    </React.StrictMode>
  );
})();
