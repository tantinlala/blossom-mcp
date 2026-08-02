import http from "http";
import express from "express";
import { AddressInfo } from "net";
import WebSocket from "ws";
import { mock, MockProxy } from "jest-mock-extended";
import { Author, GOAL_ID, ServerMessage } from "@blossom/common";
import { createRealtimeServer, RealtimeServer } from "./realtimeServer";
import { ProjectStore } from "../state/projectStore";
import { Project } from "../models/project";

const ana: Author = { id: "ana", kind: "person" };
const ben: Author = { id: "ben", kind: "person" };

describe("realtime server", () => {
    let store: ProjectStore;
    let project: MockProxy<Project>;
    let httpServer: http.Server;
    let realtime: RealtimeServer;
    let url: string;
    const clients: WebSocket[] = [];

    beforeEach(async () => {
        store = new ProjectStore();
        project = mock<Project>();
        httpServer = http.createServer(express());
        realtime = createRealtimeServer(httpServer, { store, project, serverId: "test-server" });
        await new Promise<void>((resolve) => httpServer.listen(0, resolve));
        url = `ws://localhost:${(httpServer.address() as AddressInfo).port}/ws`;
    });

    afterEach(async () => {
        clients.splice(0).forEach((client) => client.close());
        await realtime.close();
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    /** Opens a client and collects everything the server sends it. */
    const connect = async (): Promise<{ socket: WebSocket; received: ServerMessage[] }> => {
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

    const firstOfType = <T extends ServerMessage["type"]>(received: ServerMessage[], type: T) =>
        received.find((message) => message.type === type) as Extract<ServerMessage, { type: T }> | undefined;

    it("sends a snapshot as soon as a client connects", async () => {
        const { received } = await connect();
        await settle();

        const snapshot = firstOfType(received, "snapshot");
        expect(snapshot).toBeDefined();
        expect(snapshot!.serverId).toBe("test-server");
        expect(snapshot!.protocolVersion).toBe(1);
        expect(snapshot!.state.version).toBe(store.getVersion());
    });

    it("runs a command and replies with the same payload REST would return", async () => {
        const { socket, received } = await connect();

        send(socket, { type: "command", id: "1", name: "goal", payload: { name: "Ship it" } });
        await settle();

        const result = firstOfType(received, "result");
        expect(result!.id).toBe("1");
        expect((result!.result as any).goal.name).toBe("Ship it");
    });

    it("pushes a change made by one client to another", async () => {
        const a = await connect();
        const b = await connect();

        send(a.socket, { type: "command", id: "1", name: "goal", payload: { name: "Ship it" } });
        await settle();

        const pushed = firstOfType(b.received, "state");
        expect(pushed!.state.goal.name).toBe("Ship it");
    });

    it("pushes a change made outside the socket, as an MCP client would", async () => {
        const { received } = await connect();
        await settle();

        store.setGoal("Set over MCP");
        await settle();

        const pushed = firstOfType(received, "state");
        expect(pushed!.state.goal.name).toBe("Set over MCP");
    });

    it("attributes a pushed change to whoever made it", async () => {
        const a = await connect();
        send(a.socket, { type: "hello", author: ana });
        const b = await connect();

        send(a.socket, { type: "command", id: "1", name: "goal", payload: { name: "Ship it" } });
        await settle();

        expect(firstOfType(b.received, "state")!.author).toEqual(ana);
    });

    it("coalesces a burst of changes into a single broadcast", async () => {
        const { received } = await connect();
        await settle();

        store.addIdea("one");
        store.addIdea("two");
        store.addIdea("three");
        await settle();

        const broadcasts = received.filter((message) => message.type === "state");
        expect(broadcasts).toHaveLength(1);
        expect((broadcasts[0] as any).state.inbox).toEqual(["three", "two", "one"]);
    });

    it("counts each connected browser", async () => {
        const a = await connect();
        send(a.socket, { type: "hello", author: ana });
        const b = await connect();
        send(b.socket, { type: "hello", author: ben });
        await settle();

        expect(realtime.connectedCount()).toBe(2);
    });

    it("counts one browser with two tabs open only once", async () => {
        const a = await connect();
        send(a.socket, { type: "hello", author: ana });
        const b = await connect();
        send(b.socket, { type: "hello", author: ana });
        await settle();

        expect(realtime.connectedCount()).toBe(1);
    });

    it("stops counting a browser once it disconnects", async () => {
        const a = await connect();
        send(a.socket, { type: "hello", author: ana });
        const b = await connect();
        send(b.socket, { type: "hello", author: ben });
        await settle();

        b.socket.close();
        await settle();

        expect(realtime.connectedCount()).toBe(1);
    });

    it("resends a snapshot on request", async () => {
        const { socket, received } = await connect();
        await settle();
        store.setGoal("Changed while away");
        await settle();

        send(socket, { type: "resync" });
        await settle();

        const snapshots = received.filter((message) => message.type === "snapshot");
        expect(snapshots).toHaveLength(2);
        expect((snapshots[1] as any).state.goal.name).toBe("Changed while away");
    });

    it("reports a refused write with the authoritative state to rebase onto", async () => {
        const { socket, received } = await connect();
        store.addIdea("theirs");
        await settle();

        send(socket, {
            type: "command",
            id: "1",
            name: "inbox/update",
            payload: { index: 0, text: "mine", expectedText: "something else" },
        });
        await settle();

        const error = firstOfType(received, "error");
        expect(error!.error.code).toBe("conflict");
        expect(error!.state.inbox).toEqual(["theirs"]);
    });

    it("refuses to let one person undo another's change", async () => {
        const a = await connect();
        send(a.socket, { type: "hello", author: ana });
        const b = await connect();
        send(b.socket, { type: "hello", author: ben });
        await settle();

        send(a.socket, { type: "command", id: "1", name: "goal", payload: { name: "Ana's goal" } });
        await settle();
        send(b.socket, { type: "command", id: "2", name: "undo", payload: {} });
        await settle();

        const error = firstOfType(b.received, "error");
        expect(error!.error.code).toBe("undo-blocked");
        expect(error!.error.message).toContain("Someone else has changed the project");
        expect(store.getState().goal.name).toBe("Ana's goal");
    });

    it("requires confirmation before switching everyone's project", async () => {
        const a = await connect();
        send(a.socket, { type: "hello", author: ana });
        const b = await connect();
        send(b.socket, { type: "hello", author: ben });
        await settle();

        send(b.socket, { type: "command", id: "1", name: "projects/new", payload: {} });
        await settle();

        const error = firstOfType(b.received, "error");
        expect(error!.error.code).toBe("confirm-required");
        expect(error!.error.otherCount).toBe(1);
    });

    it("tells everyone when somebody does switch project", async () => {
        const a = await connect();
        send(a.socket, { type: "hello", author: ana });
        const b = await connect();
        send(b.socket, { type: "hello", author: ben });
        await settle();
        project.restoreProject.mockResolvedValue({
            goal: { name: "Q3", id: GOAL_ID, completionState: false, plan: null as any },
            inbox: [],
        });

        send(b.socket, {
            type: "command",
            id: "1",
            name: "projects/restore",
            payload: { filename: "q3-roadmap", confirmed: true },
        });
        await settle();

        // The author rides along so Ben's own browser can tell it was his doing.
        const notice = firstOfType(a.received, "notice");
        expect(notice).toEqual({ type: "notice", kind: "project-switched", project: "q3-roadmap", author: ben });
    });

    it("ignores a malformed frame rather than dropping the connection", async () => {
        const { socket, received } = await connect();
        await settle();

        socket.send("not json at all");
        send(socket, { type: "command", id: "1", name: "goal", payload: { name: "Still working" } });
        await settle();

        expect(firstOfType(received, "result")).toBeDefined();
    });

    it("stops broadcasting once closed", async () => {
        const { received } = await connect();
        await settle();

        await realtime.close();
        store.setGoal("After close");
        await settle();

        expect(received.filter((message) => message.type === "state")).toHaveLength(0);
    });
});
