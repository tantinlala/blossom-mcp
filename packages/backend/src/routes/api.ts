import { Router, Request, Response } from "express";
import { Project } from "../models/project";
import { ProjectStore, TaskNotFoundError, InvalidDependencyError, InvalidIndexError } from "../state/projectStore";

const Status = {
    OK: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL: 500,
};

const errorStatus = (error: unknown): number => {
    if (error instanceof TaskNotFoundError) {
        return Status.NOT_FOUND;
    }
    if (error instanceof InvalidDependencyError || error instanceof InvalidIndexError) {
        return Status.BAD_REQUEST;
    }
    return Status.INTERNAL;
};

const createApiRouter = (store: ProjectStore, project: Project): Router => {
    const router = Router();

    // Wraps a mutation handler: runs it, then responds with the full new
    // project state so clients never drift from the server.
    const withState = (mutate: (req: Request) => void | Promise<void>) => {
        return async (req: Request, res: Response) => {
            try {
                await mutate(req);
                res.json({ response: store.getState() });
            } catch (error) {
                res.status(errorStatus(error)).json({ error: String(error) });
            }
        };
    };

    router.get("/state", (req: Request, res: Response) => {
        res.json({ response: store.getState() });
    });

    router.get("/state/version", (req: Request, res: Response) => {
        res.json({ response: { version: store.getVersion() } });
    });

    router.post(
        "/goal",
        withState((req) => {
            const { name, description } = req.body;
            if (typeof name !== "string") {
                throw new InvalidDependencyError("Goal name is required");
            }
            store.setGoal(name, description);
        }),
    );

    router.post("/tasks/add", async (req: Request, res: Response) => {
        try {
            const { parentId, name, description } = req.body;
            if (typeof name !== "string" || name === "") {
                res.status(Status.BAD_REQUEST).json({ error: "Task name is required" });
                return;
            }
            const task = store.addTask(parentId, name, description);
            res.json({ response: { task, state: store.getState() } });
        } catch (error) {
            res.status(errorStatus(error)).json({ error: String(error) });
        }
    });

    router.post(
        "/tasks/update",
        withState((req) => {
            const { taskId, name, description } = req.body;
            store.updateTask(taskId, { name, description });
        }),
    );

    router.post(
        "/tasks/set-completion",
        withState((req) => {
            const { taskId, completed } = req.body;
            store.setTaskCompletion(taskId, Boolean(completed));
        }),
    );

    router.post(
        "/tasks/remove",
        withState((req) => {
            store.removeTask(req.body.taskId);
        }),
    );

    router.post(
        "/tasks/create-subplan",
        withState((req) => {
            store.createSubplan(req.body.taskId);
        }),
    );

    router.post(
        "/tasks/paste",
        withState((req) => {
            const { parentId, tasks, dependencies } = req.body;
            store.pasteTasks(parentId, tasks ?? [], dependencies ?? []);
        }),
    );

    router.post(
        "/dependencies/add",
        withState((req) => {
            store.addDependency(req.body.sourceId, req.body.targetId);
        }),
    );

    router.post(
        "/dependencies/remove",
        withState((req) => {
            store.removeDependency(req.body.sourceId, req.body.targetId);
        }),
    );

    router.post(
        "/dependencies/update",
        withState((req) => {
            const { oldSource, oldTarget, newSource, newTarget } = req.body;
            store.updateDependency(oldSource, oldTarget, newSource, newTarget);
        }),
    );

    router.post(
        "/inbox/add",
        withState((req) => {
            store.addIdea(typeof req.body.text === "string" ? req.body.text : "");
        }),
    );

    router.post(
        "/inbox/update",
        withState((req) => {
            store.updateIdea(req.body.index, req.body.text ?? "");
        }),
    );

    router.post(
        "/inbox/remove",
        withState((req) => {
            store.removeIdea(req.body.index);
        }),
    );

    router.post(
        "/inbox/promote",
        withState((req) => {
            store.promoteIdea(req.body.index, req.body.parentId);
        }),
    );

    router.post(
        "/undo",
        withState(() => {
            store.undo();
        }),
    );

    router.get("/projects", async (req: Request, res: Response) => {
        try {
            const projects = await project.listExistingProjects();
            res.json({ response: { projects } });
        } catch (error) {
            res.status(Status.INTERNAL).json({ error: String(error) });
        }
    });

    router.post(
        "/projects/new",
        withState(() => {
            store.reset();
        }),
    );

    router.post("/projects/save", async (req: Request, res: Response) => {
        try {
            const { filename } = req.body;
            if (typeof filename !== "string" || filename === "") {
                res.status(Status.BAD_REQUEST).json({ error: "Filename is required" });
                return;
            }
            const state = store.getState();
            await project.saveProject(filename, state.goal, state.inbox);
            store.setActiveProject(filename);
            const projects = await project.listExistingProjects();
            res.json({ response: { projects } });
        } catch (error) {
            res.status(Status.INTERNAL).json({ error: String(error) });
        }
    });

    router.post(
        "/projects/restore",
        withState(async (req) => {
            const { filename } = req.body;
            const { goal, inbox } = await project.restoreProject(filename);
            store.load(goal, inbox, filename);
        }),
    );

    router.get("/projects/active", (req: Request, res: Response) => {
        res.json({ response: { activeProject: store.activeProject } });
    });

    return router;
};

export { createApiRouter };
