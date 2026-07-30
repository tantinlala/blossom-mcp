import { Router, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ProjectStore } from "../state/projectStore";
import { createMcpServer } from "./mcpServer";

/**
 * Mounts the MCP server over stateless Streamable HTTP. A fresh transport and
 * server instance is created per request (required in stateless mode to avoid
 * request-id collisions); all real state lives in the shared ProjectStore.
 */
const createMcpRouter = (store: ProjectStore): Router => {
    const router = Router();

    router.post("/", async (req: Request, res: Response) => {
        const server = createMcpServer(store);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

        res.on("close", () => {
            transport.close();
            server.close();
        });

        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: { code: -32603, message: "Internal server error" },
                    id: null,
                });
            }
        }
    });

    // Stateless mode: no server-initiated streams or sessions to terminate
    const methodNotAllowed = (req: Request, res: Response) => {
        res.status(405).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Method not allowed" },
            id: null,
        });
    };
    router.get("/", methodNotAllowed);
    router.delete("/", methodNotAllowed);

    return router;
};

export { createMcpRouter };
