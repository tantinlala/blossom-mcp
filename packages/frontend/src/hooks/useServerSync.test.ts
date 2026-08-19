import { renderHook, act } from "@testing-library/react";
import { useServerSync } from "./useServerSync";
import { WorkspaceManager } from "../utils/WorkspaceManager";
import { APIClient, RequestFailure } from "../utils/APIClient";
import { ConnectionState, Notice, RealtimeClient, StateUpdate, ViewUpdate } from "../utils/RealtimeClient";
import { GOAL_ID, ProjectState, ViewState } from "@blossom/common";

jest.mock("../utils/APIClient");

const makeState = (version: number, options: { key?: string; savedToDisk?: boolean; inbox?: string[] } = {}) => {
    const { key = "Trip", savedToDisk = true, inbox = [] } = options;
    const state: ProjectState = {
        version,
        key,
        savedToDisk,
        goal: { name: "My Goal", id: GOAL_ID, completionState: false, plan: { tasksList: [], dependenciesList: [] } },
        inbox: inbox.map((text, position) => ({ id: `idea-${position}`, text })),
    };
    return state;
};

const makeView = (projects: ProjectState[], assistantProject: string | null = null): ViewState => ({
    projects,
    assistantProject,
});

/**
 * Stands in for the socket: the hook only ever talks to it through these
 * subscriptions, so driving them directly is enough to simulate the server
 * pushing anything it likes.
 */
const createMockRealtime = () => {
    const listeners = {
        state: [] as ((update: StateUpdate) => void)[],
        view: [] as ((update: ViewUpdate) => void)[],
        connection: [] as ((state: ConnectionState) => void)[],
        notice: [] as ((notice: Notice) => void)[],
        protocolMismatch: [] as (() => void)[],
    };
    let connectionState: ConnectionState = "open";

    return {
        listeners,
        setInitialConnectionState: (state: ConnectionState) => {
            connectionState = state;
        },
        client: {
            getConnectionState: () => connectionState,
            onState: (listener: (update: StateUpdate) => void) => {
                listeners.state.push(listener);
                return () => {};
            },
            onView: (listener: (update: ViewUpdate) => void) => {
                listeners.view.push(listener);
                return () => {};
            },
            onConnectionChange: (listener: (state: ConnectionState) => void) => {
                listeners.connection.push(listener);
                return () => {};
            },
            onNotice: (listener: (notice: Notice) => void) => {
                listeners.notice.push(listener);
                return () => {};
            },
            onProtocolMismatch: (listener: () => void) => {
                listeners.protocolMismatch.push(listener);
                return () => {};
            },
        } as unknown as RealtimeClient,
    };
};

