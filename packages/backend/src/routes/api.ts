import { Router, Request, Response } from "express";
import { Author, COMMAND_NAMES, ViewState } from "@blossom/common";
import { Project } from "../models/project";
import { Workspace } from "../state/workspace";
import { CommandDeps, dispatchCommand, projectFor } from "../state/commands";
import { errorCode, errorStatus, Status } from "../state/errorCodes";

// Identity is advisory: it distinguishes the author of a change so undo can
// refuse to revert somebody else's work. Anyone may send any id, so treat it as
// a hint; a missing or malformed header means an unattributed write.
const readAuthor = (req: Request): Author | null => {
    const header = req.get("X-Blossom-Author");
    if (!header) {
        return null;
    }
    try {
        const parsed = JSON.parse(header);
        if (typeof parsed?.id === "string") {
            return { id: parsed.id, kind: parsed.kind === "assistant" ? "assistant" : "person" };
        }
    } catch {
        // Fall through to anonymous.
    }
    return null;
};

/**
 * Which projects a read is asking about, from `?projects=a,b`. The order given
 * is the order they come back in, which is the order the board draws its lanes.
 */
const readProjectKeys = (req: Request): string[] => {
    const raw = req.query.projects;
    const joined = Array.isArray(raw) ? raw.join(",") : typeof raw === "string" ? raw : "";
    return joined
        .split(",")
        .map((key) => key.trim())
        .filter((key) => key !== "");
};

const createApiRouter = (workspace: Workspace, project: Project): Router => {
    const router = Router();
    const commandDeps: CommandDeps = { workspace, project };

    // Every mutation is a command, and every command is reachable at
    // POST /api/<command name>, so the REST surface and the socket's command
    // surface are the same list by construction.
    for (const name of COMMAND_NAMES) {
        router.post(`/${name}`, async (req: Request, res: Response) => {
            try {
                const response = await dispatchCommand(commandDeps, name, req.body, readAuthor(req));
                res.json({ response });
            } catch (error) {
                const status = errorStatus(error);
                const body: Record<string, unknown> = {
                    error: error instanceof Error ? error.message : String(error),
                    code: errorCode(error),
                };
                // A rejected write leaves the client holding stale state, so
                // hand back the authoritative copy of the project it named.
                if (status === Status.CONFLICT) {
                    try {
                        body.response = projectFor(commandDeps, name, req.body).getState();
                    } catch {
                        // A conflict on a project that cannot be resolved leaves
                        // the client to ask for the view it is looking at.
                    }
                }
                res.status(status).json(body);
            }
        });
    }

    /** The projects a session is looking at, plus which one MCP acts on. */
    router.get("/view", async (req: Request, res: Response) => {
        try {
            const opened = await workspace.openMany(readProjectKeys(req));
            const view: ViewState = workspace.viewState(opened);
            res.json({ response: view });
        } catch (error) {
            res.status(Status.INTERNAL).json({ error: String(error) });
        }
    });

    /** The version of each named project, read by the poll that runs while the socket is down. */
    router.get("/view/versions", (req: Request, res: Response) => {
        const versions: Record<string, number> = {};
        for (const key of readProjectKeys(req)) {
            const store = workspace.get(key);
            if (store) {
                versions[key] = store.getVersion();
            }
        }
        res.json({ response: { versions } });
    });

    /** Every saved project, which ones are open, and which one MCP acts on. */
    router.get("/projects", async (req: Request, res: Response) => {
        try {
            const projects = await project.listExistingProjects();
            res.json({
                response: { projects, open: workspace.keys(), assistantProject: workspace.assistantProject },
            });
        } catch (error) {
            res.status(Status.INTERNAL).json({ error: String(error) });
        }
    });

    return router;
};

export { createApiRouter, readProjectKeys };
