import http from "http";
import express from "express";
import { AddressInfo } from "net";
import WebSocket from "ws";
import { mock, MockProxy } from "jest-mock-extended";
import { Author, GOAL_ID, REALTIME_PROTOCOL_VERSION, ServerMessage } from "@blossom/common";
import { createRealtimeServer, RealtimeServer } from "./realtimeServer";
import { ProjectStore } from "../state/projectStore";
import { Workspace } from "../state/workspace";
import { Project } from "../models/project";

const ana: Author = { id: "ana", kind: "person" };
const ben: Author = { id: "ben", kind: "person" };

describe("realtime server", () => {
    let workspace: Workspace;
    let store: ProjectStore;
    let project: MockProxy<Project>;
    let httpServer: http.Server;
    let realtime: RealtimeServer;
    let url: string;
    const clients: WebSocket[] = [];

    beforeEach(async () => {
        project = mock<Project>();
        project.listExistingProjects.mockResolvedValue([]);
        project.projectExists.mockResolvedValue(false);
        workspace = new Workspace(project);
        store = await workspace.createDraft();
        httpServer = http.createServer(express());
        realtime = createRealtimeServer(httpServer, { workspace, project, serverId: "test-server" });
        await new Promise<void>((resolve) => httpServer.listen(0, resolve));
        url = `ws://localhost:${(httpServer.address() as AddressInfo).port}/ws`;
    });

    afterEach(async () => {
        clients.splice(0).forEach((client) => client.close());
        await realtime.close();
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    /** Opens a client and collects everything the server sends it. */
    const openSocket = async (): Promise<{ socket: WebSocket; received: ServerMessage[] }> => {
        const socket = new WebSocket(url);
        const received: ServerMessage[] = [];
        socket.on("message", (raw) => received.push(JSON.parse(String(raw))));
        clients.push(socket);
        await new Promise<void>((resolve) => socket.once("open", () => resolve()));
        return { socket, received };
    };

    const send = (socket: WebSocket, message: unknown) => socket.send(JSON.stringify(message));

    /** Lets the coalesced broadcast and any replies make it across the wire. */
    const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

    /**
     * Opens a client that has said who it is and which projects it is looking at,
     * which is what every browser does the moment its socket opens.
     */
    const connect = async (author: Author = ana, view: string[] = [store.key]) => {
        const client = await openSocket();
        send(client.socket, { type: "hello", author, view });
        await settle();
        return client;
    };

    const firstOfType = <T extends ServerMessage["type"]>(received: ServerMessage[], type: T) =>
        received.find((message) => message.type === type) as Extract<ServerMessage, { type: T }> | undefined;

    const noticesOfKind = (received: ServerMessage[], kind: string) =>
        received.filter((message) => message.type === "notice" && message.kind === kind);

    it("answers hello with a snapshot of the projects that session asked for", async () => {
        const { received } = await connect();

        const snapshot = firstOfType(received, "snapshot");
        expect(snapshot).toBeDefined();
        expect(snapshot!.serverId).toBe("test-server");
        expect(snapshot!.protocolVersion).toBe(REALTIME_PROTOCOL_VERSION);
        expect(snapshot!.view.projects.map((entry) => entry.key)).toEqual([store.key]);
        expect(snapshot!.view.assistantProject).toBeNull();
    });

    it("sends an empty board to a session looking at nothing", async () => {
        const { received } = await connect(ana, []);

        expect(firstOfType(received, "snapshot")!.view.projects).toEqual([]);
    });

    it("opens a saved project a session asks for", async () => {
        project.projectExists.mockResolvedValue(true);
        project.restoreProject.mockResolvedValue({
            goal: { name: "From disk", id: GOAL_ID, completionState: false, plan: null as any },
            inbox: [],
        });

        const { received } = await connect(ana, ["Trip"]);

        expect(firstOfType(received, "snapshot")!.view.projects.map((entry) => entry.key)).toEqual(["Trip"]);
    });

    it("leaves a project name with nothing behind it off the board", async () => {
        const { received } = await connect(ana, [store.key, "Gone"]);

        expect(firstOfType(received, "snapshot")!.view.projects.map((entry) => entry.key)).toEqual([store.key]);
    });

    it("changes what a session is looking at, and answers with the new board", async () => {
        const other = await workspace.createDraft();
        other.setGoal("The other one");
        const { socket, received } = await connect();

        send(socket, { type: "subscribe", view: [other.key] });
        await settle();

        const snapshots = received.filter((message) => message.type === "snapshot");
        expect(snapshots).toHaveLength(2);
        expect((snapshots[1] as any).view.projects.map((entry: any) => entry.key)).toEqual([other.key]);
    });

    it("runs a command and replies with the same payload REST would return", async () => {
        const { socket, received } = await connect();

        send(socket, { type: "command", id: "1", name: "goal", payload: { projectKey: store.key, name: "Ship it" } });
        await settle();

        const result = firstOfType(received, "result");
        expect(result!.id).toBe("1");
        expect((result!.result as any).goal.name).toBe("Ship it");
    });

    it("pushes a change made by one client to another looking at the same project", async () => {
        const a = await connect(ana);
        const b = await connect(ben);

        send(a.socket, { type: "command", id: "1", name: "goal", payload: { projectKey: store.key, name: "Ship it" } });
        await settle();

        const pushed = firstOfType(b.received, "state");
        expect(pushed!.state.goal.name).toBe("Ship it");
        expect(pushed!.state.key).toBe(store.key);
    });

    it("leaves a session looking at another project alone", async () => {
        const other = await workspace.createDraft();
        const a = await connect(ana, [store.key]);
        const b = await connect(ben, [other.key]);

        send(a.socket, { type: "command", id: "1", name: "goal", payload: { projectKey: store.key, name: "Ship it" } });
        await settle();

        expect(firstOfType(a.received, "state")).toBeDefined();
        expect(firstOfType(b.received, "state")).toBeUndefined();
    });

    it("pushes each project separately to a session holding both", async () => {
        const other = await workspace.createDraft();
        const { received } = await connect(ana, [store.key, other.key]);

        store.setGoal("The first");
        other.setGoal("The second");
        await settle();

        const pushed = received.filter((message) => message.type === "state") as any[];
        expect(pushed.map((message) => message.state.key)).toEqual([store.key, other.key]);
    });

    it("pushes a change made outside the socket, as an MCP client would", async () => {
        const { received } = await connect();

        store.setGoal("Set over MCP");
        await settle();

        const pushed = firstOfType(received, "state");
        expect(pushed!.state.goal.name).toBe("Set over MCP");
    });

    it("attributes a pushed change to whoever made it", async () => {
        const a = await connect(ana);
        const b = await connect(ben);

        send(a.socket, { type: "command", id: "1", name: "goal", payload: { projectKey: store.key, name: "Ship it" } });
        await settle();

        expect(firstOfType(b.received, "state")!.author).toEqual(ana);
    });

    it("coalesces a burst of changes to one project into a single broadcast", async () => {
        const { received } = await connect();

        store.addIdea("one");
        store.addIdea("two");
        store.addIdea("three");
        await settle();

        const broadcasts = received.filter((message) => message.type === "state");
        expect(broadcasts).toHaveLength(1);
        expect((broadcasts[0] as any).state.inbox.map((idea: { text: string }) => idea.text)).toEqual([
            "three",
            "two",
            "one",
        ]);
    });

    it("counts each connected browser", async () => {
        await connect(ana);
        await connect(ben);

        expect(realtime.connectedCount()).toBe(2);
    });

    it("counts one browser with two tabs open only once", async () => {
        await connect(ana);
        await connect(ana);

        expect(realtime.connectedCount()).toBe(1);
    });

    it("stops counting a browser once it disconnects", async () => {
        await connect(ana);
        const b = await connect(ben);

        b.socket.close();
        await settle();

        expect(realtime.connectedCount()).toBe(1);
    });

    it("resends the board on request", async () => {
        const { socket, received } = await connect();
        store.setGoal("Changed while away");
        await settle();

        send(socket, { type: "resync" });
        await settle();

        const snapshots = received.filter((message) => message.type === "snapshot");
        expect(snapshots).toHaveLength(2);
        expect((snapshots[1] as any).view.projects[0].goal.name).toBe("Changed while away");
    });

    it("reports a refused write with the authoritative state to rebase onto", async () => {
        const { socket, received } = await connect();
        store.addIdea("theirs");
        await settle();

        send(socket, {
            type: "command",
            id: "1",
            name: "inbox/update",
            payload: { projectKey: store.key, index: 0, text: "mine", expectedText: "something else" },
        });
        await settle();

        const error = firstOfType(received, "error");
        expect(error!.error.code).toBe("conflict");
        expect(error!.state!.inbox.map((idea) => idea.text)).toEqual(["theirs"]);
    });

    it("refuses to let one person undo another's change", async () => {
        const a = await connect(ana);
        const b = await connect(ben);

        send(a.socket, {
            type: "command",
            id: "1",
            name: "goal",
            payload: { projectKey: store.key, name: "Ana's goal" },
        });
        await settle();
        send(b.socket, { type: "command", id: "2", name: "undo", payload: { projectKey: store.key } });
        await settle();

        const error = firstOfType(b.received, "error");
        expect(error!.error.code).toBe("undo-blocked");
        expect(error!.error.message).toContain("Someone else has changed the project");
        expect(store.getState().goal.name).toBe("Ana's goal");
    });

    it("opens a project for one session without disturbing anybody else's board", async () => {
        project.projectExists.mockResolvedValue(true);
        project.restoreProject.mockResolvedValue({
            goal: { name: "Q3", id: GOAL_ID, completionState: false, plan: null as any },
            inbox: [],
        });
        const a = await connect(ana, [store.key]);
        const b = await connect(ben, [store.key]);

        send(b.socket, { type: "command", id: "1", name: "projects/open", payload: { filename: "q3-roadmap" } });
        send(b.socket, { type: "subscribe", view: [store.key, "q3-roadmap"] });
        await settle();

        const board = [...b.received].reverse().find((message) => message.type === "snapshot") as any;
        expect(board.view.projects.map((entry: any) => entry.key)).toEqual([store.key, "q3-roadmap"]);
        // Ana asked for one project and is looking at one project.
        expect(a.received.filter((message) => message.type === "snapshot")).toHaveLength(1);
    });

    it("tells every session looking at a project that it answers to a new key", async () => {
        const openedAs = store.key;
        const a = await connect(ana, [openedAs]);
        const b = await connect(ben, [openedAs]);

        send(b.socket, {
            type: "command",
            id: "1",
            name: "projects/save",
            payload: { projectKey: store.key, filename: "q3-roadmap" },
        });
        await settle();

        // The author rides along so Ben's own browser can tell it was his doing.
        expect(noticesOfKind(a.received, "project-renamed")).toEqual([
            { type: "notice", kind: "project-renamed", from: openedAs, to: "q3-roadmap", author: ben },
        ]);
    });

    it("pushes a renamed project's changes under the key sessions now know it by", async () => {
        const { socket, received } = await connect();
        send(socket, {
            type: "command",
            id: "1",
            name: "projects/save",
            payload: { projectKey: store.key, filename: "q3-roadmap" },
        });
        await settle();

        store.setGoal("Changed after the save");
        await settle();

        const pushed = [...received].reverse().find((message) => message.type === "state") as any;
        expect(pushed.state.key).toBe("q3-roadmap");
    });

    it("tells everybody which project the assistant works on, since it is one choice for all", async () => {
        const a = await connect(ana);
        const b = await connect(ben);

        send(b.socket, { type: "command", id: "1", name: "assistant/target", payload: { projectKey: store.key } });
        await settle();

        expect(noticesOfKind(a.received, "assistant-target")).toEqual([
            { type: "notice", kind: "assistant-target", project: store.key },
        ]);
    });

    it("ignores a malformed frame rather than dropping the connection", async () => {
        const { socket, received } = await connect();

        socket.send("not json at all");
        send(socket, {
            type: "command",
            id: "1",
            name: "goal",
            payload: { projectKey: store.key, name: "Still working" },
        });
        await settle();

        expect(firstOfType(received, "result")).toBeDefined();
    });

    it("stops broadcasting once closed", async () => {
        const { received } = await connect();

        await realtime.close();
        store.setGoal("After close");
        await settle();

        expect(received.filter((message) => message.type === "state")).toHaveLength(0);
    });
});
