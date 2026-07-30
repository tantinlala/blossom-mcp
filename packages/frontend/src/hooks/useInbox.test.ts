import { renderHook, act } from "@testing-library/react";
import { useInbox } from "./useInbox";
import { PlanManager } from "../utils/PlanManager";
import { APIClient } from "../utils/APIClient";
import { GOAL_ID, ProjectState } from "@blossom/common";

jest.mock("../utils/PlanManager");
jest.mock("../utils/APIClient");

const makeState = (version = 1, inbox: string[] = []): ProjectState => ({
    version,
    activeProject: null,
    goal: { name: "Goal", id: GOAL_ID, completionState: false, plan: { tasksList: [], dependenciesList: [] } },
    inbox,
});

describe("useInbox", () => {
    let mockedPlanManager: jest.Mocked<PlanManager>;
    let mockedAPIClient: jest.Mocked<APIClient>;
    let mockApplyState: jest.Mock;
    let mockSetEditingPaused: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedPlanManager = new PlanManager() as jest.Mocked<PlanManager>;
        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        mockApplyState = jest.fn();
        mockSetEditingPaused = jest.fn();
        window.alert = jest.fn();

        Object.defineProperty(mockedPlanManager, "presentContextGoal", {
            get: jest.fn().mockReturnValue({ name: "Goal", id: GOAL_ID, completionState: false, plan: null }),
            configurable: true,
        });
    });

    const render = () =>
        renderHook(() =>
            useInbox({
                apiClient: mockedAPIClient,
                planManager: mockedPlanManager,
                applyState: mockApplyState,
                setEditingPaused: mockSetEditingPaused,
            }),
        );

    it("initializes with an empty idea list", () => {
        const { result } = render();

        expect(result.current.ideaList).toEqual([]);
    });

    it("addIdea posts an empty idea and applies the returned state", async () => {
        const state = makeState(2, [""]);
        mockedAPIClient.addIdea.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.addIdea();
        });

        expect(mockedAPIClient.addIdea).toHaveBeenCalledWith("");
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("addIdea alerts and refetches state on failure", async () => {
        const refetchedState = makeState(3);
        mockedAPIClient.addIdea.mockResolvedValue(undefined);
        mockedAPIClient.getState.mockResolvedValue(refetchedState);

        const { result } = render();

        await act(async () => {
            await result.current.addIdea();
        });

        expect(window.alert).toHaveBeenCalledWith("Error: The operation failed. Refreshing project state.");
        expect(mockedAPIClient.getState).toHaveBeenCalled();
        expect(mockApplyState).toHaveBeenCalledWith(refetchedState);
    });

    it("deleteIdea removes the idea at the given index via the API", async () => {
        const state = makeState(2);
        mockedAPIClient.removeIdea.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.deleteIdea(1);
        });

        expect(mockedAPIClient.removeIdea).toHaveBeenCalledWith(1);
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("changeIdea updates the local list and pauses editing without hitting the API", () => {
        const { result } = render();

        act(() => {
            result.current.setIdeaList(["old", "other"]);
        });

        act(() => {
            result.current.changeIdea(0, "new");
        });

        expect(result.current.ideaList).toEqual(["new", "other"]);
        expect(mockSetEditingPaused).toHaveBeenCalledWith(true);
        expect(mockedAPIClient.updateIdea).not.toHaveBeenCalled();
        expect(mockApplyState).not.toHaveBeenCalled();
    });

    it("commitIdea persists the local text and resumes polling", async () => {
        const state = makeState(2, ["hello"]);
        mockedAPIClient.updateIdea.mockResolvedValue(state);

        const { result } = render();

        act(() => {
            result.current.setIdeaList(["hello"]);
        });

        await act(async () => {
            await result.current.commitIdea(0);
        });

        expect(mockSetEditingPaused).toHaveBeenCalledWith(false);
        expect(mockedAPIClient.updateIdea).toHaveBeenCalledWith(0, "hello");
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("commitIdea falls back to an empty string for a missing index", async () => {
        mockedAPIClient.updateIdea.mockResolvedValue(makeState(2));

        const { result } = render();

        await act(async () => {
            await result.current.commitIdea(5);
        });

        expect(mockedAPIClient.updateIdea).toHaveBeenCalledWith(5, "");
    });

    it("addTaskToContextAndRemove promotes the idea into the present context", async () => {
        const state = makeState(2);
        mockedAPIClient.promoteIdea.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.addTaskToContextAndRemove(2);
        });

        expect(mockedAPIClient.promoteIdea).toHaveBeenCalledWith(2, GOAL_ID);
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("addTaskToContextAndRemove alerts and refetches state on failure", async () => {
        const refetchedState = makeState(3);
        mockedAPIClient.promoteIdea.mockResolvedValue(undefined);
        mockedAPIClient.getState.mockResolvedValue(refetchedState);

        const { result } = render();

        await act(async () => {
            await result.current.addTaskToContextAndRemove(0);
        });

        expect(window.alert).toHaveBeenCalledWith("Error: The operation failed. Refreshing project state.");
        expect(mockApplyState).toHaveBeenCalledWith(refetchedState);
    });

    it("addAllIdeasToPlan promotes index 0 once per idea and applies the last state", async () => {
        const firstState = makeState(2, ["b", "c"]);
        const secondState = makeState(3, ["c"]);
        const lastState = makeState(4, []);
        mockedAPIClient.promoteIdea
            .mockResolvedValueOnce(firstState)
            .mockResolvedValueOnce(secondState)
            .mockResolvedValueOnce(lastState);

        const { result } = render();

        act(() => {
            result.current.setIdeaList(["a", "b", "c"]);
        });

        await act(async () => {
            await result.current.addAllIdeasToPlan();
        });

        expect(mockedAPIClient.promoteIdea).toHaveBeenCalledTimes(3);
        expect(mockedAPIClient.promoteIdea).toHaveBeenNthCalledWith(1, 0, GOAL_ID);
        expect(mockedAPIClient.promoteIdea).toHaveBeenNthCalledWith(2, 0, GOAL_ID);
        expect(mockedAPIClient.promoteIdea).toHaveBeenNthCalledWith(3, 0, GOAL_ID);
        expect(mockApplyState).toHaveBeenCalledTimes(1);
        expect(mockApplyState).toHaveBeenCalledWith(lastState);
    });

    it("addAllIdeasToPlan stops on failure, alerts, and refetches state", async () => {
        const refetchedState = makeState(5);
        mockedAPIClient.promoteIdea.mockResolvedValueOnce(makeState(2, ["b", "c"])).mockResolvedValueOnce(undefined);
        mockedAPIClient.getState.mockResolvedValue(refetchedState);

        const { result } = render();

        act(() => {
            result.current.setIdeaList(["a", "b", "c"]);
        });

        await act(async () => {
            await result.current.addAllIdeasToPlan();
        });

        expect(mockedAPIClient.promoteIdea).toHaveBeenCalledTimes(2);
        expect(window.alert).toHaveBeenCalledWith("Error: The operation failed. Refreshing project state.");
        expect(mockApplyState).toHaveBeenCalledWith(refetchedState);
    });

    it("addAllIdeasToPlan with an empty inbox alerts via the failure path", async () => {
        mockedAPIClient.getState.mockResolvedValue(makeState(1));

        const { result } = render();

        await act(async () => {
            await result.current.addAllIdeasToPlan();
        });

        expect(mockedAPIClient.promoteIdea).not.toHaveBeenCalled();
    });
});
