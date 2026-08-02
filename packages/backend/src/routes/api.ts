import { Router, Request, Response } from "express";
import { Author, CommandErrorCode, COMMAND_NAMES } from "@blossom/common";
import { Project } from "../models/project";
import {
    ProjectStore,
    TaskNotFoundError,
    InvalidDependencyError,
    InvalidIndexError,
    VersionConflictError,
    UndoBlockedError,
} from "../state/projectStore";
import {
    CommandDeps,
    ConfirmRequiredError,
    dispatchCommand,
    InvalidCommandError,
    UnknownCommandError,
} from "../state/commands";

const Status = {
    OK: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL: 500,
};

// The socket reports a precise CommandErrorCode, so HTTP carries the same one
// rather than making the client re-infer it from a status shared by several
// distinct failures.
const errorCode = (error: unknown): CommandErrorCode => {
    if (error instanceof TaskNotFoundError) {
        return "not-found";
    }
    if (error instanceof InvalidCommandError) {
        return "invalid";
    }
    if (error instanceof UnknownCommandError) {
        return "unknown-command";
    }
    if (error instanceof VersionConflictError) {
        return "conflict";
    }
    if (error instanceof UndoBlockedError) {
        return "undo-blocked";
    }
    if (error instanceof ConfirmRequiredError) {
        return "confirm-required";
    }
    if (error instanceof InvalidDependencyError || error instanceof InvalidIndexError) {
        return "invalid";
    }
    return "internal";
};

const errorStatus = (error: unknown): number => {
    if (error instanceof TaskNotFoundError) {
        return Status.NOT_FOUND;
    }
    if (
        error instanceof InvalidDependencyError ||
        error instanceof InvalidIndexError ||
        error instanceof InvalidCommandError ||
        error instanceof UnknownCommandError
    ) {
        return Status.BAD_REQUEST;
    }
    if (
        error instanceof VersionConflictError ||
        error instanceof UndoBlockedError ||
        error instanceof ConfirmRequiredError
    ) {
        return Status.CONFLICT;
    }
    return Status.INTERNAL;
};

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

const createApiRouter = (store: ProjectStore, project: Project, deps: Partial<CommandDeps> = {}): Router => {
    const router = Router();
    const commandDeps: CommandDeps = { store, project, ...deps };

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
                // hand back the authoritative copy for it to rebase onto.
                if (status === Status.CONFLICT) {
                    body.response = store.getState();
                }
                if (error instanceof ConfirmRequiredError) {
                    body.otherCount = error.otherCount;
                }
                res.status(status).json(body);
            }
        });
    }

    router.get("/state", (req: Request, res: Response) => {
        res.json({ response: store.getState() });
    });

    router.get("/state/version", (req: Request, res: Response) => {
        res.json({ response: { version: store.getVersion() } });
    });

    router.get("/projects", async (req: Request, res: Response) => {
        try {
            const projects = await project.listExistingProjects();
            res.json({ response: { projects } });
        } catch (error) {
            res.status(Status.INTERNAL).json({ error: String(error) });
        }
    });

    router.get("/projects/active", (req: Request, res: Response) => {
        res.json({ response: { activeProject: store.activeProject } });
    });

    return router;
};

export { createApiRouter };
