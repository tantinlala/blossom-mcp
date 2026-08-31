import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import App from "./components/App";
import { APIClient } from "./utils/APIClient";
import { WorkspaceManager } from "./utils/WorkspaceManager";
import { RealtimeClient } from "./utils/RealtimeClient";
import theme from "./theme/theme";

import "./index.css";

// Instantiate everything
const realtime: RealtimeClient = new RealtimeClient();
const apiClient: APIClient = new APIClient(realtime);
const workspace: WorkspaceManager = new WorkspaceManager();

realtime.start();

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
    <React.StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <App apiClient={apiClient} workspace={workspace} realtime={realtime} />
        </ThemeProvider>
    </React.StrictMode>,
);
