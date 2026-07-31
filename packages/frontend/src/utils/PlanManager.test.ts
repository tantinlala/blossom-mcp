import { PlanManager } from "./PlanManager";
import { GOAL_ID, Task, TaskState } from "@blossom/common";

const leaf = (id: string, completionState = false): Task => ({
    name: `Task ${id}`,
    id,
    completionState,
    plan: null,
});

// Goal tree:
//   t1 -> t2 -> Goal, where t2 has a subplan s1 -> s2 -> Goal
const makeGoal = (options: { t1Completed?: boolean; t2Name?: string } = {}): Task => ({
    name: "Ship product",
    id: GOAL_ID,
    completionState: false,
    plan: {
        tasksList: [
            leaf("t1", options.t1Completed ?? false),
            {
                name: options.t2Name ?? "Task t2",
                id: "t2",
                completionState: false,
                plan: {
                    tasksList: [leaf("s1"), leaf("s2")],
                    dependenciesList: [
                        { source: "s1", target: "s2" },
                        { source: "s2", target: GOAL_ID },
                    ],
                },
            },
        ],
        dependenciesList: [
            { source: "t1", target: "t2" },
            { source: "t2", target: GOAL_ID },
        ],
    },
});

// Goal tree nested two levels deep:
//   d1 -> mid -> Goal, where mid contains d2, and d2 contains deep
const makeNestedGoal = (): Task => ({
    name: "Ship product",
    id: GOAL_ID,
    completionState: false,
    plan: {
        tasksList: [
            leaf("d1"),
            {
                name: "Task mid",
                id: "mid",
                completionState: false,
                plan: {
                    tasksList: [
                        {
                            name: "Task d2",
                            id: "d2",
                            completionState: false,
                            plan: {
                                tasksList: [leaf("deep")],
                                dependenciesList: [{ source: "deep", target: GOAL_ID }],
                            },
                        },
                    ],
                    dependenciesList: [{ source: "d2", target: GOAL_ID }],
                },
            },
        ],
        dependenciesList: [
            { source: "d1", target: "mid" },
            { source: "mid", target: GOAL_ID },
        ],
    },
});

