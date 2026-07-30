import React from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App";
import { APIClient } from "./utils/APIClient";
import { PlanManager } from "./utils/PlanManager";

import "./index.css";

// Instantiate everything
const apiClient: APIClient = new APIClient();
const planManager: PlanManager = new PlanManager();

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
    <React.StrictMode>
        <App apiClient={apiClient} planManager={planManager} />
    </React.StrictMode>,
);
