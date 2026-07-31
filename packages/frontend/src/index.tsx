import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import App from "./components/App";
import { APIClient } from "./utils/APIClient";
import { PlanManager } from "./utils/PlanManager";
import theme from "./theme/theme";

import "./index.css";

// Instantiate everything
const apiClient: APIClient = new APIClient();
const planManager: PlanManager = new PlanManager();

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
    <React.StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <App apiClient={apiClient} planManager={planManager} />
        </ThemeProvider>
    </React.StrictMode>,
);
