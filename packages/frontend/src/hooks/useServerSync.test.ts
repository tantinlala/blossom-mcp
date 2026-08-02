import { renderHook, act } from "@testing-library/react";
import { useServerSync } from "./useServerSync";
import { PlanManager } from "../utils/PlanManager";
import { APIClient, RequestFailure } from "../utils/APIClient";
import { ConnectionState, Notice, RealtimeClient, StateUpdate } from "../utils/RealtimeClient";
import { GOAL_ID, ProjectState } from "@blossom/common";

jest.mock("../utils/PlanManager");
jest.mock("../utils/APIClient");

const makeState = (version: number, inbox: string[] = []): ProjectState => ({
    version,
    activeProject: null,
    goal: { name: "My Goal", id: GOAL_ID, completionState: false, plan: { tasksList: [], dependenciesList: [] } },
    inbox,
});

/**
 * Stands in for the socket: the hook only ever talks to it through these
 * subscriptions, so driving them directly is enough to simulate the server
 * pushing anything it likes.
 */
const createMockRealtime = () => {
    const listeners = {
        state: [] as ((update: StateUpdate) => void)[],
        connection: [] as ((state: ConnectionState) => void)[],
        notice: [] as ((notice: Notice) => void)[],
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
            onConnectionChange: (listener: (state: ConnectionState) => void) => {
                listeners.connection.push(listener);
                return () => {};
            },
            onNotice: (listener: (notice: Notice) => void) => {
                listeners.notice.push(listener);
                return () => {};
            },
        } as unknown as RealtimeClient,
    };
};

