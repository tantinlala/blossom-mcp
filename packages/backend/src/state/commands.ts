import { Author, CommandName, CommandResultMap, GOAL_ID, ProjectState, Task } from "@blossom/common";
import { ProjectStore } from "./projectStore";
import { AmbiguousProjectError, Workspace } from "./workspace";
import { Project } from "../models/project";

/** A command's payload was missing something it needs, or held the wrong type. */
class InvalidCommandError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidCommandError";
    }
}

/** No handler is registered under the requested name. */
class UnknownCommandError extends Error {
    constructor(name: string) {
        super(`Unknown command: ${name}`);
        this.name = "UnknownCommandError";
    }
}

interface CommandDeps {
    workspace: Workspace;
    project: Project;
}

interface CommandContext extends CommandDeps {
    author: Author | null;
    /** Runs a synchronous mutation on one project, attributed to the caller. */
    run<T>(store: ProjectStore, fn: () => T): T;
}

type CommandHandler<K extends CommandName> = (
    ctx: CommandContext,
    payload: any,
) => CommandResultMap[K] | Promise<CommandResultMap[K]>;

type CommandTable = { [K in CommandName]: CommandHandler<K> };

const requireString = (value: unknown, field: string): string => {
    if (typeof value !== "string" || value === "") {
        throw new InvalidCommandError(`${field} is required`);
    }
    return value;
};

// Every field a payload can name a task by. The goal sentinel is left out
// deliberately: every project has a task under that id, so it settles nothing.
const TASK_ID_FIELDS = ["taskId", "parentId", "sourceId", "targetId", "oldSource", "oldTarget", "newSource"];

/**
 * Which project a command acts on.
 *
 * `projectKey` says it outright, and is what the web UI sends: the person
 * clicking knows which board lane they clicked in. Failing that the ids in the
 * payload settle it, since a task or idea id belongs to exactly one project; and
 * a workspace holding one project needs nothing to settle. Anything else is
 * reported as the ambiguity it is, naming the command that arrived without a
 * project.
 */
const resolveProject = (ctx: CommandContext, name: CommandName, payload: any): ProjectStore => {
    if (typeof payload?.projectKey === "string" && payload.projectKey !== "") {
        return ctx.workspace.require(payload.projectKey);
    }

    for (const field of TASK_ID_FIELDS) {
        const value = payload?.[field];
        if (typeof value === "string" && value !== "" && value !== GOAL_ID) {
            const store = ctx.workspace.findByTaskId(value);
            if (store) {
                return store;
            }
        }
    }

    if (typeof payload?.ideaId === "string" && payload.ideaId !== "") {
        const store = ctx.workspace.findByIdeaId(payload.ideaId);
        if (store) {
            return store;
        }
    }

    const keys = ctx.workspace.keys();
    if (keys.length === 1) {
        return ctx.workspace.require(keys[0]);
    }

    throw new AmbiguousProjectError(
        `${name} did not say which project it means: pass projectKey. Open projects: ${keys.join(", ") || "none"}`,
    );
};

// Which inbox entry a payload means. Callers may name it by `ideaId`, which
// holds however the list shifts around it, or by `index` into the current
// newest-first order; `ideaId` decides when both are sent.
//
// A payload that names neither is rejected here, where the reference is read.
// Passing it on would have the store report an out-of-range position for a
// position the caller never gave, which says nothing about what was wrong.
const ideaRef = (payload: any): { ideaId?: string; index?: number } => {
    if (typeof payload?.ideaId === "string" && payload.ideaId !== "") {
        return { ideaId: payload.ideaId };
    }
    if (!Number.isInteger(payload?.index)) {
        throw new InvalidCommandError(
            "An inbox idea reference is required: pass ideaId, or index as an integer position",
        );
    }
    return { index: payload.index };
};

/**
 * Every mutation the app supports, in one table. The REST router and the
 * WebSocket server both dispatch through here, so the two transports cannot
 * drift apart. Each handler returns exactly the value that goes into REST's
 * `{ response }` envelope and the socket's `result` frame.
 *
 * MCP is deliberately not routed through this table: its tools have their own
 * names, schemas and return shapes, and a deliberately smaller surface. It
 * shares the seam that matters - the workspace - so MCP writes still broadcast.
 */
