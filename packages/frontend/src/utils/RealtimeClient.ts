import {
    Author,
    ClientMessage,
    CommandError,
    CommandName,
    ProjectState,
    REALTIME_PROTOCOL_VERSION,
    ServerMessage,
} from "@blossom/common";
import { resolveRealtimeUrl } from "./realtimeUrl";

export type ConnectionState = "connecting" | "open" | "offline";

export interface StateUpdate {
    state: ProjectState;
    author?: Author;
    /**
     * Snapshots are applied unconditionally. Ordinary updates are subject to the
     * receiver's version guard, which a snapshot must bypass so that a server
     * restart - which resets the version counter - still resyncs.
     */
    isSnapshot: boolean;
    /** Identifies the server process; a change means it restarted. */
    serverId?: string;
}

export interface Notice {
    kind: "project-switched";
    project: string | null;
}

/** Rejection reason for a command that never got a successful reply. */
export class CommandFailure extends Error {
    public readonly error: CommandError;
    public readonly state?: ProjectState;

    constructor(error: CommandError, state?: ProjectState) {
        super(error.message);
        this.name = "CommandFailure";
        this.error = error;
        this.state = state;
    }
}

type Listener<T> = (value: T) => void;

const BASE_RETRY_MS = 500;
const MAX_RETRY_MS = 30_000;
// A connection has to survive this long before we trust it enough to reset the
// backoff; otherwise a server that accepts then immediately drops gets hammered.
const STABLE_CONNECTION_MS = 5_000;
const COMMAND_TIMEOUT_MS = 10_000;
// Comfortably longer than the server's 25s ping, so an idle connection is not
// mistaken for a dead one.
const SILENCE_TIMEOUT_MS = 45_000;

export interface RealtimeClientOptions {
    url?: string;
    /** Injected in tests so no real socket is ever opened. */
    socketFactory?: (url: string) => WebSocket;
}

/**
 * Keeps a WebSocket to the backend open, pushing project changes to the app as
 * they happen and carrying the app's own mutations back the other way.
 *
 * Reconnects on its own with jittered exponential backoff, and immediately when
 * the tab is brought back to the foreground or the network returns - the two
 * moments a person is most likely to be looking at stale state.
 */
export class RealtimeClient {
    private readonly url: string;
    private readonly socketFactory: (url: string) => WebSocket;

    private socket: WebSocket | null = null;
    private author: Author | null = null;
    private connectionState: ConnectionState = "connecting";
    private serverId: string | null = null;

    private attempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private stableTimer: ReturnType<typeof setTimeout> | null = null;
    private silenceTimer: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;

    private nextCommandId = 0;
    private readonly pending = new Map<
        string,
        { resolve: (value: unknown) => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout> }
    >();

    private readonly stateListeners = new Set<Listener<StateUpdate>>();
    private readonly connectionListeners = new Set<Listener<ConnectionState>>();
    private readonly noticeListeners = new Set<Listener<Notice>>();
    private readonly protocolMismatchListeners = new Set<Listener<void>>();

    constructor(options: RealtimeClientOptions = {}) {
        this.url = options.url ?? resolveRealtimeUrl();
        this.socketFactory = options.socketFactory ?? ((url: string) => new WebSocket(url));
    }

    // ------------------------------------------------------------- lifecycle

    public start() {
        if (this.stopped) {
            return;
        }
        this.addWindowListeners();
        this.connect();
    }

    public stop() {
        this.stopped = true;
        this.removeWindowListeners();
        this.clearTimer("reconnectTimer");
        this.clearTimer("stableTimer");
        this.clearTimer("silenceTimer");
        this.failAllPending({ code: "internal", message: "Realtime client stopped" });
        const socket = this.socket;
        this.socket = null;
        socket?.close();
        this.stateListeners.clear();
        this.connectionListeners.clear();
        this.noticeListeners.clear();
        this.protocolMismatchListeners.clear();
    }

