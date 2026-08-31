import { renderHook, act } from "@testing-library/react";
import { useRoadmap } from "./useRoadmap";
import { WorkspaceManager } from "../utils/WorkspaceManager";
import { APIClient } from "../utils/APIClient";
import { GOAL_ID, ProjectState, Task, TaskState } from "@blossom/common";

jest.mock("../utils/APIClient");

const TRIP = "Trip";
const HOUSE = "House";

const makeGoal = (tasks: Task[] = []): Task => ({
    name: "Goal",
    id: GOAL_ID,
    completionState: false,
    plan: { tasksList: tasks, dependenciesList: [] },
});

const makeState = (version = 1, key = TRIP, goal: Task = makeGoal()): ProjectState => ({
    version,
    key,
    savedToDisk: true,
    goal,
    inbox: [],
});

const leaf = (id: string, name: string, completionState = false): Task => ({
    id,
    name,
    completionState,
    plan: null as any,
});

describe("useRoadmap", () => {
    let workspace: WorkspaceManager;
    let mockedAPIClient: jest.Mocked<APIClient>;
    let mockApplyProject: jest.Mock;
    let mockNotify: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        // The view-model is pure: it holds the plans and derives the board, and
        // does no I/O, so the hook is exercised against the real thing.
        workspace = new WorkspaceManager();
        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        mockApplyProject = jest.fn();
        mockNotify = jest.fn();
        mockedAPIClient.lastFailure.mockReturnValue(null);
    });

    /** Puts projects on the board, as the sync hook would from a server view. */
    const openBoard = (...projects: ProjectState[]) => workspace.applyView({ projects, assistantProject: null });

    const render = () => renderHook(() => useRoadmap(workspace, mockedAPIClient, mockApplyProject, mockNotify));

    it("initializes with an empty board", () => {
        const { result } = render();

        expect(result.current.board).toEqual({ lanes: [] });
        expect(result.current.unblockedTasks).toEqual([]);
        expect(result.current.selectedTask).toBeNull();
    });

    describe("syncBoard", () => {
        it("draws one lane per project on the board, in lane order", () => {
            openBoard(makeState(1, TRIP, makeGoal([leaf("t1", "Pack")])), makeState(1, HOUSE, makeGoal()));
            const { result } = render();

            act(() => result.current.syncBoard());

            expect(result.current.board.lanes.map((lane) => lane.projectKey)).toEqual([TRIP, HOUSE]);
            expect(result.current.board.lanes[0].roadmap.tasksList.map((entry) => entry.task.id)).toEqual([
                "t1",
                GOAL_ID,
            ]);
        });

        it("refreshes the startable tasks across every project alongside the board", () => {
            openBoard(
                makeState(1, TRIP, makeGoal([leaf("t1", "Pack")])),
                makeState(1, HOUSE, makeGoal([leaf("h1", "Choose paint")])),
            );
            const { result } = render();

            act(() => result.current.syncBoard());

            expect(result.current.unblockedTasks.map((next) => [next.projectKey, next.task.id])).toEqual([
                [TRIP, "t1"],
                [HOUSE, "h1"],
            ]);
        });

        it("marks a blocked task as blocked in the lane it belongs to", () => {
            const goal = makeGoal([leaf("t1", "Pack"), leaf("t2", "Fly")]);
            goal.plan.dependenciesList = [{ source: "t1", target: "t2" }];
            openBoard(makeState(1, TRIP, goal));
            const { result } = render();

            act(() => result.current.syncBoard());

            const states = new Map(
                result.current.board.lanes[0].roadmap.tasksList.map((entry) => [entry.task.id, entry.state]),
            );
            expect(states.get("t1")).toBe(TaskState.UNBLOCKED);
            expect(states.get("t2")).toBe(TaskState.BLOCKED);
        });
    });

    describe("writes, each naming the project it lands in", () => {
        beforeEach(() => {
            openBoard(makeState(1, TRIP, makeGoal([leaf("t1", "Pack")])), makeState(1, HOUSE, makeGoal()));
        });

        it("setGoal calls the API and applies the returned state", async () => {
            const state = makeState(2, HOUSE);
            mockedAPIClient.setGoal.mockResolvedValue(state);
            const { result } = render();

            await act(async () => result.current.setGoal(HOUSE, "Redecorate"));

            expect(mockedAPIClient.setGoal).toHaveBeenCalledWith(HOUSE, "Redecorate");
            expect(mockApplyProject).toHaveBeenCalledWith(state);
        });

        it("setGoal reports the failure and reads that project back when the write is unexplained", async () => {
            mockedAPIClient.setGoal.mockResolvedValue(undefined);
            const fresh = makeState(9, TRIP);
            mockedAPIClient.getView.mockResolvedValue({ projects: [fresh], assistantProject: null });
            const { result } = render();

            await act(async () => result.current.setGoal(TRIP, "Get to Lisbon"));

            expect(mockNotify).toHaveBeenCalledWith("That did not work. Refreshing the project.");
            expect(mockedAPIClient.getView).toHaveBeenCalledWith([TRIP]);
            expect(mockApplyProject).toHaveBeenCalledWith(fresh);
        });

        it("leaves a refused write to be repaired centrally rather than reading it back", async () => {
            mockedAPIClient.setGoal.mockResolvedValue(undefined);
            mockedAPIClient.lastFailure.mockReturnValue({
                code: "conflict",
                message: "Someone got there first",
                state: makeState(4, TRIP),
            });
            const { result } = render();

            await act(async () => result.current.setGoal(TRIP, "Get to Lisbon"));

            expect(mockedAPIClient.getView).not.toHaveBeenCalled();
            expect(mockNotify).not.toHaveBeenCalled();
        });

        it("addTask posts to the plan level that project is drilled into", async () => {
            const task = leaf("new-1", "Book flights");
            mockedAPIClient.addTask.mockResolvedValue({ task, state: makeState(2, TRIP) });
            const { result } = render();

            let created: Task | null = null;
            await act(async () => {
                created = await result.current.addTask(TRIP, "Book flights");
            });

            expect(mockedAPIClient.addTask).toHaveBeenCalledWith(TRIP, GOAL_ID, "Book flights");
            expect(created).toEqual(task);
        });

        it("addTask returns nothing for a project the board does not hold", async () => {
            const { result } = render();

            let created: Task | null = null;
            await act(async () => {
                created = await result.current.addTask("SomebodyElsesProject", "Book flights");
            });

            expect(created).toBeNull();
            expect(mockedAPIClient.addTask).not.toHaveBeenCalled();
        });

        it("addTask returns null and reports the failure when the API call fails", async () => {
            mockedAPIClient.addTask.mockResolvedValue(undefined);
            const { result } = render();

            let created: Task | null = null;
            await act(async () => {
                created = await result.current.addTask(TRIP, "Book flights");
            });

            expect(created).toBeNull();
            expect(mockNotify).toHaveBeenCalledWith("Could not add that task.");
        });

        it("removeTask names the project the task belongs to", async () => {
            mockedAPIClient.removeTask.mockResolvedValue(makeState(2, TRIP));
            const { result } = render();

            await act(async () => result.current.removeTask({ projectKey: TRIP, taskId: "t1" }));

            expect(mockedAPIClient.removeTask).toHaveBeenCalledWith(TRIP, "t1");
        });

        it("connect adds a dependency inside one project", async () => {
            mockedAPIClient.addDependency.mockResolvedValue(makeState(2, TRIP));
            const { result } = render();

            await act(async () => result.current.connect(TRIP, "t1", GOAL_ID));

            expect(mockedAPIClient.addDependency).toHaveBeenCalledWith(TRIP, "t1", GOAL_ID);
        });

        it("removeEdge removes a dependency inside one project", async () => {
            mockedAPIClient.removeDependency.mockResolvedValue(makeState(2, TRIP));
            const { result } = render();

            await act(async () => result.current.removeEdge(TRIP, "t1", GOAL_ID));

            expect(mockedAPIClient.removeDependency).toHaveBeenCalledWith(TRIP, "t1", GOAL_ID);
        });

        it("updateEdge rewires a dependency inside one project", async () => {
            mockedAPIClient.updateDependency.mockResolvedValue(makeState(2, TRIP));
            const { result } = render();

            await act(async () => result.current.updateEdge(TRIP, "a", "b", "c", "d"));

            expect(mockedAPIClient.updateDependency).toHaveBeenCalledWith(TRIP, "a", "b", "c", "d");
        });

        it("createPlanForTask gives a task a subplan", async () => {
            mockedAPIClient.createSubplan.mockResolvedValue(makeState(2, TRIP));
            const { result } = render();

            await act(async () => result.current.createPlanForTask({ projectKey: TRIP, taskId: "t1" }));

            expect(mockedAPIClient.createSubplan).toHaveBeenCalledWith(TRIP, "t1");
        });

        it("handlePaste pastes into the plan level that project is drilled into", async () => {
            mockedAPIClient.pasteTasks.mockResolvedValue(makeState(2, HOUSE));
            const tasks = [leaf("copied", "Copied")];
            const { result } = render();

            await act(async () => result.current.handlePaste(HOUSE, tasks, []));

            expect(mockedAPIClient.pasteTasks).toHaveBeenCalledWith(HOUSE, GOAL_ID, tasks, []);
        });
    });

    describe("toggleComplete", () => {
        it("sends the inverse completion state for the task", async () => {
            openBoard(makeState(1, TRIP, makeGoal([leaf("t1", "Pack", false)])));
            mockedAPIClient.setTaskCompletion.mockResolvedValue(makeState(2, TRIP));
            const { result } = render();

            await act(async () => result.current.toggleComplete({ projectKey: TRIP, taskId: "t1" }));

            expect(mockedAPIClient.setTaskCompletion).toHaveBeenCalledWith(TRIP, "t1", true);
        });

        it("sends false for a completed task", async () => {
            openBoard(makeState(1, TRIP, makeGoal([leaf("t1", "Pack", true)])));
            mockedAPIClient.setTaskCompletion.mockResolvedValue(makeState(2, TRIP));
            const { result } = render();

            await act(async () => result.current.toggleComplete({ projectKey: TRIP, taskId: "t1" }));

            expect(mockedAPIClient.setTaskCompletion).toHaveBeenCalledWith(TRIP, "t1", false);
        });

        it("does nothing when the task is not on the board", async () => {
            openBoard(makeState(1, TRIP, makeGoal()));
            const { result } = render();

            await act(async () => result.current.toggleComplete({ projectKey: TRIP, taskId: "gone" }));

            expect(mockedAPIClient.setTaskCompletion).not.toHaveBeenCalled();
        });
    });

    describe("the selected task", () => {
        beforeEach(() => {
            openBoard(makeState(1, TRIP, makeGoal([leaf("t1", "Pack")])), makeState(1, HOUSE, makeGoal()));
        });

        it("carries the project the task belongs to", () => {
            const { result } = render();

            act(() => result.current.selectTask({ projectKey: TRIP, taskId: "t1" }));

            expect(result.current.selectedTask).toEqual({
                ref: { projectKey: TRIP, taskId: "t1" },
                task: expect.objectContaining({ id: "t1", name: "Pack" }),
            });
        });

        it("is nothing when the task is not in that project's plan level", () => {
            const { result } = render();

            act(() => result.current.selectTask({ projectKey: HOUSE, taskId: "t1" }));

            expect(result.current.selectedTask).toBeNull();
        });

        it("applies an edit to the project holding the selected task", async () => {
            mockedAPIClient.updateTask.mockResolvedValue(makeState(2, TRIP));
            mockedAPIClient.setTaskCompletion.mockResolvedValue(makeState(3, TRIP));
            const { result } = render();
            act(() => result.current.selectTask({ projectKey: TRIP, taskId: "t1" }));

            await act(async () => result.current.updateTaskDetails("Pack lightly", "One bag", true));

            expect(mockedAPIClient.updateTask).toHaveBeenCalledWith(TRIP, "t1", "Pack lightly", "One bag");
            expect(mockedAPIClient.setTaskCompletion).toHaveBeenCalledWith(TRIP, "t1", true);
        });

        it("does nothing when no task is selected", async () => {
            const { result } = render();

            await act(async () => result.current.updateTaskDetails("Pack lightly"));

            expect(mockedAPIClient.updateTask).not.toHaveBeenCalled();
        });

        it("leaves completion alone when it already reads that way", async () => {
            mockedAPIClient.updateTask.mockResolvedValue(makeState(2, TRIP));
            const { result } = render();
            act(() => result.current.selectTask({ projectKey: TRIP, taskId: "t1" }));

            await act(async () => result.current.updateTaskDetails("Pack lightly", "One bag", false));

            expect(mockedAPIClient.setTaskCompletion).not.toHaveBeenCalled();
        });

        it("leaves the name and description alone when neither was given", async () => {
            mockedAPIClient.setTaskCompletion.mockResolvedValue(makeState(2, TRIP));
            const { result } = render();
            act(() => result.current.selectTask({ projectKey: TRIP, taskId: "t1" }));

            await act(async () => result.current.updateTaskDetails("", undefined, true));

            expect(mockedAPIClient.updateTask).not.toHaveBeenCalled();
            expect(mockedAPIClient.setTaskCompletion).toHaveBeenCalled();
        });

        it("re-reads the task from the plan after an edit", async () => {
            mockedAPIClient.updateTask.mockImplementation(async () => {
                workspace.applyProject(makeState(2, TRIP, makeGoal([leaf("t1", "Pack lightly")])));
                return makeState(2, TRIP);
            });
            const { result } = render();
            act(() => result.current.selectTask({ projectKey: TRIP, taskId: "t1" }));

            await act(async () => result.current.updateTaskDetails("Pack lightly", "One bag"));

            expect(result.current.selectedTask!.task.name).toBe("Pack lightly");
        });
    });

    describe("handleUndo", () => {
        beforeEach(() => {
            openBoard(makeState(1, TRIP, makeGoal([leaf("t1", "Pack")])));
        });

        it("undoes within one project and applies the state it returns", async () => {
            const state = makeState(2, TRIP);
            mockedAPIClient.undo.mockResolvedValue(state);
            const { result } = render();

            await act(async () => result.current.handleUndo(TRIP));

            expect(mockedAPIClient.undo).toHaveBeenCalledWith(TRIP);
            expect(mockApplyProject).toHaveBeenCalledWith(state);
        });

        it("does nothing when the API call fails", async () => {
            mockedAPIClient.undo.mockResolvedValue(undefined);
            const { result } = render();

            await act(async () => result.current.handleUndo(TRIP));

            expect(mockApplyProject).not.toHaveBeenCalled();
        });

        it("clears the selected task when the undo took it away", async () => {
            mockedAPIClient.undo.mockImplementation(async () => {
                workspace.applyProject(makeState(2, TRIP, makeGoal()));
                return makeState(2, TRIP);
            });
            const { result } = render();
            act(() => result.current.selectTask({ projectKey: TRIP, taskId: "t1" }));

            await act(async () => result.current.handleUndo(TRIP));

            expect(result.current.selectedTask).toBeNull();
        });
    });

    describe("drilling into a plan", () => {
        const withSubplan = (): Task =>
            makeGoal([
                {
                    id: "sub",
                    name: "Prepare",
                    completionState: false,
                    plan: { tasksList: [leaf("inner", "Sort paperwork")], dependenciesList: [] },
                },
            ]);

        it("moves one lane into a subplan, leaving the others where they are", () => {
            openBoard(makeState(1, TRIP, withSubplan()), makeState(1, HOUSE, makeGoal([leaf("h1", "Choose paint")])));
            const { result } = render();

            act(() => result.current.changeContextToWithinTask({ projectKey: TRIP, taskId: "sub" }));

            expect(result.current.board.lanes[0].roadmap.tasksList.map((entry) => entry.task.id)).toEqual([
                "inner",
                GOAL_ID,
            ]);
            expect(result.current.board.lanes[0].roadmap.ancestors.map((crumb) => crumb.id)).toEqual([GOAL_ID, "sub"]);
            expect(result.current.board.lanes[1].roadmap.tasksList.map((entry) => entry.task.id)).toEqual([
                "h1",
                GOAL_ID,
            ]);
        });

        it("moves a lane to the plan a task lives in, which is how the next-tasks list navigates", () => {
            openBoard(makeState(1, TRIP, withSubplan()));
            const { result } = render();

            act(() => result.current.changeContextToParent({ projectKey: TRIP, taskId: "inner" }));

            expect(result.current.board.lanes[0].roadmap.ancestors.map((crumb) => crumb.id)).toEqual([GOAL_ID, "sub"]);
        });

        it("steps a lane back out to the top level", () => {
            openBoard(makeState(1, TRIP, withSubplan()));
            const { result } = render();
            act(() => result.current.changeContextToWithinTask({ projectKey: TRIP, taskId: "sub" }));

            act(() => result.current.changeContextToParent({ projectKey: TRIP, taskId: "sub" }));

            expect(result.current.board.lanes[0].roadmap.ancestors.map((crumb) => crumb.id)).toEqual([GOAL_ID]);
        });

        it("ignores a project the board does not hold", () => {
            openBoard(makeState(1, TRIP, withSubplan()));
            const { result } = render();

            act(() => result.current.changeContextToWithinTask({ projectKey: "Nothing", taskId: "sub" }));

            expect(result.current.board.lanes[0].roadmap.ancestors.map((crumb) => crumb.id)).toEqual([GOAL_ID]);
        });
    });
});
