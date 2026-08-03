import { Author, CommandName, CommandResultMap, ProjectState, Task } from "@blossom/common";
import { ProjectStore } from "./projectStore";
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

/**
 * The command would swap the project out from under everyone else who is
 * connected. Resending with `confirmed: true` goes ahead anyway.
 */
class ConfirmRequiredError extends Error {
    public readonly otherCount: number;

    constructor(otherCount: number) {
        super(
            otherCount === 1
                ? "Somebody else is working on this project"
                : `${otherCount} other people are working on this project`,
        );
        this.name = "ConfirmRequiredError";
        this.otherCount = otherCount;
    }
}

interface CommandDeps {
    store: ProjectStore;
    project: Project;
    /**
     * How many browsers other than the caller's are connected. Supplied by the
     * realtime layer; absent when there is nothing tracking connections (the
     * REST router on its own), in which case nothing needs confirming.
     */
    otherPeerCount?: (author: Author | null) => number;
}

interface CommandContext extends CommandDeps {
    author: Author | null;
    /** Runs a synchronous store mutation attributed to the caller. */
    run<T>(fn: () => T): T;
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

// Guards the two commands that replace the project everyone is looking at.
const assertSwitchConfirmed = (ctx: CommandContext, payload: any) => {
    if (payload?.confirmed === true) {
        return;
    }
    const others = ctx.otherPeerCount?.(ctx.author) ?? 0;
    if (others > 0) {
        throw new ConfirmRequiredError(others);
    }
};

/**
 * Every mutation the app supports, in one table. The REST router and the
 * WebSocket server both dispatch through here, so the two transports cannot
 * drift apart. Each handler returns exactly the value that goes into REST's
 * `{ response }` envelope and the socket's `result` frame.
 *
 * MCP is deliberately not routed through this table: its tools have their own
 * names, schemas and return shapes, and a deliberately smaller surface. It
 * shares the seam that matters - the store - so MCP writes still broadcast.
 */
const COMMANDS: CommandTable = {
    goal: (ctx, payload): ProjectState => {
        const name = payload?.name;
        if (typeof name !== "string") {
            throw new InvalidCommandError("Goal name is required");
        }
        return ctx.run(() => {
            ctx.store.setGoal(name, payload?.description, payload?.baseVersion);
            return ctx.store.getState();
        });
    },

    "tasks/add": (ctx, payload): { task: Task; state: ProjectState } => {
        const name = requireString(payload?.name, "Task name");
        return ctx.run(() => {
            const task = ctx.store.addTask(payload?.parentId, name, payload?.description);
            return { task, state: ctx.store.getState() };
        });
    },

    "tasks/update": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.updateTask(payload?.taskId, {
                name: payload?.name,
                description: payload?.description,
                baseVersion: payload?.baseVersion,
            });
            return ctx.store.getState();
        }),

    "tasks/set-completion": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.setTaskCompletion(payload?.taskId, Boolean(payload?.completed));
            return ctx.store.getState();
        }),

    "tasks/remove": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.removeTask(payload?.taskId);
            return ctx.store.getState();
        }),

    "tasks/create-subplan": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.createSubplan(payload?.taskId);
            return ctx.store.getState();
        }),

    "tasks/paste": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.pasteTasks(payload?.parentId, payload?.tasks ?? [], payload?.dependencies ?? []);
            return ctx.store.getState();
        }),

    "dependencies/add": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.addDependency(payload?.sourceId, payload?.targetId);
            return ctx.store.getState();
        }),

    "dependencies/remove": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.removeDependency(payload?.sourceId, payload?.targetId);
            return ctx.store.getState();
        }),

    "dependencies/update": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.updateDependency(payload?.oldSource, payload?.oldTarget, payload?.newSource, payload?.newTarget);
            return ctx.store.getState();
        }),

    "inbox/add": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.addIdea(typeof payload?.text === "string" ? payload.text : "");
            return ctx.store.getState();
        }),

    "inbox/update": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.updateIdea(ideaRef(payload), payload?.text ?? "", payload?.expectedText);
            return ctx.store.getState();
        }),

    "inbox/remove": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.removeIdea(ideaRef(payload), payload?.expectedText);
            return ctx.store.getState();
        }),

    "inbox/promote": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.promoteIdea(ideaRef(payload), payload?.parentId, payload?.expectedText);
            return ctx.store.getState();
        }),

    "inbox/promote-all": (ctx, payload): ProjectState =>
        ctx.run(() => {
            ctx.store.promoteAllIdeas(payload?.parentId);
            return ctx.store.getState();
        }),

    undo: (ctx): ProjectState =>
        ctx.run(() => {
            ctx.store.undo();
            return ctx.store.getState();
        }),

    "projects/new": (ctx, payload): ProjectState => {
        assertSwitchConfirmed(ctx, payload);
        return ctx.run(() => {
            ctx.store.reset();
            return ctx.store.getState();
        });
    },

    "projects/save": async (ctx, payload): Promise<{ projects: string[] }> => {
        const filename = requireString(payload?.filename, "Filename");
        const state = ctx.store.getState();
        await ctx.project.saveProject(filename, state.goal, state.inbox);
        ctx.run(() => ctx.store.setActiveProject(filename));
        return { projects: await ctx.project.listExistingProjects() };
    },

    "projects/delete": async (ctx, payload): Promise<{ projects: string[]; state: ProjectState }> => {
        const filename = requireString(payload?.filename, "Filename");
        await ctx.project.deleteProject(filename);

        // The work stays on screen; it simply has no file behind it any more,
        // which is what a null active project means everywhere else.
        if (ctx.store.activeProject === filename) {
            ctx.run(() => ctx.store.setActiveProject(null));
        }
        return { projects: await ctx.project.listExistingProjects(), state: ctx.store.getState() };
    },

    "projects/restore": async (ctx, payload): Promise<ProjectState> => {
        assertSwitchConfirmed(ctx, payload);
        const filename = payload?.filename;
        const { goal, inbox } = await ctx.project.restoreProject(filename);
        return ctx.run(() => {
            ctx.store.load(goal, inbox, filename);
            return ctx.store.getState();
        });
    },
};

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
        run: <T>(fn: () => T): T => (author ? deps.store.runAs(author, fn) : fn()),
    };

    return await COMMANDS[name](ctx, payload);
};

export {
    COMMANDS,
    dispatchCommand,
    isCommandName,
    InvalidCommandError,
    UnknownCommandError,
    ConfirmRequiredError,
    CommandDeps,
    CommandContext,
};