describe("PlanManager", () => {
    let planManager: PlanManager;

    beforeEach(() => {
        planManager = new PlanManager();
    });

    describe("reset and initialized", () => {
        it("is initially not initialized", () => {
            expect(planManager.initialized()).toBe(false);
            expect(planManager.goal.id).toBe(GOAL_ID);
            expect(planManager.goal.plan).toBeNull();
        });

        it("is initialized after applying server state with a plan", () => {
            planManager.applyServerState(makeGoal());

            expect(planManager.initialized()).toBe(true);
        });

        it("reset returns to an uninitialized root context", () => {
            planManager.applyServerState(makeGoal());
            planManager.changeContextToWithinTask("t2");

            planManager.reset();

            expect(planManager.initialized()).toBe(false);
            expect(planManager.goal.name).toBe("");
            expect(planManager.goal.plan).toBeNull();
            expect(planManager.presentContextGoal.id).toBe(GOAL_ID);
        });
    });

    describe("applyServerState", () => {
        it("replaces the goal tree", () => {
            const goal = makeGoal();

            planManager.applyServerState(goal);

            expect(planManager.goal).toBe(goal);
            expect(planManager.presentContextGoal).toBe(goal);
        });

        it("keeps the drill-down context when the context task still exists with a plan", () => {
            planManager.applyServerState(makeGoal());
            planManager.changeContextToWithinTask("t2");

            planManager.applyServerState(makeGoal({ t2Name: "Task t2 renamed" }));

            expect(planManager.presentContextGoal.id).toBe("t2");
            expect(planManager.presentContextGoal.name).toBe("Task t2 renamed");
        });

        it("falls back to the root when the context task no longer exists", () => {
            planManager.applyServerState(makeGoal());
            planManager.changeContextToWithinTask("t2");

            const withoutT2 = makeGoal();
            withoutT2.plan.tasksList = withoutT2.plan.tasksList.filter((task) => task.id !== "t2");
            planManager.applyServerState(withoutT2);

            expect(planManager.presentContextGoal.id).toBe(GOAL_ID);
        });

        it("falls back to the root when the context task lost its plan", () => {
            planManager.applyServerState(makeGoal());
            planManager.changeContextToWithinTask("t2");

            const flattened = makeGoal();
            flattened.plan.tasksList = [leaf("t1"), leaf("t2")];
            planManager.applyServerState(flattened);

            expect(planManager.presentContextGoal.id).toBe(GOAL_ID);
        });

        it("falls back to the root when the new state has no plan", () => {
            planManager.applyServerState(makeGoal());
            planManager.changeContextToWithinTask("t2");

            const empty: Task = { name: "Empty", id: GOAL_ID, completionState: false, plan: null };
            planManager.applyServerState(empty);

            expect(planManager.presentContextGoal).toBe(empty);
        });
    });

    describe("context changes", () => {
        beforeEach(() => {
            planManager.applyServerState(makeGoal());
        });

        it("changeContextToWithinTask drills into a task with a subplan", () => {
            planManager.changeContextToWithinTask("t2");

            expect(planManager.presentContextGoal.id).toBe("t2");
        });

        it("changeContextToWithinTask with GOAL_ID returns to the root", () => {
            planManager.changeContextToWithinTask("t2");

            planManager.changeContextToWithinTask(GOAL_ID);

            expect(planManager.presentContextGoal.id).toBe(GOAL_ID);
        });

        it("changeContextToWithinTask ignores tasks without a subplan", () => {
            planManager.changeContextToWithinTask("t1");

            expect(planManager.presentContextGoal.id).toBe(GOAL_ID);
        });

        it("changeContextToWithinTask ignores unknown task ids", () => {
            planManager.changeContextToWithinTask("nonexistent");

            expect(planManager.presentContextGoal.id).toBe(GOAL_ID);
        });

        it("changeContextToParent moves to the parent of a nested task", () => {
            planManager.changeContextToParent("s1");

            expect(planManager.presentContextGoal.id).toBe("t2");
        });

        it("changeContextToParent moves to the root for a top-level task", () => {
            planManager.changeContextToWithinTask("t2");

            planManager.changeContextToParent("t1");

            expect(planManager.presentContextGoal.id).toBe(GOAL_ID);
        });
    });

    describe("findTask", () => {
        it("returns the full project for GOAL_ID", () => {
            planManager.applyServerState(makeGoal());

            expect(planManager.findTask(GOAL_ID)).toBe(planManager.goal);
        });

        it("finds nested tasks anywhere in the tree", () => {
            planManager.applyServerState(makeGoal());

            expect(planManager.findTask("t1")?.id).toBe("t1");
            expect(planManager.findTask("s1")?.id).toBe("s1");
        });

        it("returns null for unknown ids", () => {
            planManager.applyServerState(makeGoal());

            expect(planManager.findTask("nonexistent")).toBeNull();
        });

        it("returns null for any non-goal id when uninitialized", () => {
            expect(planManager.findTask("t1")).toBeNull();
        });
    });

    describe("findTaskInPresentContext", () => {
        beforeEach(() => {
            planManager.applyServerState(makeGoal());
        });

        it("finds direct children of the present context", () => {
            expect(planManager.findTaskInPresentContext("t1")?.id).toBe("t1");
        });

        it("does not find tasks nested below the present context", () => {
            expect(planManager.findTaskInPresentContext("s1")).toBeNull();
        });

        it("returns a copy of the context task with GOAL_ID for the goal id", () => {
            planManager.changeContextToWithinTask("t2");

            const contextTask = planManager.findTaskInPresentContext(GOAL_ID);

            expect(contextTask?.id).toBe(GOAL_ID);
            expect(contextTask?.name).toBe("Task t2");
        });
    });

    describe("presentContextRoadmap", () => {
        it("returns an empty non-subplan roadmap when uninitialized", () => {
            expect(planManager.presentContextRoadmap).toEqual({
                isSubplan: false,
                tasksList: [],
                dependenciesList: [],
                ancestors: [],
            });
        });

        it("computes task states for the root context", () => {
            planManager.applyServerState(makeGoal());

            const roadmap = planManager.presentContextRoadmap;

            expect(roadmap.isSubplan).toBe(false);
            const t1 = roadmap.tasksList.find((entry) => entry.task.id === "t1");
            const t2 = roadmap.tasksList.find((entry) => entry.task.id === "t2");
            expect(t1?.state).toBe(TaskState.UNBLOCKED);
            expect(t2?.state).toBe(TaskState.BLOCKED);
        });

        it("marks completed tasks and unblocks their dependents", () => {
            planManager.applyServerState(makeGoal({ t1Completed: true }));

            const roadmap = planManager.presentContextRoadmap;

            const t1 = roadmap.tasksList.find((entry) => entry.task.id === "t1");
            const t2 = roadmap.tasksList.find((entry) => entry.task.id === "t2");
            expect(t1?.state).toBe(TaskState.COMPLETED);
            expect(t2?.state).toBe(TaskState.UNBLOCKED);
        });

        it("treats a task with no dependencies at all as ready, not blocked", () => {
            // A task nobody has wired up yet has no path back from the goal, so
            // walking backwards from the goal never reaches it.
            const goal = makeGoal();
            goal.plan.tasksList.push(leaf("orphan"));
            planManager.applyServerState(goal);

            const roadmap = planManager.presentContextRoadmap;

            expect(roadmap.tasksList.find((entry) => entry.task.id === "orphan")?.state).toBe(TaskState.UNBLOCKED);
        });

        it("respects the blockers of a task that does not lead to the goal", () => {
            const goal = makeGoal();
            goal.plan.tasksList.push(leaf("side1"), leaf("side2"));
            goal.plan.dependenciesList.push({ source: "side1", target: "side2" });
            planManager.applyServerState(goal);

            const roadmap = planManager.presentContextRoadmap;

            expect(roadmap.tasksList.find((entry) => entry.task.id === "side1")?.state).toBe(TaskState.UNBLOCKED);
            expect(roadmap.tasksList.find((entry) => entry.task.id === "side2")?.state).toBe(TaskState.BLOCKED);
        });

        it("includes a goal pseudo-task named after the context", () => {
            planManager.applyServerState(makeGoal());
            planManager.changeContextToWithinTask("t2");

            const roadmap = planManager.presentContextRoadmap;

            const goalEntry = roadmap.tasksList.find((entry) => entry.task.id === GOAL_ID);
            expect(goalEntry?.task.name).toBe("Task t2");
        });

        it("flags subplan contexts", () => {
            planManager.applyServerState(makeGoal());
            planManager.changeContextToWithinTask("t2");

            expect(planManager.presentContextRoadmap.isSubplan).toBe(true);
        });

        it("computes subplan task states normally when the owning task is unblocked", () => {
            planManager.applyServerState(makeGoal({ t1Completed: true }));
            planManager.changeContextToWithinTask("t2");

            const roadmap = planManager.presentContextRoadmap;

            const s1 = roadmap.tasksList.find((entry) => entry.task.id === "s1");
            const s2 = roadmap.tasksList.find((entry) => entry.task.id === "s2");
            expect(s1?.state).toBe(TaskState.UNBLOCKED);
            expect(s2?.state).toBe(TaskState.BLOCKED);
        });

        it("blocks every task in a subplan whose owning task is blocked", () => {
            // t2 is blocked by t1, so nothing inside t2's plan can be started yet
            planManager.applyServerState(makeGoal());
            planManager.changeContextToWithinTask("t2");

            const roadmap = planManager.presentContextRoadmap;

            const s1 = roadmap.tasksList.find((entry) => entry.task.id === "s1");
            const s2 = roadmap.tasksList.find((entry) => entry.task.id === "s2");
            expect(s1?.state).toBe(TaskState.BLOCKED);
            expect(s2?.state).toBe(TaskState.BLOCKED);
        });

        it("keeps completed tasks completed inside a blocked subplan", () => {
            const goal = makeGoal();
            const t2 = goal.plan.tasksList.find((task) => task.id === "t2");
            t2.plan.tasksList = [leaf("s1", true), leaf("s2")];
            planManager.applyServerState(goal);
            planManager.changeContextToWithinTask("t2");

            const roadmap = planManager.presentContextRoadmap;

            expect(roadmap.tasksList.find((entry) => entry.task.id === "s1")?.state).toBe(TaskState.COMPLETED);
            expect(roadmap.tasksList.find((entry) => entry.task.id === "s2")?.state).toBe(TaskState.BLOCKED);
        });

        it("leaves an already-finished subplan alone when its owner is blocked", () => {
            const goal = makeGoal();
            const t2 = goal.plan.tasksList.find((task) => task.id === "t2");
            t2.plan.tasksList = [leaf("s1", true), leaf("s2", true)];
            planManager.applyServerState(goal);
            planManager.changeContextToWithinTask("t2");

            const roadmap = planManager.presentContextRoadmap;

            expect(roadmap.tasksList.find((entry) => entry.task.id === "s1")?.state).toBe(TaskState.COMPLETED);
            expect(roadmap.tasksList.find((entry) => entry.task.id === "s2")?.state).toBe(TaskState.COMPLETED);
        });

        it("handles an empty subplan whose owner is blocked", () => {
            const goal = makeGoal();
            const t2 = goal.plan.tasksList.find((task) => task.id === "t2");
            t2.plan = { tasksList: [], dependenciesList: [] };
            planManager.applyServerState(goal);
            planManager.changeContextToWithinTask("t2");

            expect(planManager.presentContextRoadmap.tasksList.map((entry) => entry.task.id)).toEqual([GOAL_ID]);
        });

        it("inherits blocking from an ancestor more than one level up", () => {
            planManager.applyServerState(makeNestedGoal());
            planManager.changeContextToWithinTask("d2");

            const roadmap = planManager.presentContextRoadmap;

            // d1 blocks mid, so mid's subplan and everything below it is blocked
            expect(roadmap.tasksList.find((entry) => entry.task.id === "deep")?.state).toBe(TaskState.BLOCKED);
        });

        it("agrees with allUnblockedTasks about what can be started", () => {
            planManager.applyServerState(makeGoal());
            planManager.changeContextToWithinTask("t2");

            const graphUnblocked = planManager.presentContextRoadmap.tasksList
                .filter((entry) => entry.task.id !== GOAL_ID && entry.state === TaskState.UNBLOCKED)
                .map((entry) => entry.task.id);

            expect(graphUnblocked).toEqual([]);
            expect(planManager.allUnblockedTasks.map((entry) => entry.task.id)).toEqual(["t1"]);
        });

        describe("ancestors", () => {
            it("is just the root goal at the top level", () => {
                planManager.applyServerState(makeGoal());

                expect(planManager.presentContextRoadmap.ancestors).toEqual([{ id: GOAL_ID, name: "Ship product" }]);
            });

            it("lists the full drill-down path, root first", () => {
                planManager.applyServerState(makeNestedGoal());
                planManager.changeContextToWithinTask("d2");

                expect(planManager.presentContextRoadmap.ancestors).toEqual([
                    { id: GOAL_ID, name: "Ship product" },
                    { id: "mid", name: "Task mid" },
                    { id: "d2", name: "Task d2" },
                ]);
            });
        });
    });

    describe("allUnblockedTasks", () => {
        it("returns an empty list when uninitialized", () => {
            expect(planManager.allUnblockedTasks).toEqual([]);
        });

        it("returns unblocked leaf tasks", () => {
            planManager.applyServerState(makeGoal());

            const unblocked = planManager.allUnblockedTasks;

            expect(unblocked.map((entry) => entry.task.id)).toEqual(["t1"]);
        });

        it("includes a task that is not wired up to anything", () => {
            const goal = makeGoal();
            goal.plan.tasksList.push(leaf("orphan"));
            planManager.applyServerState(goal);

            expect(planManager.allUnblockedTasks.map((entry) => entry.task.id)).toContain("orphan");
        });

        it("recurses into the subplans of unblocked tasks", () => {
            planManager.applyServerState(makeGoal({ t1Completed: true }));

            const unblocked = planManager.allUnblockedTasks;

            expect(unblocked.map((entry) => entry.task.id)).toEqual(["s1"]);
        });

        it("leaves the path empty for a task in the top-level plan", () => {
            planManager.applyServerState(makeGoal());

            expect(planManager.allUnblockedTasks[0].path).toEqual([]);
        });

        it("reports the owning task for a nested one, so it can be found", () => {
            planManager.applyServerState(makeGoal({ t1Completed: true }));

            expect(planManager.allUnblockedTasks[0].path).toEqual([{ id: "t2", name: "Task t2" }]);
        });

        it("reports every level of the path for a deeply nested task", () => {
            const goal = makeNestedGoal();
            // Unblock the branch so the walk descends all the way to `deep`
            goal.plan.tasksList.find((task) => task.id === "d1").completionState = true;
            planManager.applyServerState(goal);

            const unblocked = planManager.allUnblockedTasks;

            expect(unblocked.map((entry) => entry.task.id)).toEqual(["deep"]);
            expect(unblocked[0].path).toEqual([
                { id: "mid", name: "Task mid" },
                { id: "d2", name: "Task d2" },
            ]);
        });
    });
});
