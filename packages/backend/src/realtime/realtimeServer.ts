import { Server as HttpServer } from "http";
import { RawData, WebSocket, WebSocketServer } from "ws";
import {
    Author,
    ClientMessage,
    CommandError,
    CommandName,
    ProjectState,
    REALTIME_PATH,
    REALTIME_PROTOCOL_VERSION,
    ServerMessage,
} from "@blossom/common";
import { Workspace } from "../state/workspace";
import { CommandDeps, dispatchCommand, projectFor } from "../state/commands";
import { errorCode } from "../state/errorCodes";
import { Project } from "../models/project";

const PING_INTERVAL_MS = 25_000;
// Two missed pings. Kept well above the interval so a slow client is not cut off.
const CONNECTION_TIMEOUT_MS = 60_000;

interface Connection {
    socket: WebSocket;
    author: Author | null;
    /** The keys of the projects this session is looking at, in board order. */
    view: string[];
    lastSeenAt: number;
}

const toCommandError = (error: unknown): CommandError => {
    // The message is shown to people, so it carries the explanation without the
    // error class name String(error) would prefix it with.
    const message = error instanceof Error ? error.message : String(error);
    return { code: errorCode(error), message };
};

interface RealtimeServerDeps {
    workspace: Workspace;
    project: Project;
    /** Identifies this process. Lets clients notice a restart reset the versions. */
    serverId: string;
}

interface RealtimeServer {
    /** How many distinct browsers are connected. */
    connectedCount: () => number;
    close: () => Promise<void>;
}

/**
 * Pushes project state to every connected client the moment it changes, and
 * accepts mutations back over the same socket.
 *
 * Each connection carries its own view: the projects that session asked for. A
 * change is sent to the sessions looking at the project it happened in, so two
 * people can work on different projects over one server without seeing each
 * other's plans.
 *
 * Broadcasts are coalesced onto the next tick, one frame per project that
 * changed - and because the reply to a command is written before the flush runs,
 * a client always sees its own result before the broadcast it caused. The
 * broadcast then no-ops against the client's version guard.
 */
const createRealtimeServer = (httpServer: HttpServer, deps: RealtimeServerDeps): RealtimeServer => {
    const { workspace, project, serverId } = deps;
    const wss = new WebSocketServer({ server: httpServer, path: REALTIME_PATH });
    const connections = new Map<WebSocket, Connection>();
    const commandDeps: CommandDeps = { workspace, project };

    // The projects that have changed since the last flush.
    const dirty = new Set<string>();
    let flushScheduled = false;

    const send = (socket: WebSocket, message: ServerMessage) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    };

    /** Sends to every session whose view holds that project. */
    const sendToViewers = (key: string, message: ServerMessage) => {
        for (const connection of connections.values()) {
            if (connection.view.includes(key)) {
                send(connection.socket, message);
            }
        }
    };

    const broadcast = (message: ServerMessage) => {
        for (const socket of connections.keys()) {
            send(socket, message);
        }
    };

    // Counted by browser rather than by socket, so somebody with two tabs open
    // is counted once.
    const connectedIds = (): Set<string> => {
        const ids = new Set<string>();
        for (const connection of connections.values()) {
            if (connection.author) {
                ids.add(connection.author.id);
            }
        }
        return ids;
    };

    const snapshotFor = (connection: Connection): ServerMessage => ({
        type: "snapshot",
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        serverId,
        view: workspace.viewState(connection.view),
    });

    const flush = () => {
        flushScheduled = false;
        const keys = [...dirty];
        dirty.clear();

        for (const key of keys) {
            const store = workspace.get(key);
            if (!store) {
                continue;
            }
            const author = store.lastChangeAuthor;
            sendToViewers(key, { type: "state", state: store.getState(), author: author ?? undefined });
        }
    };

    const scheduleFlush = (key: string) => {
        dirty.add(key);
        if (flushScheduled) {
            return;
        }
        flushScheduled = true;
        setImmediate(flush);
    };

    const unsubscribes = [
        workspace.onChange(scheduleFlush),

        // A project written under another filename answers to that filename from
        // then on, so every session looking at it is told which key to use.
        workspace.onRename((from, to, author) => {
            for (const connection of connections.values()) {
                const index = connection.view.indexOf(from);
                if (index === -1) {
                    continue;
                }
                connection.view[index] = to;
                send(connection.socket, {
                    type: "notice",
                    kind: "project-renamed",
                    from,
                    to,
                    author: author ?? undefined,
                });
            }
        }),

        // Which project MCP acts on is the same for everybody, so everybody hears it.
        workspace.onAssistantTargetChange((key) => {
            broadcast({ type: "notice", kind: "assistant-target", project: key, author: undefined });
        }),
    ];

    /** Puts a session on a set of projects, opening any it names that are not open yet. */
    const applyView = async (connection: Connection, view: unknown): Promise<void> => {
        const requested = Array.isArray(view) ? view.filter((key): key is string => typeof key === "string") : [];
        connection.view = await workspace.openMany(requested);
    };

    /**
     * The authoritative state of the project a failed command was aimed at, so a
     * conflict heals itself. A command whose project cannot be worked out leaves
     * the client to ask for its view.
     */
    const stateForFailure = (name: CommandName, payload: unknown): ProjectState | undefined => {
        try {
            return projectFor(commandDeps, name, payload).getState();
        } catch {
            return undefined;
        }
    };

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
                await applyView(connection, message.view);
                send(connection.socket, snapshotFor(connection));
                return;
            case "subscribe":
                await applyView(connection, message.view);
                send(connection.socket, snapshotFor(connection));
                return;
            case "resync":
                send(connection.socket, snapshotFor(connection));
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
                        state: stateForFailure(message.name, message.payload),
                    });
                }
                return;
        }
    };

    wss.on("connection", (socket: WebSocket) => {
        const connection: Connection = {
            socket,
            author: null,
            view: [],
            lastSeenAt: Date.now(),
        };
        connections.set(socket, connection);

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
        unsubscribes.forEach((unsubscribe) => unsubscribe());
        for (const socket of [...connections.keys()]) {
            socket.terminate();
        }
        connections.clear();
        await new Promise<void>((resolve) => wss.close(() => resolve()));
    };

    return { connectedCount: () => connectedIds().size, close };
};

export { createRealtimeServer, RealtimeServer, RealtimeServerDeps, PING_INTERVAL_MS, CONNECTION_TIMEOUT_MS };
