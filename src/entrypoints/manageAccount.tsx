// manageAccount.tsx
import React from "react";
import { createRoot } from "react-dom/client";

/* Configure Amplify */
import { Amplify } from "aws-amplify";
import config from "../../amplify_outputs.json";
Amplify.configure(config);

/* Amplify auth */
import { Authenticator } from "@aws-amplify/ui-react";

/* Scripts */
import { AppContextProvider } from "@/scripts/AppContextProvider";
import formFields from "@/config/formFields";

/* Components */
import ManageAccountPage from "@/pages/ManageAccountPage";

/* CSS styles */
import "@/styles/Index.css";
import "@/styles/ManageAccount.css";

const container = document.getElementById("root");
if (!container) throw new Error('Root element with id "root" not found');

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <Authenticator formFields={formFields}>
      {({ user }) => (
        <AppContextProvider user={user}>
          <ManageAccountPage />
        </AppContextProvider>
      )}
    </Authenticator>
  </React.StrictMode>
);