describe("useServerSync", () => {
    let workspace: WorkspaceManager;
    let mockedAPIClient: jest.Mocked<APIClient>;
    let mockApplyInboxView: jest.Mock;
    let mockApplyRemoteInbox: jest.Mock;
    let mockSyncBoard: jest.Mock;
    let mockApplyAssistantProject: jest.Mock;
    let mockNotify: jest.Mock;
    let realtime: ReturnType<typeof createMockRealtime>;
    let failureListeners: ((failure: RequestFailure) => void)[];

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        // The real view-model: it holds no React state and does no I/O, and the
        // hook's whole job is keeping it in step with the server.
        workspace = new WorkspaceManager();
        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        failureListeners = [];
        mockedAPIClient.onRequestFailure.mockImplementation((listener) => {
            failureListeners.push(listener);
            return () => {};
        });
        mockApplyInboxView = jest.fn();
        mockApplyRemoteInbox = jest.fn();
        mockSyncBoard = jest.fn();
        mockApplyAssistantProject = jest.fn();
        mockNotify = jest.fn();
        realtime = createMockRealtime();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const render = () =>
        renderHook(() =>
            useServerSync({
                apiClient: mockedAPIClient,
                workspace,
                realtime: realtime.client,
                notify: mockNotify,
            }),
        );

    const registerTargets = (result: { current: ReturnType<typeof useServerSync> }) =>
        act(() => {
            result.current.registerTargets({
                applyInboxView: mockApplyInboxView,
                applyRemoteInbox: mockApplyRemoteInbox,
                syncBoard: mockSyncBoard,
                applyAssistantProject: mockApplyAssistantProject,
            });
        });

    const pushState = (update: Partial<StateUpdate> & { state: ProjectState }) =>
        act(() => {
            realtime.listeners.state.forEach((listener) => listener(update as StateUpdate));
        });

    const pushView = (view: ViewState, serverId = "server-a") =>
        act(() => {
            realtime.listeners.view.forEach((listener) => listener({ view, serverId }));
        });

    const pushNotice = (notice: Notice) =>
        act(() => {
            realtime.listeners.notice.forEach((listener) => listener(notice));
        });

    // Advances past one degraded-poll interval and flushes the async poll chain.
    const advanceOnePoll = async () => {
        await act(async () => {
            jest.advanceTimersByTime(10000);
            for (let i = 0; i < 10; i++) {
                await Promise.resolve();
            }
        });
    };

    describe("the board", () => {
        it("puts the projects the server reports onto the board", () => {
            const { result } = render();
            registerTargets(result);
            const view = makeView([makeState(5), makeState(3, { key: "House" })]);

            act(() => result.current.applyView(view));

            expect(workspace.keys).toEqual(["Trip", "House"]);
            expect(mockApplyInboxView).toHaveBeenCalledWith(view);
            expect(mockApplyAssistantProject).toHaveBeenCalledWith(null);
            expect(mockSyncBoard).toHaveBeenCalled();
        });

        it("applies one project's change without disturbing the others", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(5), makeState(3, { key: "House" })])));
            mockApplyRemoteInbox.mockClear();

            act(() => result.current.applyProject(makeState(6, { key: "House", inbox: ["from someone else"] })));

            expect(mockApplyRemoteInbox).toHaveBeenCalledTimes(1);
            expect(mockApplyRemoteInbox).toHaveBeenCalledWith("House", [{ id: "idea-0", text: "from someone else" }]);
        });

        it("leaves a project this session is not looking at alone", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(5)])));
            mockApplyRemoteInbox.mockClear();

            act(() => result.current.applyProject(makeState(2, { key: "SomebodyElsesProject" })));

            expect(workspace.keys).toEqual(["Trip"]);
            expect(mockApplyRemoteInbox).not.toHaveBeenCalled();
        });

        it("puts a newly opened project onto the board", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(5)])));

            act(() => result.current.addProject(makeState(1, { key: "House", savedToDisk: false })));

            expect(workspace.keys).toEqual(["Trip", "House"]);
        });

        it("takes a project off the board", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(5), makeState(3, { key: "House" })])));

            act(() => result.current.removeProject("Trip"));

            expect(workspace.keys).toEqual(["House"]);
        });

        it("does not throw before targets are registered", () => {
            const { result } = render();

            expect(() => {
                act(() => result.current.applyView(makeView([makeState(1)])));
            }).not.toThrow();
            expect(workspace.keys).toEqual(["Trip"]);
        });
    });

    describe("save state", () => {
        it("reports a project with no file behind it as never saved", () => {
            const { result } = render();
            act(() => result.current.applyView(makeView([makeState(5, { savedToDisk: false })])));

            expect(result.current.saveStateOf("Trip")).toBe("neverSaved");
        });

        it("reports an empty board as never saved, since nothing is on it to save", () => {
            const { result } = render();

            expect(result.current.saveStateOf(null)).toBe("neverSaved");
        });

        it("reports saved once the current version has been written to disk", () => {
            const { result } = render();

            act(() => result.current.applyView(makeView([makeState(5)])));
            act(() => result.current.markSaved("Trip"));

            expect(result.current.saveStateOf("Trip")).toBe("saved");
        });

        it("reports unsaved as soon as the version moves past the saved one", () => {
            const { result } = render();

            act(() => result.current.applyView(makeView([makeState(5)])));
            act(() => result.current.markSaved("Trip"));
            act(() => result.current.applyProject(makeState(6)));

            expect(result.current.saveStateOf("Trip")).toBe("unsaved");
        });

        it("notices a change pushed by another writer, not just local edits", () => {
            const { result } = render();
            act(() => result.current.applyView(makeView([makeState(5)])));
            act(() => result.current.markSaved("Trip"));
            expect(result.current.saveStateOf("Trip")).toBe("saved");

            pushState({ state: makeState(9) });

            expect(result.current.saveStateOf("Trip")).toBe("unsaved");
        });

        it("tracks each project on the board separately", () => {
            const { result } = render();
            act(() => result.current.applyView(makeView([makeState(5), makeState(3, { key: "House" })])));
            act(() => result.current.markSaved("Trip"));
            act(() => result.current.markSaved("House"));

            act(() => result.current.applyProject(makeState(6)));

            expect(result.current.saveStateOf("Trip")).toBe("unsaved");
            expect(result.current.saveStateOf("House")).toBe("saved");
        });
    });

    describe("pushed updates", () => {
        it("applies a pushed change from another writer", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(5)])));

            pushState({ state: makeState(7, { inbox: ["from someone else"] }) });

            expect(mockApplyRemoteInbox).toHaveBeenCalledWith("Trip", [{ id: "idea-0", text: "from someone else" }]);
            expect(mockSyncBoard).toHaveBeenCalled();
        });

        it("ignores an update at or below the version already held", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(7)])));
            mockApplyRemoteInbox.mockClear();

            pushState({ state: makeState(7) });
            pushState({ state: makeState(6) });

            expect(mockApplyRemoteInbox).not.toHaveBeenCalled();
        });

        it("guards each project on its own version, since each counts its own changes", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(7), makeState(2, { key: "House" })])));
            mockApplyRemoteInbox.mockClear();

            // Behind for Trip, ahead for House.
            pushState({ state: makeState(4, { key: "House" }) });

            expect(mockApplyRemoteInbox).toHaveBeenCalledWith("House", []);
        });

        it("applies the whole board even when its versions are not ahead", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(7)])));
            mockApplyInboxView.mockClear();

            pushView(makeView([makeState(3)]));

            expect(mockApplyInboxView).toHaveBeenCalled();
        });

        it("applies an update from a restarted server whose version went backwards", () => {
            const { result } = render();
            registerTargets(result);
            pushView(makeView([makeState(7)]), "server-a");
            mockApplyRemoteInbox.mockClear();

            // A fresh process starts counting from 1 again.
            pushState({ state: makeState(2), serverId: "server-b" });

            expect(mockApplyRemoteInbox).toHaveBeenCalled();
        });

        it("follows a project that answers to a new key", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(5, { key: "Untitled", savedToDisk: false })])));
            act(() => result.current.markSaved("Untitled"));

            pushNotice({ kind: "project-renamed", from: "Untitled", to: "q3-roadmap", byThisBrowser: true });

            expect(workspace.keys).toEqual(["q3-roadmap"]);
            expect(mockSyncBoard).toHaveBeenCalled();
        });

        it("says nothing about a save this browser asked for", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(5, { key: "Untitled" })])));

            pushNotice({ kind: "project-renamed", from: "Untitled", to: "q3-roadmap", byThisBrowser: true });

            expect(mockNotify).not.toHaveBeenCalled();
            expect(result.current.saveStateOf("q3-roadmap")).toBe("saved");
        });

        it("says when somebody else saved a project this session is looking at", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(5, { key: "Untitled" })])));

            pushNotice({ kind: "project-renamed", from: "Untitled", to: "q3-roadmap", byThisBrowser: false });

            expect(mockNotify).toHaveBeenCalledWith("Untitled was saved as q3-roadmap");
        });

        it("follows which project the assistant works on", () => {
            const { result } = render();
            registerTargets(result);

            pushNotice({ kind: "assistant-target", project: "House", byThisBrowser: false });

            expect(mockApplyAssistantProject).toHaveBeenCalledWith("House");
        });

        it("asks the user to reload when the server speaks another protocol", () => {
            render();

            act(() => {
                realtime.listeners.protocolMismatch.forEach((listener) => listener());
            });

            expect(mockNotify).toHaveBeenCalledWith(
                "This page is out of date and has stopped syncing. Reload to continue.",
            );
        });

        it("tracks connection state", () => {
            const { result } = render();

            act(() => {
                realtime.listeners.connection.forEach((listener) => listener("offline"));
            });

            expect(result.current.connectionState).toBe("offline");
        });
    });

    describe("rejected writes", () => {
        it("adopts the authoritative state the server sent back", () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(9)])));
            mockApplyRemoteInbox.mockClear();

            act(() => {
                failureListeners.forEach((listener) =>
                    listener({ code: "conflict", message: "Someone got there first", state: makeState(4) }),
                );
            });

            expect(mockApplyRemoteInbox).toHaveBeenCalled();
            expect(mockNotify).toHaveBeenCalledWith("Someone got there first");
        });

        it("explains a blocked undo without reverting anything", () => {
            render();

            act(() => {
                failureListeners.forEach((listener) =>
                    listener({ code: "undo-blocked", message: "Someone else has changed the project" }),
                );
            });

            expect(mockNotify).toHaveBeenCalledWith("Someone else has changed the project");
        });

        it("stays quiet about ordinary network failures", () => {
            render();

            act(() => {
                failureListeners.forEach((listener) => listener({ code: "network", message: "Network Error" }));
            });

            expect(mockNotify).not.toHaveBeenCalled();
        });
    });

    describe("degraded polling while disconnected", () => {
        beforeEach(() => {
            realtime.setInitialConnectionState("offline");
        });

        it("does not read the board when every polled version is unchanged", async () => {
            const { result } = render();
            act(() => result.current.applyView(makeView([makeState(5)])));
            mockedAPIClient.getViewVersions.mockResolvedValue({ Trip: 5 });

            await advanceOnePoll();

            expect(mockedAPIClient.getViewVersions).toHaveBeenCalledWith(["Trip"]);
            expect(mockedAPIClient.getView).not.toHaveBeenCalled();
        });

        it("reads and applies the board when any project's version moved", async () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(5), makeState(2, { key: "House" })])));
            mockApplyInboxView.mockClear();
            mockedAPIClient.getViewVersions.mockResolvedValue({ Trip: 5, House: 4 });
            const fresh = makeView([makeState(5), makeState(4, { key: "House", inbox: ["from server"] })]);
            mockedAPIClient.getView.mockResolvedValue(fresh);

            await advanceOnePoll();

            expect(mockedAPIClient.getView).toHaveBeenCalledWith(["Trip", "House"]);
            expect(mockApplyInboxView).toHaveBeenCalledWith(fresh);
            expect(mockSyncBoard).toHaveBeenCalled();
        });

        it("records the versions it read, so the next poll does not read again", async () => {
            const { result } = render();
            act(() => result.current.applyView(makeView([makeState(5)])));
            mockedAPIClient.getViewVersions.mockResolvedValue({ Trip: 7 });
            mockedAPIClient.getView.mockResolvedValue(makeView([makeState(7)]));

            await advanceOnePoll();
            expect(mockedAPIClient.getView).toHaveBeenCalledTimes(1);

            await advanceOnePoll();

            expect(mockedAPIClient.getViewVersions).toHaveBeenCalledTimes(2);
            expect(mockedAPIClient.getView).toHaveBeenCalledTimes(1);
        });

        it("does not apply anything when reading the board fails", async () => {
            const { result } = render();
            registerTargets(result);
            act(() => result.current.applyView(makeView([makeState(5)])));
            mockApplyInboxView.mockClear();
            mockedAPIClient.getViewVersions.mockResolvedValue({ Trip: 7 });
            mockedAPIClient.getView.mockResolvedValue(undefined);

            await advanceOnePoll();

            expect(mockedAPIClient.getView).toHaveBeenCalledTimes(1);
            expect(mockApplyInboxView).not.toHaveBeenCalled();
        });

        it("asks nothing while the board is empty", async () => {
            render();

            await advanceOnePoll();

            expect(mockedAPIClient.getViewVersions).not.toHaveBeenCalled();
        });

        it("stops polling on unmount", async () => {
            const { result, unmount } = render();
            act(() => result.current.applyView(makeView([makeState(5)])));
            mockedAPIClient.getViewVersions.mockResolvedValue({ Trip: 5 });

            unmount();

            jest.advanceTimersByTime(30000);

            expect(mockedAPIClient.getViewVersions).not.toHaveBeenCalled();
        });
    });

    it("does not poll while the socket is open", async () => {
        const { result } = render();
        act(() => result.current.applyView(makeView([makeState(5)])));
        mockedAPIClient.getViewVersions.mockResolvedValue({ Trip: 5 });

        await advanceOnePoll();

        expect(mockedAPIClient.getViewVersions).not.toHaveBeenCalled();
    });
});
