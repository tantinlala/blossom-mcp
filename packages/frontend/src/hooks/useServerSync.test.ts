import { renderHook, act } from "@testing-library/react";
import { useServerSync } from "./useServerSync";
import { PlanManager } from "../utils/PlanManager";
import { APIClient } from "../utils/APIClient";
import { GOAL_ID, ProjectState } from "@blossom/common";

jest.mock("../utils/PlanManager");
jest.mock("../utils/APIClient");

const makeState = (version: number, inbox: string[] = []): ProjectState => ({
    version,
    activeProject: null,
    goal: { name: "My Goal", id: GOAL_ID, completionState: false, plan: { tasksList: [], dependenciesList: [] } },
    inbox,
});

describe("useServerSync", () => {
    let mockedPlanManager: jest.Mocked<PlanManager>;
    let mockedAPIClient: jest.Mocked<APIClient>;
    let mockSetIdeaList: jest.Mock;
    let mockSyncRoadmap: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockedPlanManager = new PlanManager() as jest.Mocked<PlanManager>;
        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        mockSetIdeaList = jest.fn();
        mockSyncRoadmap = jest.fn();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const render = () =>
        renderHook(() => useServerSync({ apiClient: mockedAPIClient, planManager: mockedPlanManager }));

    // Advances past one poll interval and flushes the async poll chain.
    const advanceOnePoll = async () => {
        await act(async () => {
            jest.advanceTimersByTime(3000);
            for (let i = 0; i < 10; i++) {
                await Promise.resolve();
            }
        });
    };

    it("applyState updates the plan manager and the registered targets", () => {
        const state = makeState(5, ["idea 1", "idea 2"]);
        const { result } = render();

        act(() => {
            result.current.registerTargets({ setIdeaList: mockSetIdeaList, syncRoadmap: mockSyncRoadmap });
        });

        act(() => {
            result.current.applyState(state);
        });

        expect(mockedPlanManager.applyServerState).toHaveBeenCalledWith(state.goal);
        expect(mockSetIdeaList).toHaveBeenCalledWith(["idea 1", "idea 2"]);
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
            result.current.registerTargets({ setIdeaList: mockSetIdeaList, syncRoadmap: mockSyncRoadmap });
        });

        await advanceOnePoll();

        expect(mockedAPIClient.getState).toHaveBeenCalledTimes(1);
        expect(mockedPlanManager.applyServerState).toHaveBeenCalledWith(newState.goal);
        expect(mockSetIdeaList).toHaveBeenCalledWith(["from server"]);
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

    it("skips polling while editing is paused and resumes afterwards", async () => {
        mockedAPIClient.getStateVersion.mockResolvedValue(0);

        const { result } = render();

        act(() => {
            result.current.setEditingPaused(true);
        });

        await advanceOnePoll();
        expect(mockedAPIClient.getStateVersion).not.toHaveBeenCalled();

        act(() => {
            result.current.setEditingPaused(false);
        });

        await advanceOnePoll();
        expect(mockedAPIClient.getStateVersion).toHaveBeenCalledTimes(1);
    });

    it("stops polling on unmount", async () => {
        mockedAPIClient.getStateVersion.mockResolvedValue(0);

        const { unmount } = render();

        unmount();

        jest.advanceTimersByTime(9000);

        expect(mockedAPIClient.getStateVersion).not.toHaveBeenCalled();
    });
});