    /** Identifies this browser to the server so its changes can be told apart. */
    public identify(author: Author) {
        this.author = author;
        this.rawSend({ type: "hello", author });
    }

    // ------------------------------------------------------------- observers

    public onState(listener: Listener<StateUpdate>): () => void {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener) as unknown as void;
    }

    public onConnectionChange(listener: Listener<ConnectionState>): () => void {
        this.connectionListeners.add(listener);
        return () => this.connectionListeners.delete(listener) as unknown as void;
    }

    public onNotice(listener: Listener<Notice>): () => void {
        this.noticeListeners.add(listener);
        return () => this.noticeListeners.delete(listener) as unknown as void;
    }

    /**
     * Fired when the server speaks a protocol this build does not. Reconnecting
     * cannot fix that, so the socket gives up and the app asks for a reload.
     */
    public onProtocolMismatch(listener: Listener<void>): () => void {
        this.protocolMismatchListeners.add(listener);
        return () => this.protocolMismatchListeners.delete(listener) as unknown as void;
    }

    public getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    public isOpen(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    // ------------------------------------------------------------- commands

    /**
     * Runs a mutation over the socket. Rejects rather than retrying: every
     * mutation here is non-idempotent, so a retry that races a reply the client
     * never saw would duplicate the change. The caller falls back to REST only
     * when the socket was closed to begin with, never after a failed send.
     */
    public send(name: CommandName, payload: unknown): Promise<unknown> {
        if (!this.isOpen()) {
            return Promise.reject(new CommandFailure({ code: "internal", message: "Realtime socket is not open" }));
        }

        const id = String(++this.nextCommandId);
        return new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new CommandFailure({ code: "internal", message: "Timed out waiting for the server" }));
            }, COMMAND_TIMEOUT_MS);
            this.pending.set(id, { resolve, reject, timer });
            this.rawSend({ type: "command", id, name, payload });
        });
    }

    /** Asks the server for a fresh snapshot. */
    public resync() {
        this.rawSend({ type: "resync" });
    }

    // ------------------------------------------------------------- internals

    private connect() {
        if (this.stopped) {
            return;
        }
        this.clearTimer("reconnectTimer");
        this.setConnectionState(this.attempt === 0 ? "connecting" : this.connectionState);

        let socket: WebSocket;
        try {
            socket = this.socketFactory(this.url);
        } catch {
            this.scheduleReconnect();
            return;
        }
        this.socket = socket;

        socket.onopen = () => {
            this.armSilenceTimer();
            // Only a connection that lasts is treated as healthy.
            this.clearTimer("stableTimer");
            this.stableTimer = setTimeout(() => {
                this.attempt = 0;
            }, STABLE_CONNECTION_MS);

            this.setConnectionState("open");
            if (this.author) {
                this.rawSend({ type: "hello", author: this.author });
            }
        };

        socket.onmessage = (event: MessageEvent) => {
            this.armSilenceTimer();
            let message: ServerMessage;
            try {
                message = JSON.parse(String(event.data));
            } catch {
                return;
            }
            this.handleMessage(message);
        };

        socket.onclose = () => {
            if (this.socket === socket) {
                this.socket = null;
            }
            this.failAllPending({ code: "internal", message: "Connection lost" });
            this.setConnectionState("offline");
            this.scheduleReconnect();
        };

        socket.onerror = () => {
            // onclose always follows, which is where reconnection is handled.
        };
    }

    private handleMessage(message: ServerMessage) {
        switch (message.type) {
            case "snapshot":
                // Frames from another protocol version cannot be trusted to
                // mean what they appear to, so stop rather than guess.
                if (message.protocolVersion !== REALTIME_PROTOCOL_VERSION) {
                    this.halt();
                    this.emit(this.protocolMismatchListeners, undefined);
                    return;
                }
                this.serverId = message.serverId;
                this.emit(this.stateListeners, {
                    state: message.state,
                    isSnapshot: true,
                    serverId: message.serverId,
                });
                return;
            case "state":
                this.emit(this.stateListeners, {
                    state: message.state,
                    author: message.author,
                    isSnapshot: false,
                    serverId: this.serverId ?? undefined,
                });
                return;
            case "notice":
                this.emit(this.noticeListeners, { kind: message.kind, project: message.project });
                return;
            case "result": {
                const pending = this.pending.get(message.id);
                if (pending) {
                    this.pending.delete(message.id);
                    clearTimeout(pending.timer);
                    pending.resolve(message.result);
                }
                return;
            }
            case "error": {
                const pending = this.pending.get(message.id);
                if (pending) {
                    this.pending.delete(message.id);
                    clearTimeout(pending.timer);
                    pending.reject(new CommandFailure(message.error, message.state));
                }
                return;
            }
            case "ping":
                this.rawSend({ type: "pong" });
                return;
        }
    }

    private rawSend(message: ClientMessage) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }

    private scheduleReconnect() {
        if (this.stopped || this.reconnectTimer) {
            return;
        }
        const backoff = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** this.attempt);
        // Jitter keeps many tabs waking from sleep from reconnecting in lockstep.
        const delay = backoff * (0.75 + Math.random() * 0.5);
        this.attempt += 1;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    /**
     * Gives up for good without tearing down the listeners, so whatever made
     * reconnection pointless can still be reported to the app.
     */
    private halt() {
        this.stopped = true;
        this.removeWindowListeners();
        this.clearTimer("reconnectTimer");
        this.clearTimer("stableTimer");
        this.clearTimer("silenceTimer");
        this.failAllPending({ code: "internal", message: "Realtime client stopped" });
        const socket = this.socket;
        this.socket = null;
        socket?.close();
        this.setConnectionState("offline");
    }

    /** Drops the current socket and reconnects immediately, ignoring the backoff. */
    private reconnectNow() {
        if (this.stopped) {
            return;
        }
        this.clearTimer("reconnectTimer");
        this.attempt = 0;
        const socket = this.socket;
        this.socket = null;
        socket?.close();
        this.connect();
    }

    // The server pings every 25s, so prolonged silence means the connection is
    // dead in a way the browser has not noticed - common after a laptop sleeps.
    private armSilenceTimer() {
        this.clearTimer("silenceTimer");
        this.silenceTimer = setTimeout(() => this.reconnectNow(), SILENCE_TIMEOUT_MS);
    }

    private handleVisibilityChange = () => {
        if (document.visibilityState !== "visible") {
            return;
        }
        // Whatever happened while the tab was hidden, get current straight away.
        if (this.isOpen()) {
            this.resync();
        } else {
            this.reconnectNow();
        }
    };

    private handleOnline = () => this.reconnectNow();

    private handleOffline = () => this.setConnectionState("offline");

    private addWindowListeners() {
        if (typeof window === "undefined") {
            return;
        }
        document.addEventListener("visibilitychange", this.handleVisibilityChange);
        window.addEventListener("online", this.handleOnline);
        window.addEventListener("offline", this.handleOffline);
    }

    private removeWindowListeners() {
        if (typeof window === "undefined") {
            return;
        }
        document.removeEventListener("visibilitychange", this.handleVisibilityChange);
        window.removeEventListener("online", this.handleOnline);
        window.removeEventListener("offline", this.handleOffline);
    }

    private setConnectionState(state: ConnectionState) {
        if (this.connectionState === state) {
            return;
        }
        this.connectionState = state;
        this.emit(this.connectionListeners, state);
    }

    private failAllPending(error: CommandError) {
        for (const [id, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(new CommandFailure(error));
            this.pending.delete(id);
        }
    }

    private clearTimer(name: "reconnectTimer" | "stableTimer" | "silenceTimer") {
        const timer = this[name];
        if (timer) {
            clearTimeout(timer);
            this[name] = null;
        }
    }

    private emit<T>(listeners: Set<Listener<T>>, value: T) {
        for (const listener of [...listeners]) {
            listener(value);
        }
    }
}
