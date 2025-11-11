import React from 'react';
import { createRoot } from 'react-dom/client';

/* Components */
import PopupPage from '@/pages/PopupPage'; 

/* CSS styles */
import "@/styles/Index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error('[popup.tsx] Root element with id "root" not found');
}
const root = createRoot(container); // container is HTMLElement after the check

root.render(
  <React.StrictMode>
    <PopupPage />
  </React.StrictMode>
);