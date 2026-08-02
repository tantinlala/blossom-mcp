import { Server as HttpServer } from "http";
import { RawData, WebSocket, WebSocketServer } from "ws";
import {
    Author,
    ClientMessage,
    CommandError,
    ProjectState,
    REALTIME_PATH,
    REALTIME_PROTOCOL_VERSION,
    ServerMessage,
} from "@blossom/common";
import { ProjectStore, TaskNotFoundError, UndoBlockedError, VersionConflictError } from "../state/projectStore";
import {
    CommandDeps,
    ConfirmRequiredError,
    dispatchCommand,
    InvalidCommandError,
    UnknownCommandError,
} from "../state/commands";
import { Project } from "../models/project";

const PING_INTERVAL_MS = 25_000;
// Two missed pings. Kept well above the interval so a slow client is not cut off.
const CONNECTION_TIMEOUT_MS = 60_000;

interface Connection {
    socket: WebSocket;
    author: Author | null;
    lastSeenAt: number;
}

const errorCode = (error: unknown): CommandError["code"] => {
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
    // InvalidDependencyError and InvalidIndexError both mean "you asked for
    // something the model does not allow", which is the same class of problem.
    if (error instanceof Error && (error.name === "InvalidDependencyError" || error.name === "InvalidIndexError")) {
        return "invalid";
    }
    return "internal";
};

const toCommandError = (error: unknown): CommandError => {
    // The message is shown to people, so it carries the explanation without the
    // error class name String(error) would prefix it with.
    const message = error instanceof Error ? error.message : String(error);
    const commandError: CommandError = { code: errorCode(error), message };
    if (error instanceof ConfirmRequiredError) {
        commandError.otherCount = error.otherCount;
    }
    return commandError;
};

interface RealtimeServerDeps {
    store: ProjectStore;
    project: Project;
    /** Identifies this process. Lets clients notice a restart reset the version. */
    serverId: string;
}

interface RealtimeServer {
    /** Passed to the REST router so both transports guard project switches alike. */
    commandDeps: Pick<CommandDeps, "otherPeerCount">;
    /** How many distinct browsers are connected. */
    connectedCount: () => number;
    close: () => Promise<void>;
}

/**
 * Pushes project state to every connected client the moment it changes, and
 * accepts mutations back over the same socket.
 *
 * Broadcasts are coalesced onto the next tick: a burst of mutations produces
 * one clone and one frame, and - because the reply to a command is written
 * before the flush runs - a client always sees its own result before the
 * broadcast it caused. The broadcast then no-ops against the client's version
 * guard.
 */
const createRealtimeServer = (httpServer: HttpServer, deps: RealtimeServerDeps): RealtimeServer => {
    const { store, project, serverId } = deps;
    const wss = new WebSocketServer({ server: httpServer, path: REALTIME_PATH });
    const connections = new Map<WebSocket, Connection>();

    let flushScheduled = false;
    let lastBroadcastProject: string | null = store.getState().activeProject;

    const send = (socket: WebSocket, message: ServerMessage) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    };

    const broadcast = (message: ServerMessage) => {
        for (const socket of connections.keys()) {
            send(socket, message);
        }
    };

    // Counted by browser rather than by socket, so somebody with two tabs open
    // is not mistaken for two people about to be interrupted.
    const connectedIds = (): Set<string> => {
        const ids = new Set<string>();
        for (const connection of connections.values()) {
            if (connection.author) {
                ids.add(connection.author.id);
            }
        }
        return ids;
    };

    const otherPeerCount = (author: Author | null): number => {
        const ids = connectedIds();
        if (author) {
            ids.delete(author.id);
        }
        return ids.size;
    };

    const snapshotFor = (): ServerMessage => ({
        type: "snapshot",
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        serverId,
        state: store.getState(),
    });

    const flush = () => {
        flushScheduled = false;
        const state: ProjectState = store.getState();
        const author = store.lastChangeAuthor;
        broadcast({ type: "state", state, author: author ?? undefined });

        // Opening or creating a project replaces what everyone is looking at,
        // so it gets called out rather than appearing as a silent redraw.
        if (state.activeProject !== lastBroadcastProject) {
            lastBroadcastProject = state.activeProject;
            broadcast({ type: "notice", kind: "project-switched", project: state.activeProject });
        }
    };

    const unsubscribe = store.onChange(() => {
        if (flushScheduled) {
            return;
        }
        flushScheduled = true;
        setImmediate(flush);
    });

    const commandDeps: CommandDeps = { store, project, otherPeerCount };

    const handleMessage = async (connection: Connection, raw: RawData) => {
        connection.lastSeenAt = Date.now();

        let message: ClientMessage;
        try {
            message = JSON.parse(String(raw));
        } catch {
            return;
        }

        switch (message.type) {
            case "hello":
                connection.author = message.author;
                return;
            case "resync":
                send(connection.socket, snapshotFor());
                return;
            case "pong":
                return;
            case "command":
                try {
                    const result = await dispatchCommand(commandDeps, message.name, message.payload, connection.author);
                    send(connection.socket, { type: "result", id: message.id, result });
                } catch (error) {
                    send(connection.socket, {
                        type: "error",
                        id: message.id,
                        error: toCommandError(error),
                        state: store.getState(),
                    });
                }
                return;
        }
    };

    wss.on("connection", (socket: WebSocket) => {
        const connection: Connection = {
            socket,
            author: null,
            lastSeenAt: Date.now(),
        };
        connections.set(socket, connection);

        send(socket, snapshotFor());

        socket.on("message", (raw) => {
            handleMessage(connection, raw).catch((error) => console.error("Realtime message failed:", error));
        });
        socket.on("pong", () => {
            connection.lastSeenAt = Date.now();
        });
        socket.on("close", () => {
            connections.delete(socket);
        });
        socket.on("error", () => {
            connections.delete(socket);
        });
    });

    // Browsers cannot originate protocol-level pings, so the app-level ping is
    // what keeps a half-open connection from lingering.
    const heartbeat = setInterval(() => {
        const cutoff = Date.now() - CONNECTION_TIMEOUT_MS;
        for (const connection of [...connections.values()]) {
            if (connection.lastSeenAt < cutoff) {
                connections.delete(connection.socket);
                connection.socket.terminate();
                continue;
            }
            send(connection.socket, { type: "ping" });
        }
    }, PING_INTERVAL_MS);
    // Never hold the process open just to send pings.
    heartbeat.unref?.();

    const close = async () => {
        clearInterval(heartbeat);
        unsubscribe();
        for (const socket of [...connections.keys()]) {
            socket.terminate();
        }
        connections.clear();
        await new Promise<void>((resolve) => wss.close(() => resolve()));
    };

    return { commandDeps: { otherPeerCount }, connectedCount: () => connectedIds().size, close };
};

export { createRealtimeServer, RealtimeServer, RealtimeServerDeps, PING_INTERVAL_MS, CONNECTION_TIMEOUT_MS };
