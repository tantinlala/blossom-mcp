import http from "http";
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { createApiRouter } from "./routes/api";
import { createMcpRouter } from "./mcp/mcpTransport";
import { createRealtimeServer } from "./realtime/realtimeServer";
import { Workspace } from "./state/workspace";
import { Project } from "./models/project";
import { FileIO } from "./utils/fileIO";

import "dotenv/config";

const project = new Project(new FileIO());
const workspace = new Workspace(project);

// Identifies this process to clients. The version counters restart with the
// process, so a client that sees a new serverId knows to trust the snapshot
// rather than compare versions against what it was holding.
const serverId = uuidv4();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
createRealtimeServer(server, { workspace, project, serverId });

app.use("/api", createApiRouter(workspace, project));
app.use("/mcp", createMcpRouter(workspace));

const port = process.env.PORT || 3030;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
