import { renderHook, act } from "@testing-library/react";
import { useRoadmap } from "./useRoadmap";
import { PlanManager } from "../utils/PlanManager";
import { APIClient } from "../utils/APIClient";
import { GOAL_ID, ProjectState, Task } from "@blossom/common";

jest.mock("../utils/PlanManager");
jest.mock("../utils/APIClient");

const makeState = (version = 1): ProjectState => ({
    version,
    activeProject: null,
    goal: { name: "Goal", id: GOAL_ID, completionState: false, plan: { tasksList: [], dependenciesList: [] } },
    inbox: [],
});

describe("useRoadmap", () => {
    let mockedPlanManager: jest.Mocked<PlanManager>;
    let mockedAPIClient: jest.Mocked<APIClient>;
    let mockApplyState: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedPlanManager = new PlanManager() as jest.Mocked<PlanManager>;
        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        mockApplyState = jest.fn();
        window.alert = jest.fn();

        Object.defineProperty(mockedPlanManager, "presentContextGoal", {
            get: jest.fn().mockReturnValue({ name: "Goal", id: GOAL_ID, completionState: false, plan: null }),
            configurable: true,
        });
        Object.defineProperty(mockedPlanManager, "presentContextRoadmap", {
            get: jest.fn().mockReturnValue({ tasksList: [], dependenciesList: [], isSubplan: false }),
            configurable: true,
        });
        Object.defineProperty(mockedPlanManager, "allUnblockedTasks", {
            get: jest.fn().mockReturnValue([]),
            configurable: true,
        });
    });

    const render = () => renderHook(() => useRoadmap(mockedPlanManager, mockedAPIClient, mockApplyState));

    it("initializes with empty roadmap state", () => {
        const { result } = render();

        expect(result.current.presentlyShownRoadmap).toEqual({
            tasksList: [],
            dependenciesList: [],
            isSubplan: false,
            ancestors: [],
        });
        expect(result.current.unblockedTasks).toEqual([]);
        expect(result.current.selectedTask).toBeNull();
    });

    it("syncRoadmap copies presentContextRoadmap from planManager", () => {
        const mockRoadmap = {
            tasksList: [{ task: { id: "1", name: "Task 1", completionState: false, plan: null }, state: 2 }],
            dependenciesList: [],
            isSubplan: false,
        };
        Object.defineProperty(mockedPlanManager, "presentContextRoadmap", {
            get: jest.fn().mockReturnValue(mockRoadmap),
            configurable: true,
        });

        const { result } = render();

        act(() => {
            result.current.syncRoadmap();
        });

        expect(result.current.presentlyShownRoadmap).toEqual(mockRoadmap);
        expect(result.current.presentlyShownRoadmap).not.toBe(mockRoadmap);
    });

    it("setGoal calls the API and applies the returned state", async () => {
        const state = makeState(2);
        mockedAPIClient.setGoal.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.setGoal("My new goal");
        });

        expect(mockedAPIClient.setGoal).toHaveBeenCalledWith("My new goal");
        expect(mockApplyState).toHaveBeenCalledWith(state);
        expect(window.alert).not.toHaveBeenCalled();
    });

    it("setGoal refetches state when the API call fails", async () => {
        const refetched = makeState(3);
        mockedAPIClient.setGoal.mockResolvedValue(undefined);
        mockedAPIClient.getState.mockResolvedValue(refetched);

        const { result } = render();

        await act(async () => {
            await result.current.setGoal("My new goal");
        });

        expect(window.alert).toHaveBeenCalled();
        expect(mockApplyState).toHaveBeenCalledWith(refetched);
    });

    it("addTask posts to the API with the present context id and applies the returned state", async () => {
        const newTask: Task = { id: "t1", name: "New Task", completionState: false, plan: null };
        const state = makeState(2);
        mockedAPIClient.addTask.mockResolvedValue({ task: newTask, state });

        const { result } = render();

        let returnedTask: Task | null = null;
        await act(async () => {
            returnedTask = await result.current.addTask("New Task");
        });

        expect(mockedAPIClient.addTask).toHaveBeenCalledWith(GOAL_ID, "New Task");
        expect(mockApplyState).toHaveBeenCalledWith(state);
        expect(returnedTask).toEqual(newTask);
    });

    it("addTask returns null and alerts when the API call fails", async () => {
        mockedAPIClient.addTask.mockResolvedValue(undefined);

        const { result } = render();

        let returnedTask: Task | null = null;
        await act(async () => {
            returnedTask = await result.current.addTask("New Task");
        });

        expect(returnedTask).toBeNull();
        expect(window.alert).toHaveBeenCalledWith("Error: Unable to add task.");
        expect(mockApplyState).not.toHaveBeenCalled();
    });

    it("removeTask calls the API and applies the returned state", async () => {
        const state = makeState(2);
        mockedAPIClient.removeTask.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.removeTask("t1");
        });

        expect(mockedAPIClient.removeTask).toHaveBeenCalledWith("t1");
        expect(mockApplyState).toHaveBeenCalledWith(state);
        expect(window.alert).not.toHaveBeenCalled();
        expect(mockedAPIClient.getState).not.toHaveBeenCalled();
    });

    it("removeTask alerts and refetches state when the API call fails", async () => {
        const refetchedState = makeState(3);
        mockedAPIClient.removeTask.mockResolvedValue(undefined);
        mockedAPIClient.getState.mockResolvedValue(refetchedState);

        const { result } = render();

        await act(async () => {
            await result.current.removeTask("t1");
        });

        expect(window.alert).toHaveBeenCalledWith("Error: The operation failed. Refreshing project state.");
        expect(mockedAPIClient.getState).toHaveBeenCalled();
        expect(mockApplyState).toHaveBeenCalledWith(refetchedState);
    });

    it("connect calls addDependency and applies the returned state", async () => {
        const state = makeState(2);
        mockedAPIClient.addDependency.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.connect("source1", "target1");
        });

        expect(mockedAPIClient.addDependency).toHaveBeenCalledWith("source1", "target1");
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("removeEdge calls removeDependency and applies the returned state", async () => {
        const state = makeState(2);
        mockedAPIClient.removeDependency.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.removeEdge("source1", "target1");
        });

        expect(mockedAPIClient.removeDependency).toHaveBeenCalledWith("source1", "target1");
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("updateEdge calls updateDependency and applies the returned state", async () => {
        const state = makeState(2);
        mockedAPIClient.updateDependency.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.updateEdge("s1", "t1", "s2", "t2");
        });

        expect(mockedAPIClient.updateDependency).toHaveBeenCalledWith("s1", "t1", "s2", "t2");
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("createPlanForTask calls createSubplan and applies the returned state", async () => {
        const state = makeState(2);
        mockedAPIClient.createSubplan.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.createPlanForTask("t1");
        });

        expect(mockedAPIClient.createSubplan).toHaveBeenCalledWith("t1");
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("createPlanForTask alerts and refetches state on failure", async () => {
        const refetchedState = makeState(3);
        mockedAPIClient.createSubplan.mockResolvedValue(undefined);
        mockedAPIClient.getState.mockResolvedValue(refetchedState);

        const { result } = render();

        await act(async () => {
            await result.current.createPlanForTask("t1");
        });

        expect(window.alert).toHaveBeenCalledWith("Error: The operation failed. Refreshing project state.");
        expect(mockApplyState).toHaveBeenCalledWith(refetchedState);
    });

    it("toggleComplete sends the inverse completion state for the task", async () => {
        const task: Task = { id: "t1", name: "Task 1", completionState: false, plan: null };
        mockedPlanManager.findTask.mockReturnValue(task);
        mockedAPIClient.setTaskCompletion.mockResolvedValue(makeState(2));

        const unblockedTasks = [{ id: "t2", name: "Task 2", completionState: false, plan: null }];
        Object.defineProperty(mockedPlanManager, "allUnblockedTasks", {
            get: jest.fn().mockReturnValue(unblockedTasks),
            configurable: true,
        });

        const { result } = render();

        await act(async () => {
            await result.current.toggleComplete("t1");
        });

        expect(mockedPlanManager.findTask).toHaveBeenCalledWith("t1");
        expect(mockedAPIClient.setTaskCompletion).toHaveBeenCalledWith("t1", true);
        expect(result.current.unblockedTasks).toEqual(unblockedTasks);
    });

    it("toggleComplete sends false for a completed task", async () => {
        const task: Task = { id: "t1", name: "Task 1", completionState: true, plan: null };
        mockedPlanManager.findTask.mockReturnValue(task);
        mockedAPIClient.setTaskCompletion.mockResolvedValue(makeState(2));

        const { result } = render();

        await act(async () => {
            await result.current.toggleComplete("t1");
        });

        expect(mockedAPIClient.setTaskCompletion).toHaveBeenCalledWith("t1", false);
    });

    it("toggleComplete does nothing when the task is not found", async () => {
        mockedPlanManager.findTask.mockReturnValue(null);

        const { result } = render();

        await act(async () => {
            await result.current.toggleComplete("missing");
        });

        expect(mockedAPIClient.setTaskCompletion).not.toHaveBeenCalled();
    });

    it("selectTask sets selectedTask when found", () => {
        const task: Task = { id: "t1", name: "Task 1", completionState: false, plan: null };
        mockedPlanManager.findTaskInPresentContext.mockReturnValue(task);

        const { result } = render();

        act(() => {
            result.current.selectTask("t1");
        });

        expect(result.current.selectedTask).toEqual(task);
    });

    it("selectTask sets null when not found", () => {
        mockedPlanManager.findTaskInPresentContext.mockReturnValue(null);

        const { result } = render();

        act(() => {
            result.current.selectTask("nonexistent");
        });

        expect(result.current.selectedTask).toBeNull();
    });

    it("updateTaskDetails updates name/description and toggles completion via the API", async () => {
        const task: Task = { id: "t1", name: "Old Name", completionState: false, plan: null };
        mockedPlanManager.findTaskInPresentContext.mockReturnValue(task);
        mockedAPIClient.updateTask.mockResolvedValue(makeState(2));
        mockedAPIClient.setTaskCompletion.mockResolvedValue(makeState(3));

        const { result } = render();

        act(() => {
            result.current.selectTask("t1");
        });

        await act(async () => {
            await result.current.updateTaskDetails("t1", "New Name", "New description", true);
        });

        expect(mockedAPIClient.updateTask).toHaveBeenCalledWith("t1", "New Name", "New description");
        expect(mockedAPIClient.setTaskCompletion).toHaveBeenCalledWith("t1", true);
        expect(mockApplyState).toHaveBeenCalledTimes(2);
    });

    it("updateTaskDetails does nothing when no task is selected", async () => {
        const { result } = render();

        await act(async () => {
            await result.current.updateTaskDetails("t1", "New Name");
        });

        expect(mockedAPIClient.updateTask).not.toHaveBeenCalled();
        expect(mockedAPIClient.setTaskCompletion).not.toHaveBeenCalled();
    });

    it("updateTaskDetails skips setTaskCompletion when the completion state matches", async () => {
        const task: Task = { id: "t1", name: "Name", completionState: false, plan: null };
        mockedPlanManager.findTaskInPresentContext.mockReturnValue(task);
        mockedAPIClient.updateTask.mockResolvedValue(makeState(2));

        const { result } = render();

        act(() => {
            result.current.selectTask("t1");
        });

        await act(async () => {
            await result.current.updateTaskDetails("t1", "Name", undefined, false);
        });

        expect(mockedAPIClient.setTaskCompletion).not.toHaveBeenCalled();
        expect(mockedAPIClient.updateTask).toHaveBeenCalledWith("t1", "Name", undefined);
    });

    it("updateTaskDetails skips updateTask when name is empty and description undefined", async () => {
        const task: Task = { id: "t1", name: "Name", completionState: false, plan: null };
        mockedPlanManager.findTaskInPresentContext.mockReturnValue(task);
        mockedAPIClient.setTaskCompletion.mockResolvedValue(makeState(2));

        const { result } = render();

        act(() => {
            result.current.selectTask("t1");
        });

        await act(async () => {
            await result.current.updateTaskDetails("t1", "", undefined, true);
        });

        expect(mockedAPIClient.updateTask).not.toHaveBeenCalled();
        expect(mockedAPIClient.setTaskCompletion).toHaveBeenCalledWith("t1", true);
    });

    it("updateTaskDetails refreshes selectedTask from the plan manager", async () => {
        const task: Task = { id: "t1", name: "Old Name", completionState: false, plan: null };
        const updatedTask: Task = { id: "t1", name: "New Name", completionState: false, plan: null };
        mockedPlanManager.findTaskInPresentContext
            .mockReturnValueOnce(task) // selectTask
            .mockReturnValueOnce(updatedTask); // refresh after update
        mockedAPIClient.updateTask.mockResolvedValue(makeState(2));

        const { result } = render();

        act(() => {
            result.current.selectTask("t1");
        });

        await act(async () => {
            await result.current.updateTaskDetails("t1", "New Name");
        });

        expect(result.current.selectedTask).toEqual(updatedTask);
    });

    it("handlePaste calls pasteTasks with the present context id", async () => {
        const tasks: Task[] = [{ id: "t1", name: "Pasted", completionState: false, plan: null }];
        const deps = [{ source: "t1", target: "t2" }];
        const state = makeState(2);
        mockedAPIClient.pasteTasks.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.handlePaste(tasks, deps);
        });

        expect(mockedAPIClient.pasteTasks).toHaveBeenCalledWith(GOAL_ID, tasks, deps);
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("handleUndo applies the state returned by the API", async () => {
        const state = makeState(2);
        mockedAPIClient.undo.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.handleUndo();
        });

        expect(mockedAPIClient.undo).toHaveBeenCalled();
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("handleUndo does nothing when the API call fails", async () => {
        mockedAPIClient.undo.mockResolvedValue(undefined);

        const { result } = render();

        await act(async () => {
            await result.current.handleUndo();
        });

        expect(mockApplyState).not.toHaveBeenCalled();
    });

    it("handleUndo clears selectedTask when the task no longer exists", async () => {
        const task: Task = { id: "t1", name: "Task", completionState: false, plan: null };
        mockedPlanManager.findTaskInPresentContext
            .mockReturnValueOnce(task) // selectTask
            .mockReturnValueOnce(null); // after undo the task is gone
        mockedAPIClient.undo.mockResolvedValue(makeState(2));

        const { result } = render();

        act(() => {
            result.current.selectTask("t1");
        });
        expect(result.current.selectedTask).toEqual(task);

        await act(async () => {
            await result.current.handleUndo();
        });

        expect(result.current.selectedTask).toBeNull();
    });

    it("changeContextToWithinTask stays synchronous via the plan manager", () => {
        const { result } = render();

        act(() => {
            result.current.changeContextToWithinTask("t1");
        });

        expect(mockedPlanManager.changeContextToWithinTask).toHaveBeenCalledWith("t1");
    });

    it("changeContextToParent stays synchronous via the plan manager", () => {
        const { result } = render();

        act(() => {
            result.current.changeContextToParent("t1");
        });

        expect(mockedPlanManager.changeContextToParent).toHaveBeenCalledWith("t1");
    });

    it("toggleNextTasksDrawer opens drawer and loads unblocked tasks", () => {
        const unblockedTasks = [{ id: "t1", name: "Task 1", completionState: false, plan: null }];
        Object.defineProperty(mockedPlanManager, "allUnblockedTasks", {
            get: jest.fn().mockReturnValue(unblockedTasks),
            configurable: true,
        });

        const { result } = render();

        act(() => {
            result.current.toggleNextTasksDrawer(true)();
        });

        expect(result.current.drawerOpen).toBe(true);
        expect(result.current.unblockedTasks).toEqual(unblockedTasks);
    });

    it("toggleDetailsDrawer opens and closes", () => {
        const { result } = render();

        act(() => {
            result.current.toggleDetailsDrawer(true)();
        });
        expect(result.current.detailsDrawerOpen).toBe(true);

        act(() => {
            result.current.toggleDetailsDrawer(false)();
        });
        expect(result.current.detailsDrawerOpen).toBe(false);
    });
});
