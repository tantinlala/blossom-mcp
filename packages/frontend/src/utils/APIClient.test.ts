import axios from "axios";
import { GOAL_ID, ProjectState } from "@blossom/common";
import { APIClient } from "./APIClient";
import { CommandFailure, RealtimeClient } from "./RealtimeClient";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

const makeState = (version: number): ProjectState => ({
    version,
    activeProject: null,
    goal: { name: "Goal", id: GOAL_ID, completionState: false, plan: { tasksList: [], dependenciesList: [] } },
    inbox: [],
});

const createRealtime = (isOpen: boolean) =>
    ({
        isOpen: () => isOpen,
        send: jest.fn(),
        identify: jest.fn(),
    }) as unknown as jest.Mocked<RealtimeClient>;

describe("APIClient", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedAxios.defaults = { baseURL: "", headers: { common: {} } } as any;
    });

    describe("transport selection", () => {
        it("sends mutations over the socket when it is open", async () => {
            const realtime = createRealtime(true);
            (realtime.send as jest.Mock).mockResolvedValue(makeState(2));
            const client = new APIClient(realtime);

            const result = await client.addIdea("an idea");

            expect(realtime.send).toHaveBeenCalledWith("inbox/add", { text: "an idea" });
            expect(mockedAxios.post).not.toHaveBeenCalled();
            expect(result).toEqual(makeState(2));
        });

        it("falls back to HTTP when the socket is not open", async () => {
            const realtime = createRealtime(false);
            mockedAxios.post.mockResolvedValue({ data: { response: makeState(3) } });
            const client = new APIClient(realtime);

            const result = await client.addIdea("an idea");

            expect(realtime.send).not.toHaveBeenCalled();
            expect(mockedAxios.post).toHaveBeenCalledWith("/inbox/add", { text: "an idea" });
            expect(result).toEqual(makeState(3));
        });

        it("does not retry over HTTP after a socket failure", async () => {
            const realtime = createRealtime(true);
            (realtime.send as jest.Mock).mockRejectedValue(
                new CommandFailure({ code: "internal", message: "Connection lost" }),
            );
            const client = new APIClient(realtime);

            // These mutations are not idempotent: a retry could add the idea twice.
            const result = await client.addIdea("an idea");

            expect(result).toBeUndefined();
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });

        it("always reads over HTTP, even with the socket open", async () => {
            const realtime = createRealtime(true);
            mockedAxios.get.mockResolvedValue({ data: { response: makeState(1) } });
            const client = new APIClient(realtime);

            await client.getState();

            expect(mockedAxios.get).toHaveBeenCalledWith("/state");
        });
    });

    describe("failure reporting", () => {
        it("reports a failure and still returns undefined", async () => {
            mockedAxios.post.mockRejectedValue(new Error("Network Error"));
            const client = new APIClient();
            const failures: any[] = [];
            client.onRequestFailure((failure) => failures.push(failure));

            const result = await client.addIdea("an idea");

            expect(result).toBeUndefined();
            expect(failures).toHaveLength(1);
            expect(failures[0].code).toBe("network");
            expect(client.lastFailure()?.code).toBe("network");
        });

        it("carries the authoritative state back from a rejected write", async () => {
            const realtime = createRealtime(true);
            (realtime.send as jest.Mock).mockRejectedValue(
                new CommandFailure({ code: "conflict", message: "Someone got there first" }, makeState(8)),
            );
            const client = new APIClient(realtime);

            await client.updateIdea(0, "mine", "theirs");

            expect(client.lastFailure()).toMatchObject({ code: "conflict", state: makeState(8) });
        });

        it("recognises a refused write from an HTTP 409, keeping the server's explanation", async () => {
            mockedAxios.post.mockRejectedValue({
                response: {
                    status: 409,
                    data: { error: "Someone else has changed the project since your last change" },
                },
            });
            const client = new APIClient();

            await client.undo();

            expect(client.lastFailure()).toMatchObject({
                code: "conflict",
                message: "Someone else has changed the project since your last change",
            });
        });

        it("clears the last failure once something succeeds", async () => {
            mockedAxios.post.mockRejectedValueOnce(new Error("Network Error"));
            mockedAxios.post.mockResolvedValueOnce({ data: { response: makeState(2) } });
            const client = new APIClient();

            await client.addIdea("first");
            expect(client.lastFailure()).not.toBeNull();

            await client.addIdea("second");
            expect(client.lastFailure()).toBeNull();
        });
    });

    describe("commands that need confirming", () => {
        const refusal = {
            response: { status: 409, data: { error: "Somebody else is working on this project", otherCount: 1 } },
        };

        it("asks, then resends with confirmation when the person agrees", async () => {
            mockedAxios.post.mockRejectedValueOnce(refusal);
            mockedAxios.post.mockResolvedValueOnce({ data: { response: makeState(4) } });
            const client = new APIClient();
            const confirm = jest.fn().mockResolvedValue(true);
            client.setConfirmHandler(confirm);

            const result = await client.restoreProject("q3-roadmap");

            expect(confirm).toHaveBeenCalledWith(1);
            expect(mockedAxios.post).toHaveBeenLastCalledWith("/projects/restore", {
                filename: "q3-roadmap",
                confirmed: true,
            });
            expect(result).toEqual(makeState(4));
        });

        it("does nothing when the person declines", async () => {
            mockedAxios.post.mockRejectedValue(refusal);
            const client = new APIClient();
            client.setConfirmHandler(jest.fn().mockResolvedValue(false));

            const result = await client.restoreProject("q3-roadmap");

            expect(result).toBeUndefined();
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        });
    });

    it("labels writes with the browser that made them", () => {
        const realtime = createRealtime(true);
        const client = new APIClient(realtime);
        const author = { id: "ana", kind: "person" as const };

        client.setAuthor(author);

        expect(mockedAxios.defaults.headers.common["X-Blossom-Author"]).toBe(JSON.stringify(author));
        expect(realtime.identify).toHaveBeenCalledWith(author);
    });
});
