import { ProjectState, Task } from "./types";

// Path the realtime WebSocket server is mounted at.
export const REALTIME_PATH = "/ws";

// Bumped when a frame's shape changes incompatibly. Clients that see a
// different version from the server tell the user to reload rather than
// silently misinterpreting frames.
export const REALTIME_PROTOCOL_VERSION = 1;

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
    | "projects/restore"
    | "projects/delete";

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
    "projects/restore",
    "projects/delete",
];

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
    "projects/new": ProjectState;
    "projects/save": { projects: string[] };
    "projects/restore": ProjectState;
    /** `state` carries the active project, which the deleted file may have been. */
    "projects/delete": { projects: string[]; state: ProjectState };
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
    /** The referenced task or project does not exist. */
    | "not-found"
    /** The payload was malformed or the operation is not allowed. */
    | "invalid"
    /** A precondition (baseVersion / expectedText) did not hold. */
    | "conflict"
    /** Others are connected; resend with `confirmed: true` to go ahead. */
    | "confirm-required"
    /** Someone else changed the project after the caller's last change. */
    | "undo-blocked"
    | "unknown-command"
    | "internal";

export type CommandError = {
    code: CommandErrorCode;
    message: string;
    /** Set on `confirm-required`: how many other browsers are connected. */
    otherCount?: number;
};

export type ClientMessage =
    /** Identifies the browser on this socket. Sent immediately after it opens. */
    | { type: "hello"; author: Author }
    /** Run a mutation. `id` correlates the reply. */
    | { type: "command"; id: string; name: CommandName; payload: unknown }
    /** Ask for a fresh snapshot (tab became visible again, came back online). */
    | { type: "resync" }
    | { type: "pong" };

export type ServerMessage =
    /**
     * Sent on connect and in reply to `resync`. Applied unconditionally by the
     * client - unlike `state`, it is not subject to the version guard, so a
     * server restart (which resets the version counter) still resyncs.
     */
    | { type: "snapshot"; protocolVersion: number; serverId: string; state: ProjectState }
    /** A change happened, from any writer: this client, another client, or MCP. */
    | { type: "state"; state: ProjectState; author?: Author }
    /** `author` is whoever caused it, so a client can tell its own switch apart. */
    | { type: "notice"; kind: "project-switched"; project: string | null; author?: Author }
    | { type: "result"; id: string; result: unknown }
    /** `state` is authoritative at the point of failure, so conflicts self-heal. */
    | { type: "error"; id: string; error: CommandError; state: ProjectState }
    | { type: "ping" };