const COMMANDS: CommandTable = {
    goal: (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "goal", payload);
        const name = payload?.name;
        if (typeof name !== "string") {
            throw new InvalidCommandError("Goal name is required");
        }
        return ctx.run(store, () => {
            store.setGoal(name, payload?.description, payload?.baseVersion);
            return store.getState();
        });
    },

    "tasks/add": (ctx, payload): { task: Task; state: ProjectState } => {
        const store = resolveProject(ctx, "tasks/add", payload);
        const name = requireString(payload?.name, "Task name");
        return ctx.run(store, () => {
            const task = store.addTask(payload?.parentId, name, payload?.description);
            return { task, state: store.getState() };
        });
    },

    "tasks/update": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "tasks/update", payload);
        return ctx.run(store, () => {
            store.updateTask(payload?.taskId, {
                name: payload?.name,
                description: payload?.description,
                baseVersion: payload?.baseVersion,
            });
            return store.getState();
        });
    },

    "tasks/set-completion": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "tasks/set-completion", payload);
        return ctx.run(store, () => {
            store.setTaskCompletion(payload?.taskId, Boolean(payload?.completed));
            return store.getState();
        });
    },

    "tasks/remove": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "tasks/remove", payload);
        return ctx.run(store, () => {
            store.removeTask(payload?.taskId);
            return store.getState();
        });
    },

    "tasks/create-subplan": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "tasks/create-subplan", payload);
        return ctx.run(store, () => {
            store.createSubplan(payload?.taskId);
            return store.getState();
        });
    },

    "tasks/paste": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "tasks/paste", payload);
        return ctx.run(store, () => {
            store.pasteTasks(payload?.parentId, payload?.tasks ?? [], payload?.dependencies ?? []);
            return store.getState();
        });
    },

    "dependencies/add": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "dependencies/add", payload);
        return ctx.run(store, () => {
            store.addDependency(payload?.sourceId, payload?.targetId);
            return store.getState();
        });
    },

    "dependencies/remove": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "dependencies/remove", payload);
        return ctx.run(store, () => {
            store.removeDependency(payload?.sourceId, payload?.targetId);
            return store.getState();
        });
    },

    "dependencies/update": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "dependencies/update", payload);
        return ctx.run(store, () => {
            store.updateDependency(payload?.oldSource, payload?.oldTarget, payload?.newSource, payload?.newTarget);
            return store.getState();
        });
    },

    "inbox/add": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "inbox/add", payload);
        return ctx.run(store, () => {
            store.addIdea(typeof payload?.text === "string" ? payload.text : "");
            return store.getState();
        });
    },

    "inbox/update": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "inbox/update", payload);
        return ctx.run(store, () => {
            store.updateIdea(ideaRef(payload), payload?.text ?? "", payload?.expectedText);
            return store.getState();
        });
    },

    "inbox/remove": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "inbox/remove", payload);
        return ctx.run(store, () => {
            store.removeIdea(ideaRef(payload), payload?.expectedText);
            return store.getState();
        });
    },

    "inbox/promote": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "inbox/promote", payload);
        return ctx.run(store, () => {
            store.promoteIdea(ideaRef(payload), payload?.parentId, payload?.expectedText);
            return store.getState();
        });
    },

    "inbox/promote-all": (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "inbox/promote-all", payload);
        return ctx.run(store, () => {
            store.promoteAllIdeas(payload?.parentId);
            return store.getState();
        });
    },

    undo: (ctx, payload): ProjectState => {
        const store = resolveProject(ctx, "undo", payload);
        return ctx.run(store, () => {
            store.undo();
            return store.getState();
        });
    },

    /**
     * Opens an empty project. It joins the caller's own view, so starting one
     * changes nothing for anybody else who is connected.
     */
    "projects/new": async (ctx): Promise<ProjectState> => {
        const store = await ctx.workspace.createDraft();
        return store.getState();
    },

    "projects/save": async (ctx, payload): Promise<{ projects: string[]; state: ProjectState }> => {
        const store = resolveProject(ctx, "projects/save", payload);
        const filename = requireString(payload?.filename, "Filename");
        const saved = await ctx.workspace.save(store.key, filename, ctx.author);
        return { projects: await ctx.project.listExistingProjects(), state: saved.getState() };
    },

    /**
     * Opens a saved project, reading it from disk if nothing has it open yet.
     * The caller adds it to its own view; everybody else's view is untouched.
     */
    "projects/open": async (ctx, payload): Promise<ProjectState> => {
        const filename = requireString(payload?.filename, "Filename");
        const store = await ctx.workspace.open(filename);
        return store.getState();
    },

    /** Re-reads an open project from disk, discarding what it holds. */
    "projects/reload": async (ctx, payload): Promise<ProjectState> => {
        const store = resolveProject(ctx, "projects/reload", payload);
        const reloaded = await ctx.workspace.reload(store.key);
        return reloaded.getState();
    },

    "projects/delete": async (ctx, payload): Promise<{ projects: string[]; state?: ProjectState }> => {
        const filename = requireString(payload?.filename, "Filename");
        const store = await ctx.workspace.delete(filename);
        const projects = await ctx.project.listExistingProjects();
        return store ? { projects, state: store.getState() } : { projects };
    },

    /**
     * Chooses which open project MCP acts on. A person picks it in the web UI,
     * so an assistant and the people watching work on the same plan.
     */
    "assistant/target": (ctx, payload): { assistantProject: string | null } => {
        const key = payload?.projectKey;
        if (key !== null && typeof key !== "string") {
            throw new InvalidCommandError("projectKey is required: a project key, or null to leave it unset");
        }
        ctx.workspace.setAssistantProject(key === "" ? null : key);
        return { assistantProject: ctx.workspace.assistantProject };
    },
};

/**
 * Which project a payload names, for callers outside dispatch. A refused write
 * comes back carrying the authoritative state of the project it was aimed at,
 * and that needs resolving the same way the write itself did.
 */
const projectFor = (deps: CommandDeps, name: CommandName, payload: unknown): ProjectStore =>
    resolveProject({ ...deps, author: null, run: (_store, fn) => fn() }, name, payload);

const isCommandName = (name: string): name is CommandName => Object.prototype.hasOwnProperty.call(COMMANDS, name);

/**
 * Runs one command and returns its result payload. Throws on failure; callers
 * translate the error into whatever their transport expects (an HTTP status,
 * or an `error` frame).
 */
const dispatchCommand = async (
    deps: CommandDeps,
    name: string,
    payload: unknown,
    author: Author | null = null,
): Promise<unknown> => {
    if (!isCommandName(name)) {
        throw new UnknownCommandError(name);
    }

    const ctx: CommandContext = {
        ...deps,
        author,
        // Attribution is per project: the author lands on the store the command
        // resolved to, which is the one whose undo stack has to know about it.
        run: <T>(store: ProjectStore, fn: () => T): T => (author ? store.runAs(author, fn) : fn()),
    };

    return await COMMANDS[name](ctx, payload);
};

export {
    COMMANDS,
    dispatchCommand,
    isCommandName,
    projectFor,
    InvalidCommandError,
    UnknownCommandError,
    CommandDeps,
    CommandContext,
};
