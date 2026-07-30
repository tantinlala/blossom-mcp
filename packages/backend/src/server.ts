import express from "express";
import cors from "cors";
import { createApiRouter } from "./routes/api";
import { createMcpRouter } from "./mcp/mcpTransport";
import { ProjectStore } from "./state/projectStore";
import { Project } from "./models/project";
import { FileIO } from "./utils/fileIO";

import "dotenv/config";

const store = new ProjectStore();
const project = new Project(new FileIO());

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", createApiRouter(store, project));
app.use("/mcp", createMcpRouter(store));

const port = process.env.PORT || 3030;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
