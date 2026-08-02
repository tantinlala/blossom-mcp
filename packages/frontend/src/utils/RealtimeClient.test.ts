import { GOAL_ID, ProjectState, ServerMessage } from "@blossom/common";
import { CommandFailure, RealtimeClient } from "./RealtimeClient";

const makeState = (version: number): ProjectState => ({
    version,
    activeProject: null,
    goal: { name: "Goal", id: GOAL_ID, completionState: false, plan: { tasksList: [], dependenciesList: [] } },
    inbox: [],
});

/**
 * A stand-in for the browser's WebSocket. jsdom provides a real one that would
 * genuinely try to dial out during tests, so the client takes its socket from
 * an injected factory and never constructs one itself.
 */
class FakeSocket {
    public static instances: FakeSocket[] = [];

    public readyState: number = WebSocket.CONNECTING;
    public sent: string[] = [];
    public onopen: (() => void) | null = null;
    public onmessage: ((event: { data: string }) => void) | null = null;
    public onclose: (() => void) | null = null;
    public onerror: (() => void) | null = null;

    constructor(public readonly url: string) {
        FakeSocket.instances.push(this);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {
        this.simulateClose();
    }

    // --- helpers for driving the socket from a test ---

    simulateOpen() {
        this.readyState = WebSocket.OPEN;
        this.onopen?.();
    }

    simulateMessage(message: ServerMessage) {
        this.onmessage?.({ data: JSON.stringify(message) });
    }

    simulateClose() {
        if (this.readyState === WebSocket.CLOSED) {
            return;
        }
        this.readyState = WebSocket.CLOSED;
        this.onclose?.();
    }

    parsedSends(): any[] {
        return this.sent.map((raw) => JSON.parse(raw));
    }
}

describe("RealtimeClient", () => {
    let client: RealtimeClient;

    const connect = () => {
        client = new RealtimeClient({
            url: "ws://test/ws",
            socketFactory: (url) => new FakeSocket(url) as unknown as WebSocket,
        });
        client.start();
        return FakeSocket.instances[FakeSocket.instances.length - 1];
    };

    beforeEach(() => {
        jest.useFakeTimers();
        FakeSocket.instances = [];
    });

    afterEach(() => {
        client?.stop();
        jest.useRealTimers();
    });

    it("reports the connection as open once the socket opens", () => {
        const states: string[] = [];
        client = new RealtimeClient({
            url: "ws://test/ws",
            socketFactory: (url) => new FakeSocket(url) as unknown as WebSocket,
        });
        client.onConnectionChange((state) => states.push(state));
        client.start();

        FakeSocket.instances[0].simulateOpen();

        expect(states).toContain("open");
        expect(client.isOpen()).toBe(true);
    });

    it("passes on a snapshot as one that must be applied unconditionally", () => {
        const socket = connect();
        const updates: any[] = [];
        client.onState((update) => updates.push(update));
        socket.simulateOpen();

        socket.simulateMessage({
            type: "snapshot",
            protocolVersion: 1,
            serverId: "server-a",
            state: makeState(4),
        });

        expect(updates).toHaveLength(1);
        expect(updates[0].isSnapshot).toBe(true);
        expect(updates[0].serverId).toBe("server-a");
    });

    it("gives up and reports a mismatch when the server speaks another protocol", () => {
        const socket = connect();
        const updates: any[] = [];
        let mismatches = 0;
        client.onState((update) => updates.push(update));
        client.onProtocolMismatch(() => mismatches++);
        socket.simulateOpen();

        socket.simulateMessage({
            type: "snapshot",
            protocolVersion: 999,
            serverId: "server-a",
            state: makeState(4),
        });

        expect(mismatches).toBe(1);
        // Frames of an unknown protocol cannot be trusted to mean what they look like.
        expect(updates).toHaveLength(0);

        // Reconnecting cannot fix a version mismatch, so it does not try.
        jest.advanceTimersByTime(60000);
        expect(FakeSocket.instances).toHaveLength(1);
    });

    it("passes on a pushed change with its author", () => {
        const socket = connect();
        const updates: any[] = [];
        client.onState((update) => updates.push(update));
        socket.simulateOpen();

        socket.simulateMessage({
            type: "state",
            state: makeState(5),
            author: { id: "ben", kind: "person" },
        });

        expect(updates[0].isSnapshot).toBe(false);
        expect(updates[0].author.id).toBe("ben");
    });

    it("announces who this browser is as soon as the socket opens", () => {
        const socket = connect();
        client.identify({ id: "ana", kind: "person" });

        socket.simulateOpen();

        expect(socket.parsedSends()).toContainEqual({
            type: "hello",
            author: { id: "ana", kind: "person" },
        });
    });

    it("resolves a command when its matching result arrives", async () => {
        const socket = connect();
        socket.simulateOpen();

        const pending = client.send("inbox/add", { text: "an idea" });
        const sent = socket.parsedSends().find((message) => message.type === "command");
        socket.simulateMessage({ type: "result", id: sent.id, result: makeState(6) });

        await expect(pending).resolves.toEqual(makeState(6));
    });

    it("rejects a command the server refused, carrying its authoritative state", async () => {
        const socket = connect();
        socket.simulateOpen();

        const pending = client.send("inbox/update", { index: 0, text: "mine" });
        const sent = socket.parsedSends().find((message) => message.type === "command");
        socket.simulateMessage({
            type: "error",
            id: sent.id,
            error: { code: "conflict", message: "Someone got there first" },
            state: makeState(7),
        });

        await expect(pending).rejects.toBeInstanceOf(CommandFailure);
        await pending.catch((failure: CommandFailure) => {
            expect(failure.error.code).toBe("conflict");
            expect(failure.state).toEqual(makeState(7));
        });
    });

    it("rejects rather than retrying when the connection drops mid-command", async () => {
        const socket = connect();
        socket.simulateOpen();

        const pending = client.send("tasks/add", { name: "Do the thing" });
        socket.simulateClose();

        // A retry would risk adding the task twice, so the caller is told instead.
        await expect(pending).rejects.toBeInstanceOf(CommandFailure);
    });

    it("refuses to send at all when the socket is not open", async () => {
        connect();

        await expect(client.send("inbox/add", { text: "x" })).rejects.toBeInstanceOf(CommandFailure);
    });

    it("answers the server's ping so it is not treated as a dead connection", () => {
        const socket = connect();
        socket.simulateOpen();

        socket.simulateMessage({ type: "ping" });

        expect(socket.parsedSends()).toContainEqual({ type: "pong" });
    });

    it("passes on a notice that somebody switched project", () => {
        const socket = connect();
        const notices: any[] = [];
        client.onNotice((notice) => notices.push(notice));
        socket.simulateOpen();
        client.identify({ id: "this-browser", kind: "person" });

        socket.simulateMessage({
            type: "notice",
            kind: "project-switched",
            project: "q3",
            author: { id: "another-browser", kind: "person" },
        });

        expect(notices).toEqual([{ kind: "project-switched", project: "q3", byThisBrowser: false }]);
    });

    it("marks a notice carrying this browser's own author as its own doing", () => {
        const socket = connect();
        const notices: any[] = [];
        client.onNotice((notice) => notices.push(notice));
        socket.simulateOpen();
        client.identify({ id: "this-browser", kind: "person" });

        socket.simulateMessage({
            type: "notice",
            kind: "project-switched",
            project: "q3",
            author: { id: "this-browser", kind: "person" },
        });

        expect(notices).toEqual([{ kind: "project-switched", project: "q3", byThisBrowser: true }]);
    });

    it("treats an unattributed notice as somebody else's doing", () => {
        const socket = connect();
        const notices: any[] = [];
        client.onNotice((notice) => notices.push(notice));
        socket.simulateOpen();
        client.identify({ id: "this-browser", kind: "person" });

        socket.simulateMessage({ type: "notice", kind: "project-switched", project: "q3" });

        expect(notices).toEqual([{ kind: "project-switched", project: "q3", byThisBrowser: false }]);
    });

    it("reconnects after a drop, backing off before trying again", () => {
        const socket = connect();
        socket.simulateOpen();
        expect(FakeSocket.instances).toHaveLength(1);

        socket.simulateClose();
        expect(FakeSocket.instances).toHaveLength(1);

        jest.advanceTimersByTime(1000);

        expect(FakeSocket.instances).toHaveLength(2);
    });

    it("reconnects straight away when the network comes back", () => {
        const socket = connect();
        socket.simulateOpen();
        socket.simulateClose();

        window.dispatchEvent(new Event("online"));

        // No waiting for the backoff: the delay exists for a server that is
        // down, not for a client that just regained its network.
        expect(FakeSocket.instances).toHaveLength(2);
    });

    it("asks for a fresh snapshot when a connected tab is brought back to the front", () => {
        const socket = connect();
        socket.simulateOpen();

        Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));

        expect(socket.parsedSends()).toContainEqual({ type: "resync" });
    });

    it("reconnects when a disconnected tab is brought back to the front", () => {
        const socket = connect();
        socket.simulateOpen();
        socket.simulateClose();

        Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));

        expect(FakeSocket.instances).toHaveLength(2);
    });

    it("stops listening once stopped", () => {
        const socket = connect();
        socket.simulateOpen();
        const updates: any[] = [];
        client.onState((update) => updates.push(update));

        client.stop();
        socket.simulateMessage({ type: "state", state: makeState(9) });
        window.dispatchEvent(new Event("online"));

        expect(updates).toHaveLength(0);
        expect(FakeSocket.instances).toHaveLength(1);
    });
});
