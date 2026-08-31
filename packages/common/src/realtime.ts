import { ProjectState, Task, ViewState } from "./types";

// Path the realtime WebSocket server is mounted at.
export const REALTIME_PATH = "/ws";

// Bumped when a frame's shape changes incompatibly. Clients that see a
// different version from the server tell the user to reload rather than
// silently misinterpreting frames.
export const REALTIME_PROTOCOL_VERSION = 2;

/**
 * Every mutation both the REST API and the socket can execute. The name
 * doubles as the REST path (`POST /api/<name>`), so the two transports can
 * never drift apart.
 */
export type CommandName =
    | "goal"
    | "tasks/add"
    | "tasks/update"
    | "tasks/set-completion"
    | "tasks/remove"
    | "tasks/create-subplan"
    | "tasks/paste"
    | "dependencies/add"
    | "dependencies/remove"
    | "dependencies/update"
    | "inbox/add"
    | "inbox/update"
    | "inbox/remove"
    | "inbox/promote"
    | "inbox/promote-all"
    | "undo"
    | "projects/new"
    | "projects/save"
    | "projects/open"
    | "projects/reload"
    | "projects/delete"
    | "assistant/target";

export const COMMAND_NAMES: CommandName[] = [
    "goal",
    "tasks/add",
    "tasks/update",
    "tasks/set-completion",
    "tasks/remove",
    "tasks/create-subplan",
    "tasks/paste",
    "dependencies/add",
    "dependencies/remove",
    "dependencies/update",
    "inbox/add",
    "inbox/update",
    "inbox/remove",
    "inbox/promote",
    "inbox/promote-all",
    "undo",
    "projects/new",
    "projects/save",
    "projects/open",
    "projects/reload",
    "projects/delete",
    "assistant/target",
];

/**
 * Which project a command acts on. Every project-scoped command carries one:
 * the server holds several projects open at once, and a session may be looking
 * at any number of them.
 */
export type ProjectScoped = { projectKey?: string };

/** What each command puts in REST's `{ response }` and the socket's `result`. */
export type CommandResultMap = {
    goal: ProjectState;
    "tasks/add": { task: Task; state: ProjectState };
    "tasks/update": ProjectState;
    "tasks/set-completion": ProjectState;
    "tasks/remove": ProjectState;
    "tasks/create-subplan": ProjectState;
    "tasks/paste": ProjectState;
    "dependencies/add": ProjectState;
    "dependencies/remove": ProjectState;
    "dependencies/update": ProjectState;
    "inbox/add": ProjectState;
    "inbox/update": ProjectState;
    "inbox/remove": ProjectState;
    "inbox/promote": ProjectState;
    "inbox/promote-all": ProjectState;
    undo: ProjectState;
    /** The project that was opened, ready for the caller to add to its view. */
    "projects/new": ProjectState;
    /** `state` carries the key the project answers to after being written. */
    "projects/save": { projects: string[]; state: ProjectState };
    "projects/open": ProjectState;
    "projects/reload": ProjectState;
    /** `state` is present when the deleted file's project is held open. */
    "projects/delete": { projects: string[]; state?: ProjectState };
    "assistant/target": { assistantProject: string | null };
};

/**
 * Who made a change. There are no accounts and no names: the id identifies a
 * browser so that changes can be told apart from each other, and `kind`
 * separates a person from the LLM. Nobody is ever asked for it, and it is never
 * shown - it exists so undo cannot revert work that is not yours.
 */
export type Author = {
    id: string;
    kind: "person" | "assistant";
};

/** The identity every MCP-driven change is attributed to. */
export const MCP_AUTHOR: Author = {
    id: "mcp",
    kind: "assistant",
};

export type CommandErrorCode =
    /** The referenced task, project or idea does not exist. */
    | "not-found"
    /** The payload was malformed or the operation is not allowed. */
    | "invalid"
    /** A precondition (baseVersion / expectedText) did not hold. */
    | "conflict"
    /** Someone else changed the project after the caller's last change. */
    | "undo-blocked"
    | "unknown-command"
    | "internal";

export type CommandError = {
    code: CommandErrorCode;
    message: string;
};

export type ClientMessage =
    /**
     * Identifies the browser on this socket and says which projects it is
     * looking at. Sent immediately after the socket opens; the server answers
     * with a snapshot of that view.
     */
    | { type: "hello"; author: Author; view: string[] }
    /** Changes which projects this session is looking at. Answered with a snapshot. */
    | { type: "subscribe"; view: string[] }
    /** Run a mutation. `id` correlates the reply. */
    | { type: "command"; id: string; name: CommandName; payload: unknown }
    /** Ask for a fresh snapshot (tab became visible again, came back online). */
    | { type: "resync" }
    | { type: "pong" };

export type ServerMessage =
    /**
     * The whole view, sent in answer to `hello`, `subscribe` and `resync`.
     * Applied unconditionally by the client - unlike `state`, it is not subject
     * to the version guard, so a server restart (which resets the version
     * counters) still resyncs.
     */
    | { type: "snapshot"; protocolVersion: number; serverId: string; view: ViewState }
    /**
     * One project in this session's view changed, from any writer: this client,
     * another client, or MCP.
     */
    | { type: "state"; state: ProjectState; author?: Author }
    /**
     * A project this session is looking at answers to a new key, because it was
     * written to disk under a different filename. `author` is whoever caused it,
     * so a client can tell its own save apart.
     */
    | { type: "notice"; kind: "project-renamed"; from: string; to: string; author?: Author }
    /** Which project MCP acts on, which is the same for everybody. */
    | { type: "notice"; kind: "assistant-target"; project: string | null; author?: Author }
    | { type: "result"; id: string; result: unknown }
    /** `state` is authoritative at the point of failure, so conflicts self-heal. */
    | { type: "error"; id: string; error: CommandError; state?: ProjectState }
    | { type: "ping" };