describe("useServerSync", () => {
    let mockedPlanManager: jest.Mocked<PlanManager>;
    let mockedAPIClient: jest.Mocked<APIClient>;
    let mockApplyRemoteInbox: jest.Mock;
    let mockApplyActiveProject: jest.Mock;
    let mockSyncRoadmap: jest.Mock;
    let mockNotify: jest.Mock;
    let realtime: ReturnType<typeof createMockRealtime>;
    let failureListeners: ((failure: RequestFailure) => void)[];

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockedPlanManager = new PlanManager() as jest.Mocked<PlanManager>;
        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        failureListeners = [];
        mockedAPIClient.onRequestFailure.mockImplementation((listener) => {
            failureListeners.push(listener);
            return () => {};
        });
        mockApplyRemoteInbox = jest.fn();
        mockApplyActiveProject = jest.fn();
        mockSyncRoadmap = jest.fn();
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
                planManager: mockedPlanManager,
                realtime: realtime.client,
                notify: mockNotify,
            }),
        );

    const pushState = (update: Partial<StateUpdate> & { state: ProjectState }) =>
        act(() => {
            realtime.listeners.state.forEach((listener) => listener({ isSnapshot: false, ...update }));
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

    describe("save state", () => {
        it("reports a project with no file behind it as never saved", () => {
            const { result } = render();

            expect(result.current.saveState).toBe("neverSaved");
        });

        it("reports saved once the current version has been written to disk", () => {
            const { result } = render();

            act(() => result.current.applyState(makeState(5)));
            act(() => result.current.markSaved());

            expect(result.current.saveState).toBe("saved");
        });

        it("reports unsaved as soon as the version moves past the saved one", () => {
            const { result } = render();

            act(() => result.current.applyState(makeState(5)));
            act(() => result.current.markSaved());
            act(() => result.current.applyState(makeState(6)));

            expect(result.current.saveState).toBe("unsaved");
        });

        it("notices a change pushed by another writer, not just local edits", () => {
            const { result } = render();
            act(() => result.current.applyState(makeState(5)));
            act(() => result.current.markSaved());
            expect(result.current.saveState).toBe("saved");

            pushState({ state: makeState(9) });

            expect(result.current.saveState).toBe("unsaved");
        });

        it("goes back to never saved when a new project is started", () => {
            const { result } = render();

            act(() => result.current.applyState(makeState(5)));
            act(() => result.current.markSaved());
            act(() => result.current.markNeverSaved());

            expect(result.current.saveState).toBe("neverSaved");
        });
    });

    it("applyState updates the plan manager and the registered targets", () => {
        const state = makeState(5, ["idea 1", "idea 2"]);
        const { result } = render();

        act(() => {
            result.current.registerTargets({
                applyRemoteInbox: mockApplyRemoteInbox,
                applyActiveProject: mockApplyActiveProject,
                syncRoadmap: mockSyncRoadmap,
            });
        });

        act(() => {
            result.current.applyState(state);
        });

        expect(mockedPlanManager.applyServerState).toHaveBeenCalledWith(state.goal);
        expect(mockApplyRemoteInbox).toHaveBeenCalledWith(["idea 1", "idea 2"]);
        expect(mockApplyActiveProject).toHaveBeenCalledWith(null);
        expect(mockSyncRoadmap).toHaveBeenCalled();
    });

    it("applyState does not throw before targets are registered", () => {
        const { result } = render();

        expect(() => {
            act(() => {
                result.current.applyState(makeState(1));
            });
        }).not.toThrow();
        expect(mockedPlanManager.applyServerState).toHaveBeenCalled();
    });

    describe("pushed updates", () => {
        it("applies a pushed change from another writer", () => {
            const { result } = render();
            act(() => {
                result.current.registerTargets({
                    applyRemoteInbox: mockApplyRemoteInbox,
                    applyActiveProject: mockApplyActiveProject,
                    syncRoadmap: mockSyncRoadmap,
                });
            });

            pushState({ state: makeState(7, ["from someone else"]) });

            expect(mockedPlanManager.applyServerState).toHaveBeenCalled();
            expect(mockApplyRemoteInbox).toHaveBeenCalledWith(["from someone else"]);
            expect(mockSyncRoadmap).toHaveBeenCalled();
        });

        it("ignores an update at or below the version already held", () => {
            const { result } = render();
            act(() => result.current.applyState(makeState(7)));
            mockedPlanManager.applyServerState.mockClear();

            pushState({ state: makeState(7) });
            pushState({ state: makeState(6) });

            expect(mockedPlanManager.applyServerState).not.toHaveBeenCalled();
        });

        it("applies a snapshot even when its version is not ahead", () => {
            const { result } = render();
            act(() => result.current.applyState(makeState(7)));
            mockedPlanManager.applyServerState.mockClear();

            pushState({ state: makeState(3), isSnapshot: true });

            expect(mockedPlanManager.applyServerState).toHaveBeenCalled();
        });

        it("applies an update from a restarted server whose version went backwards", () => {
            const { result } = render();
            pushState({ state: makeState(7), isSnapshot: true, serverId: "server-a" });
            act(() => result.current.applyState(makeState(7)));
            mockedPlanManager.applyServerState.mockClear();

            // A fresh process starts counting from 1 again.
            pushState({ state: makeState(2), serverId: "server-b" });

            expect(mockedPlanManager.applyServerState).toHaveBeenCalled();
        });

        it("surfaces a project switch made by somebody else", () => {
            render();

            act(() => {
                realtime.listeners.notice.forEach((listener) =>
                    listener({ kind: "project-switched", project: "q3-roadmap" }),
                );
            });

            expect(mockNotify).toHaveBeenCalledWith("Somebody switched everyone to q3-roadmap");
        });

        it("treats a project somebody else opened as matching disk", () => {
            const { result } = render();
            act(() => result.current.applyState(makeState(4)));
            act(() => result.current.markSaved());
            pushState({ state: makeState(12) });
            expect(result.current.saveState).toBe("unsaved");

            act(() => {
                realtime.listeners.notice.forEach((listener) =>
                    listener({ kind: "project-switched", project: "q3-roadmap" }),
                );
            });

            expect(result.current.saveState).toBe("saved");
        });

        it("treats a new project somebody else started as having no file behind it", () => {
            const { result } = render();
            pushState({ state: makeState(12) });

            act(() => {
                realtime.listeners.notice.forEach((listener) => listener({ kind: "project-switched", project: null }));
            });

            expect(result.current.saveState).toBe("neverSaved");
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
            act(() => result.current.applyState(makeState(9)));
            mockedPlanManager.applyServerState.mockClear();

            act(() => {
                failureListeners.forEach((listener) =>
                    listener({ code: "conflict", message: "Someone got there first", state: makeState(4) }),
                );
            });

            expect(mockedPlanManager.applyServerState).toHaveBeenCalled();
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

        it("does not refetch state when the polled version is unchanged", async () => {
            const { result } = render();

            act(() => {
                result.current.applyState(makeState(5));
            });

            mockedAPIClient.getStateVersion.mockResolvedValue(5);

            await advanceOnePoll();

            expect(mockedAPIClient.getStateVersion).toHaveBeenCalledTimes(1);
            expect(mockedAPIClient.getState).not.toHaveBeenCalled();
        });

        it("refetches and applies state when the polled version moved", async () => {
            const newState = makeState(7, ["from server"]);
            mockedAPIClient.getStateVersion.mockResolvedValue(7);
            mockedAPIClient.getState.mockResolvedValue(newState);

            const { result } = render();

            act(() => {
                result.current.registerTargets({
                    applyRemoteInbox: mockApplyRemoteInbox,
                    applyActiveProject: mockApplyActiveProject,
                    syncRoadmap: mockSyncRoadmap,
                });
            });

            await advanceOnePoll();

            expect(mockedAPIClient.getState).toHaveBeenCalledTimes(1);
            expect(mockedPlanManager.applyServerState).toHaveBeenCalledWith(newState.goal);
            expect(mockApplyRemoteInbox).toHaveBeenCalledWith(["from server"]);
            expect(mockSyncRoadmap).toHaveBeenCalled();
        });

        it("records the fetched version so the next poll does not refetch", async () => {
            mockedAPIClient.getStateVersion.mockResolvedValue(7);
            mockedAPIClient.getState.mockResolvedValue(makeState(7));

            render();

            await advanceOnePoll();
            expect(mockedAPIClient.getState).toHaveBeenCalledTimes(1);

            await advanceOnePoll();

            expect(mockedAPIClient.getStateVersion).toHaveBeenCalledTimes(2);
            expect(mockedAPIClient.getState).toHaveBeenCalledTimes(1);
        });

        it("does not apply anything when the state refetch fails", async () => {
            mockedAPIClient.getStateVersion.mockResolvedValue(7);
            mockedAPIClient.getState.mockResolvedValue(undefined);

            render();

            await advanceOnePoll();

            expect(mockedAPIClient.getState).toHaveBeenCalledTimes(1);
            expect(mockedPlanManager.applyServerState).not.toHaveBeenCalled();
        });

        it("stops polling on unmount", async () => {
            mockedAPIClient.getStateVersion.mockResolvedValue(0);

            const { unmount } = render();

            unmount();

            jest.advanceTimersByTime(30000);

            expect(mockedAPIClient.getStateVersion).not.toHaveBeenCalled();
        });
    });

    it("does not poll while the socket is open", async () => {
        mockedAPIClient.getStateVersion.mockResolvedValue(0);

        render();

        await advanceOnePoll();

        expect(mockedAPIClient.getStateVersion).not.toHaveBeenCalled();
    });
});
