import axios from "axios";
import { GOAL_ID, ProjectState } from "@blossom/common";
import { APIClient } from "./APIClient";
import { CommandFailure, RealtimeClient } from "./RealtimeClient";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

const makeState = (version: number, key = "Trip"): ProjectState => ({
    version,
    key,
    savedToDisk: true,
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

            const result = await client.addIdea("Trip", "an idea");

            expect(realtime.send).toHaveBeenCalledWith("inbox/add", { projectKey: "Trip", text: "an idea" });
            expect(mockedAxios.post).not.toHaveBeenCalled();
            expect(result).toEqual(makeState(2));
        });

        it("falls back to HTTP when the socket is not open", async () => {
            const realtime = createRealtime(false);
            mockedAxios.post.mockResolvedValue({ data: { response: makeState(3) } });
            const client = new APIClient(realtime);

            const result = await client.addIdea("Trip", "an idea");

            expect(realtime.send).not.toHaveBeenCalled();
            expect(mockedAxios.post).toHaveBeenCalledWith("/inbox/add", { projectKey: "Trip", text: "an idea" });
            expect(result).toEqual(makeState(3));
        });

        it("does not retry over HTTP after a socket failure", async () => {
            const realtime = createRealtime(true);
            (realtime.send as jest.Mock).mockRejectedValue(
                new CommandFailure({ code: "internal", message: "Connection lost" }),
            );
            const client = new APIClient(realtime);

            // These mutations are not idempotent: a retry could add the idea twice.
            const result = await client.addIdea("Trip", "an idea");

            expect(result).toBeUndefined();
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });

        it("always reads over HTTP, even with the socket open", async () => {
            const realtime = createRealtime(true);
            mockedAxios.get.mockResolvedValue({
                data: { response: { projects: [makeState(1)], assistantProject: null } },
            });
            const client = new APIClient(realtime);

            await client.getView(["Trip"]);

            expect(mockedAxios.get).toHaveBeenCalledWith("/view?projects=Trip");
        });

        it("names every project a board read asks about", async () => {
            mockedAxios.get.mockResolvedValue({
                data: { response: { projects: [], assistantProject: null } },
            });
            const client = new APIClient();

            await client.getView(["Trip", "House"]);

            expect(mockedAxios.get).toHaveBeenCalledWith("/view?projects=Trip%2CHouse");
        });

        it("reads each project's version for the poll that runs while the socket is down", async () => {
            mockedAxios.get.mockResolvedValue({ data: { response: { versions: { Trip: 4 } } } });
            const client = new APIClient();

            const versions = await client.getViewVersions(["Trip"]);

            expect(mockedAxios.get).toHaveBeenCalledWith("/view/versions?projects=Trip");
            expect(versions).toEqual({ Trip: 4 });
        });
    });

    describe("failure reporting", () => {
        it("reports a failure and still returns undefined", async () => {
            mockedAxios.post.mockRejectedValue(new Error("Network Error"));
            const client = new APIClient();
            const failures: any[] = [];
            client.onRequestFailure((failure) => failures.push(failure));

            const result = await client.addIdea("Trip", "an idea");

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

            await client.updateIdea("Trip", "idea-1", "mine", "theirs");

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

            await client.undo("Trip");

            expect(client.lastFailure()).toMatchObject({
                code: "conflict",
                message: "Someone else has changed the project since your last change",
            });
        });

        it("uses the code the server sent rather than guessing from the status", async () => {
            mockedAxios.post.mockRejectedValue({
                response: {
                    status: 409,
                    data: {
                        error: "Someone else has changed the project since your last change",
                        code: "undo-blocked",
                    },
                },
            });
            const client = new APIClient();

            await client.undo("Trip");

            // Several distinct failures share a 409, so the status alone would
            // collapse this into a plain conflict.
            expect(client.lastFailure()?.code).toBe("undo-blocked");
        });

        it("falls back to the status when the body carries no code", async () => {
            mockedAxios.post.mockRejectedValue({
                response: { status: 404, data: { error: "Task not found: abc" } },
            });
            const client = new APIClient();

            await client.removeTask("Trip", "abc");

            expect(client.lastFailure()?.code).toBe("not-found");
        });

        it("clears the last failure once something succeeds", async () => {
            mockedAxios.post.mockRejectedValueOnce(new Error("Network Error"));
            mockedAxios.post.mockResolvedValueOnce({ data: { response: makeState(2) } });
            const client = new APIClient();

            await client.addIdea("Trip", "first");
            expect(client.lastFailure()).not.toBeNull();

            await client.addIdea("Trip", "second");
            expect(client.lastFailure()).toBeNull();
        });
    });

    describe("project housekeeping", () => {
        it("opens a saved project without disturbing anybody else", async () => {
            mockedAxios.post.mockResolvedValue({ data: { response: makeState(4, "q3-roadmap") } });
            const client = new APIClient();

            const result = await client.openProject("q3-roadmap");

            expect(mockedAxios.post).toHaveBeenCalledWith("/projects/open", { filename: "q3-roadmap" });
            expect(result).toEqual(makeState(4, "q3-roadmap"));
        });

        it("starts a new project with nothing to say about it", async () => {
            mockedAxios.post.mockResolvedValue({ data: { response: makeState(1, "Untitled") } });
            const client = new APIClient();

            const result = await client.newProject();

            expect(mockedAxios.post).toHaveBeenCalledWith("/projects/new", undefined);
            expect(result).toEqual(makeState(1, "Untitled"));
        });

        it("names both the project it is saving and the filename to write", async () => {
            mockedAxios.post.mockResolvedValue({
                data: { response: { projects: ["q3-roadmap"], state: makeState(5, "q3-roadmap") } },
            });
            const client = new APIClient();

            const result = await client.saveProject("Untitled", "q3-roadmap");

            expect(mockedAxios.post).toHaveBeenCalledWith("/projects/save", {
                projectKey: "Untitled",
                filename: "q3-roadmap",
            });
            expect(result!.state.key).toBe("q3-roadmap");
        });

        it("re-reads one project from disk", async () => {
            mockedAxios.post.mockResolvedValue({ data: { response: makeState(6) } });
            const client = new APIClient();

            await client.reloadProject("Trip");

            expect(mockedAxios.post).toHaveBeenCalledWith("/projects/reload", { projectKey: "Trip" });
        });

        it("chooses which project the assistant works on", async () => {
            mockedAxios.post.mockResolvedValue({ data: { response: { assistantProject: "Trip" } } });
            const client = new APIClient();

            const chosen = await client.setAssistantProject("Trip");

            expect(mockedAxios.post).toHaveBeenCalledWith("/assistant/target", { projectKey: "Trip" });
            expect(chosen).toBe("Trip");
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
