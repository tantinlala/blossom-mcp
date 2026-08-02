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
    let mockNotify: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedPlanManager = new PlanManager() as jest.Mocked<PlanManager>;
        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        mockedAPIClient.lastFailure.mockReturnValue(null);
        mockApplyState = jest.fn();
        mockNotify = jest.fn();

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
                notify: mockNotify,
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

    it("addIdea reports the failure and refetches state when the write is unexplained", async () => {
        const refetchedState = makeState(3);
        mockedAPIClient.addIdea.mockResolvedValue(undefined);
        mockedAPIClient.getState.mockResolvedValue(refetchedState);

        const { result } = render();

        await act(async () => {
            await result.current.addIdea();
        });

        expect(mockNotify).toHaveBeenCalledWith("That did not work. Refreshing the project.");
        expect(mockedAPIClient.getState).toHaveBeenCalled();
        expect(mockApplyState).toHaveBeenCalledWith(refetchedState);
    });

    it("leaves a refused write to be repaired centrally rather than refetching", async () => {
        mockedAPIClient.addIdea.mockResolvedValue(undefined);
        mockedAPIClient.lastFailure.mockReturnValue({
            code: "conflict",
            message: "Someone got there first",
            state: makeState(4),
        });

        const { result } = render();

        await act(async () => {
            await result.current.addIdea();
        });

        expect(mockNotify).not.toHaveBeenCalled();
        expect(mockedAPIClient.getState).not.toHaveBeenCalled();
    });

    it("deleteIdea removes the idea at the given index, guarded by the text it expects", async () => {
        const state = makeState(2);
        mockedAPIClient.removeIdea.mockResolvedValue(state);

        const { result } = render();
        act(() => result.current.applyRemoteInbox(["first", "second"]));

        await act(async () => {
            await result.current.deleteIdea(1);
        });

        expect(mockedAPIClient.removeIdea).toHaveBeenCalledWith(1, "second");
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("changeIdea overlays the typed text locally without hitting the API", () => {
        const { result } = render();

        act(() => result.current.applyRemoteInbox(["old", "other"]));
        act(() => result.current.changeIdea(0, "new"));

        expect(result.current.ideaList).toEqual(["new", "other"]);
        expect(mockedAPIClient.updateIdea).not.toHaveBeenCalled();
        expect(mockApplyState).not.toHaveBeenCalled();
    });

    it("commitIdea persists the typed text against the value it started from", async () => {
        const state = makeState(2, ["hello there"]);
        mockedAPIClient.updateIdea.mockResolvedValue(state);

        const { result } = render();
        act(() => result.current.applyRemoteInbox(["hello"]));
        act(() => result.current.changeIdea(0, "hello there"));

        await act(async () => {
            await result.current.commitIdea(0);
        });

        expect(mockedAPIClient.updateIdea).toHaveBeenCalledWith(0, "hello there", "hello");
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("commitIdea does nothing when there is no pending edit", async () => {
        const { result } = render();
        act(() => result.current.applyRemoteInbox(["untouched"]));

        await act(async () => {
            await result.current.commitIdea(0);
        });

        expect(mockedAPIClient.updateIdea).not.toHaveBeenCalled();
    });

    it("keeps typing intact when a change arrives for a different row", () => {
        const { result } = render();

        act(() => result.current.applyRemoteInbox(["mine", "theirs"]));
        act(() => result.current.changeIdea(0, "mine, half typed"));

        act(() => result.current.applyRemoteInbox(["mine", "theirs, edited"]));

        expect(result.current.ideaList).toEqual(["mine, half typed", "theirs, edited"]);
    });

    it("keeps your typing when the row changes underneath, and says so", () => {
        const { result } = render();

        act(() => result.current.applyRemoteInbox(["mine"]));
        act(() => result.current.changeIdea(0, "mine, half typed"));

        act(() => result.current.applyRemoteInbox(["somebody else got there first"]));

        // Discarding half-typed text without a word is the failure this exists
        // to prevent, so the text stays and the person is told instead.
        expect(result.current.ideaList).toEqual(["mine, half typed"]);
        expect(mockNotify).toHaveBeenCalledWith(
            "Someone else changed an idea you are editing. Your version will replace theirs.",
        );
    });

    it("commits over the value that landed underneath, having warned about it", async () => {
        const state = makeState(9, ["mine, half typed"]);
        mockedAPIClient.updateIdea.mockResolvedValue(state);

        const { result } = render();
        act(() => result.current.applyRemoteInbox(["mine"]));
        act(() => result.current.changeIdea(0, "mine, half typed"));
        act(() => result.current.applyRemoteInbox(["somebody else got there first"]));

        await act(async () => {
            await result.current.commitIdea(0);
        });

        // The precondition is the value actually on the server, so the commit
        // succeeds as the informed overwrite the notice promised.
        expect(mockedAPIClient.updateIdea).toHaveBeenCalledWith(0, "mine, half typed", "somebody else got there first");
    });

    it("gives up an edit whose row was deleted by somebody else", () => {
        const { result } = render();

        act(() => result.current.applyRemoteInbox(["first", "second"]));
        act(() => result.current.changeIdea(1, "second, half typed"));

        act(() => result.current.applyRemoteInbox(["first"]));

        expect(result.current.ideaList).toEqual(["first"]);
        expect(mockNotify).toHaveBeenCalledWith("An idea you were editing was removed by someone else.");
    });

    it("keeps the typed text after a rejected commit so it is not lost", async () => {
        mockedAPIClient.updateIdea.mockResolvedValue(undefined);
        mockedAPIClient.lastFailure.mockReturnValue({
            code: "conflict",
            message: "Inbox item 0 has changed",
            state: makeState(4, ["mine"]),
        });

        const { result } = render();
        act(() => result.current.applyRemoteInbox(["mine"]));
        act(() => result.current.changeIdea(0, "mine, half typed"));

        await act(async () => {
            await result.current.commitIdea(0);
        });

        expect(result.current.ideaList).toEqual(["mine, half typed"]);
    });

    it("addTaskToContextAndRemove promotes the idea into the present context", async () => {
        const state = makeState(2);
        mockedAPIClient.promoteIdea.mockResolvedValue(state);

        const { result } = render();
        act(() => result.current.applyRemoteInbox(["a", "b", "c"]));

        await act(async () => {
            await result.current.addTaskToContextAndRemove(2);
        });

        expect(mockedAPIClient.promoteIdea).toHaveBeenCalledWith(2, GOAL_ID, "c");
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("addTaskToContextAndRemove reports the failure and refetches state", async () => {
        const refetchedState = makeState(3);
        mockedAPIClient.promoteIdea.mockResolvedValue(undefined);
        mockedAPIClient.getState.mockResolvedValue(refetchedState);

        const { result } = render();

        await act(async () => {
            await result.current.addTaskToContextAndRemove(0);
        });

        expect(mockNotify).toHaveBeenCalledWith("That did not work. Refreshing the project.");
        expect(mockApplyState).toHaveBeenCalledWith(refetchedState);
    });

    it("addAllIdeasToPlan promotes every idea in a single request", async () => {
        const state = makeState(4, []);
        mockedAPIClient.promoteAllIdeas.mockResolvedValue(state);

        const { result } = render();
        act(() => result.current.applyRemoteInbox(["a", "b", "c"]));

        await act(async () => {
            await result.current.addAllIdeasToPlan();
        });

        expect(mockedAPIClient.promoteAllIdeas).toHaveBeenCalledTimes(1);
        expect(mockedAPIClient.promoteAllIdeas).toHaveBeenCalledWith(GOAL_ID);
        expect(mockApplyState).toHaveBeenCalledTimes(1);
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("addAllIdeasToPlan reports the failure and refetches state", async () => {
        const refetchedState = makeState(5);
        mockedAPIClient.promoteAllIdeas.mockResolvedValue(undefined);
        mockedAPIClient.getState.mockResolvedValue(refetchedState);

        const { result } = render();
        act(() => result.current.applyRemoteInbox(["a", "b", "c"]));

        await act(async () => {
            await result.current.addAllIdeasToPlan();
        });

        expect(mockNotify).toHaveBeenCalledWith("That did not work. Refreshing the project.");
        expect(mockApplyState).toHaveBeenCalledWith(refetchedState);
    });

    it("addAllIdeasToPlan does nothing when the inbox is empty", async () => {
        const { result } = render();

        await act(async () => {
            await result.current.addAllIdeasToPlan();
        });

        expect(mockedAPIClient.promoteAllIdeas).not.toHaveBeenCalled();
    });
});
