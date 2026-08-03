import {
    ProjectStore,
    TaskNotFoundError,
    IdeaNotFoundError,
    InvalidDependencyError,
    InvalidMoveError,
    InvalidIndexError,
    InvalidBatchError,
    VersionConflictError,
    UndoBlockedError,
} from "./projectStore";
import { Author, GOAL_ID, InboxIdea, Task } from "@blossom/common";

// Ids are generated, so assertions about what the inbox holds are about text.
const inboxTexts = (store: ProjectStore): string[] => store.getState().inbox.map((idea) => idea.text);

describe("ProjectStore", () => {
    let store: ProjectStore;

    beforeEach(() => {
        store = new ProjectStore();
    });

    describe("initial state", () => {
        it("should start at version 1 with an empty goal and inbox", () => {
            const state = store.getState();

            expect(state.version).toBe(1);
            expect(state.activeProject).toBeNull();
            expect(state.goal.id).toBe(GOAL_ID);
            expect(state.goal.name).toBe("");
            expect(state.goal.completionState).toBe(false);
            expect(state.goal.plan).toBeNull();
            expect(state.inbox).toEqual([]);
        });

        it("should report the version through getVersion", () => {
            expect(store.getVersion()).toBe(1);
        });
    });

    describe("setGoal", () => {
        it("should set the goal name and create an empty plan", () => {
            store.setGoal("Test Goal");

            const state = store.getState();
            expect(state.goal.name).toBe("Test Goal");
            expect(state.goal.plan).toEqual({ tasksList: [], dependenciesList: [] });
        });

        it("should set the goal description when provided", () => {
            store.setGoal("Test Goal", "Test Description");

            expect(store.getState().goal.description).toBe("Test Description");
        });

        it("should not overwrite an existing plan", () => {
            store.setGoal("Test Goal");
            store.addTask(GOAL_ID, "Task 1");

            store.setGoal("Renamed Goal");

            const state = store.getState();
            expect(state.goal.name).toBe("Renamed Goal");
            expect(state.goal.plan!.tasksList).toHaveLength(1);
        });

        it("should bump the version", () => {
            const before = store.getVersion();

            store.setGoal("Test Goal");

            expect(store.getVersion()).toBe(before + 1);
        });
    });

    describe("version bumping", () => {
        it("should bump the version on every mutation", () => {
            store.setGoal("Goal");
            expect(store.getVersion()).toBe(2);

            const task = store.addTask(GOAL_ID, "Task 1");
            expect(store.getVersion()).toBe(3);

            store.updateTask(task.id, { name: "Renamed" });
            expect(store.getVersion()).toBe(4);

            store.setTaskCompletion(task.id, true);
            expect(store.getVersion()).toBe(5);

            store.addIdea("idea");
            expect(store.getVersion()).toBe(6);

            store.undo();
            expect(store.getVersion()).toBe(7);
        });
    });

    describe("addTask", () => {
        beforeEach(() => {
            store.setGoal("Goal");
        });

        it("should add a task to the root goal's plan", () => {
            const task = store.addTask(GOAL_ID, "Task 1");

            const state = store.getState();
            expect(state.goal.plan!.tasksList).toHaveLength(1);
            expect(state.goal.plan!.tasksList[0].name).toBe("Task 1");
            expect(state.goal.plan!.tasksList[0].id).toBe(task.id);
            expect(task.completionState).toBe(false);
            expect(task.plan).toBeNull();
        });

        it("should set the description when provided", () => {
            const task = store.addTask(GOAL_ID, "Task 1", "A description");

            expect(task.description).toBe("A description");
            expect(store.getState().goal.plan!.tasksList[0].description).toBe("A description");
        });

        it("should add a nested task via parentId, creating a subplan if needed", () => {
            const parent = store.addTask(GOAL_ID, "Parent");

            const child = store.addTask(parent.id, "Child");

            const state = store.getState();
            const storedParent = state.goal.plan!.tasksList[0];
            expect(storedParent.plan!.tasksList).toHaveLength(1);
            expect(storedParent.plan!.tasksList[0].id).toBe(child.id);
            expect(storedParent.plan!.tasksList[0].name).toBe("Child");
        });

        it("should reset the parent's completionState when a new task is added", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            const child = store.addTask(parent.id, "Child");
            store.setTaskCompletion(child.id, true);
            expect(store.findTask(parent.id)!.completionState).toBe(true);

            store.addTask(parent.id, "Another child");

            expect(store.findTask(parent.id)!.completionState).toBe(false);
        });

        it("should create the task with an empty subplan when asked to", () => {
            const task = store.addTask(GOAL_ID, "Run the launch", undefined, true);

            expect(task.plan).toEqual({ tasksList: [], dependenciesList: [] });
            expect(store.findTask(task.id)!.plan).toEqual({ tasksList: [], dependenciesList: [] });
        });

        it("should throw TaskNotFoundError for an unknown parent", () => {
            expect(() => store.addTask("unknown", "Task")).toThrow(TaskNotFoundError);
        });

        it("should return a deep clone that does not alias store state", () => {
            const task = store.addTask(GOAL_ID, "Task 1");

            task.name = "Mutated";

            expect(store.getState().goal.plan!.tasksList[0].name).toBe("Task 1");
        });
    });

    describe("updateTask", () => {
        beforeEach(() => {
            store.setGoal("Goal");
        });

        it("should update the task name", () => {
            const task = store.addTask(GOAL_ID, "Original");

            store.updateTask(task.id, { name: "Renamed" });

            expect(store.findTask(task.id)!.name).toBe("Renamed");
        });

        it("should update the task description", () => {
            const task = store.addTask(GOAL_ID, "Task");

            store.updateTask(task.id, { description: "New description" });

            expect(store.findTask(task.id)!.description).toBe("New description");
        });

        it("should ignore an empty name", () => {
            const task = store.addTask(GOAL_ID, "Original");

            store.updateTask(task.id, { name: "" });

            expect(store.findTask(task.id)!.name).toBe("Original");
        });

        it("should update the goal via GOAL_ID", () => {
            store.updateTask(GOAL_ID, { name: "New Goal Name", description: "Desc" });

            const state = store.getState();
            expect(state.goal.name).toBe("New Goal Name");
            expect(state.goal.description).toBe("Desc");
        });

        it("should throw TaskNotFoundError for an unknown task", () => {
            expect(() => store.updateTask("unknown", { name: "X" })).toThrow(TaskNotFoundError);
        });
    });

    describe("setTaskCompletion", () => {
        beforeEach(() => {
            store.setGoal("Goal");
        });

        it("should set completion with an explicit boolean", () => {
            const task = store.addTask(GOAL_ID, "Task");

            store.setTaskCompletion(task.id, true);
            expect(store.findTask(task.id)!.completionState).toBe(true);

            // Setting the same value again is a no-op on state but still allowed
            store.setTaskCompletion(task.id, true);
            expect(store.findTask(task.id)!.completionState).toBe(true);

            store.setTaskCompletion(task.id, false);
            expect(store.findTask(task.id)!.completionState).toBe(false);
        });

        it("should propagate completion up through parents when all subtasks complete", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            const mid = store.addTask(parent.id, "Mid");
            const leaf = store.addTask(mid.id, "Leaf");

            store.setTaskCompletion(leaf.id, true);

            expect(store.findTask(leaf.id)!.completionState).toBe(true);
            expect(store.findTask(mid.id)!.completionState).toBe(true);
            expect(store.findTask(parent.id)!.completionState).toBe(true);
        });

        it("should not complete a parent while a sibling subtask is incomplete", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            const child1 = store.addTask(parent.id, "Child 1");
            store.addTask(parent.id, "Child 2");

            store.setTaskCompletion(child1.id, true);

            expect(store.findTask(child1.id)!.completionState).toBe(true);
            expect(store.findTask(parent.id)!.completionState).toBe(false);
        });

        it("should propagate incompleteness up through parents", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            const mid = store.addTask(parent.id, "Mid");
            const leaf = store.addTask(mid.id, "Leaf");
            store.setTaskCompletion(leaf.id, true);
            expect(store.findTask(parent.id)!.completionState).toBe(true);

            store.setTaskCompletion(leaf.id, false);

            expect(store.findTask(leaf.id)!.completionState).toBe(false);
            expect(store.findTask(mid.id)!.completionState).toBe(false);
            expect(store.findTask(parent.id)!.completionState).toBe(false);
        });

        it("should throw when trying to set completion of the goal", () => {
            expect(() => store.setTaskCompletion(GOAL_ID, true)).toThrow(InvalidDependencyError);
        });

        it("should throw TaskNotFoundError for an unknown task", () => {
            expect(() => store.setTaskCompletion("unknown", true)).toThrow(TaskNotFoundError);
        });
    });

    describe("removeTask", () => {
        beforeEach(() => {
            store.setGoal("Goal");
        });

        it("should remove the task from its container's plan", () => {
            const task1 = store.addTask(GOAL_ID, "Task 1");
            store.addTask(GOAL_ID, "Task 2");

            store.removeTask(task1.id);

            const tasksList = store.getState().goal.plan!.tasksList;
            expect(tasksList).toHaveLength(1);
            expect(tasksList[0].name).toBe("Task 2");
        });

        it("should remove dependencies referencing the task in its scope", () => {
            const task1 = store.addTask(GOAL_ID, "Task 1");
            const task2 = store.addTask(GOAL_ID, "Task 2");
            const task3 = store.addTask(GOAL_ID, "Task 3");
            store.addDependency(task1.id, task2.id);
            store.addDependency(task2.id, task3.id);
            store.addDependency(task1.id, task3.id);

            store.removeTask(task2.id);

            const dependenciesList = store.getState().goal.plan!.dependenciesList;
            expect(dependenciesList).toEqual([{ source: task1.id, target: task3.id }]);
        });

        it("should recompute the container's completionState", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            const done = store.addTask(parent.id, "Done");
            const notDone = store.addTask(parent.id, "Not done");
            store.setTaskCompletion(done.id, true);
            expect(store.findTask(parent.id)!.completionState).toBe(false);

            store.removeTask(notDone.id);

            expect(store.findTask(parent.id)!.completionState).toBe(true);
        });

        it("should remove a nested task from within a subplan", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            const child = store.addTask(parent.id, "Child");

            store.removeTask(child.id);

            expect(store.findTask(child.id)).toBeNull();
            expect(store.findTask(parent.id)!.plan!.tasksList).toHaveLength(0);
        });

        it("should throw TaskNotFoundError for an unknown task", () => {
            expect(() => store.removeTask("unknown")).toThrow(TaskNotFoundError);
        });
    });

    describe("createSubplan", () => {
        beforeEach(() => {
            store.setGoal("Goal");
        });

        it("should give a task an empty subplan", () => {
            const task = store.addTask(GOAL_ID, "Task");

            store.createSubplan(task.id);

            expect(store.findTask(task.id)!.plan).toEqual({ tasksList: [], dependenciesList: [] });
        });

        it("should not overwrite an existing subplan", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            store.addTask(parent.id, "Child");

            store.createSubplan(parent.id);

            expect(store.findTask(parent.id)!.plan!.tasksList).toHaveLength(1);
        });

        it("should throw TaskNotFoundError for an unknown task", () => {
            expect(() => store.createSubplan("unknown")).toThrow(TaskNotFoundError);
        });
    });

    describe("pasteTasks", () => {
        beforeEach(() => {
            store.setGoal("Goal");
        });

        it("should paste tasks with fresh ids, remap dependencies and preserve nested plans", () => {
            const subtask1: Task = { id: "s1", name: "Subtask 1", completionState: false, plan: null };
            const subtask2: Task = { id: "s2", name: "Subtask 2", completionState: true, plan: null };
            const parentTask: Task = {
                id: "t2",
                name: "Parent",
                completionState: false,
                plan: {
                    tasksList: [subtask1, subtask2],
                    dependenciesList: [
                        { source: "s1", target: "s2" },
                        { source: "s2", target: GOAL_ID },
                    ],
                },
            };
            const simpleTask: Task = { id: "t1", name: "Simple", completionState: true, plan: null };
            const dependencies = [
                { source: "t1", target: "t2" }, // valid: both pasted
                { source: "t1", target: "missing" }, // invalid: should be dropped
            ];

            store.pasteTasks(GOAL_ID, [simpleTask, parentTask], dependencies);

            const plan = store.getState().goal.plan!;
            expect(plan.tasksList).toHaveLength(2);
            const pastedSimple = plan.tasksList.find((t) => t.name === "Simple")!;
            const pastedParent = plan.tasksList.find((t) => t.name === "Parent")!;
            expect(pastedSimple.id).not.toBe("t1");
            expect(pastedParent.id).not.toBe("t2");

            // Only the valid dependency survives, remapped to the new ids
            expect(plan.dependenciesList).toEqual([{ source: pastedSimple.id, target: pastedParent.id }]);

            // Nested subplan preserved with remapped ids; GOAL_ID target kept
            const pastedSub1 = pastedParent.plan!.tasksList.find((t) => t.name === "Subtask 1")!;
            const pastedSub2 = pastedParent.plan!.tasksList.find((t) => t.name === "Subtask 2")!;
            expect(pastedSub1.id).not.toBe("s1");
            expect(pastedSub2.id).not.toBe("s2");
            expect(pastedParent.plan!.dependenciesList).toEqual([
                { source: pastedSub1.id, target: pastedSub2.id },
                { source: pastedSub2.id, target: GOAL_ID },
            ]);
        });

        it("should mark the parent complete when all pasted tasks are complete", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            const completed1: Task = { id: "c1", name: "Done 1", completionState: true, plan: null };
            const completed2: Task = { id: "c2", name: "Done 2", completionState: true, plan: null };

            store.pasteTasks(parent.id, [completed1, completed2], [{ source: "c1", target: "c2" }]);

            const storedParent = store.findTask(parent.id)!;
            expect(storedParent.plan!.tasksList).toHaveLength(2);
            expect(storedParent.plan!.dependenciesList).toHaveLength(1);
            expect(storedParent.completionState).toBe(true);
        });

        it("should append pasted tasks without altering existing ones", () => {
            const existing = store.addTask(GOAL_ID, "Existing");
            const newTask: Task = { id: "n1", name: "New", completionState: false, plan: null };

            store.pasteTasks(GOAL_ID, [newTask], []);

            const tasksList = store.getState().goal.plan!.tasksList;
            expect(tasksList).toHaveLength(2);
            expect(tasksList.find((t) => t.id === existing.id)).toBeDefined();
            const pastedNew = tasksList.find((t) => t.name === "New")!;
            expect(pastedNew.id).not.toBe("n1");
        });

        it("should throw TaskNotFoundError for an unknown parent", () => {
            expect(() => store.pasteTasks("unknown", [], [])).toThrow(TaskNotFoundError);
        });
    });

    describe("dependencies", () => {
        let task1: Task;
        let task2: Task;
        let task3: Task;

        beforeEach(() => {
            store.setGoal("Goal");
            task1 = store.addTask(GOAL_ID, "Task 1");
            task2 = store.addTask(GOAL_ID, "Task 2");
            task3 = store.addTask(GOAL_ID, "Task 3");
        });

        describe("addDependency", () => {
            it("should add a dependency between siblings", () => {
                store.addDependency(task1.id, task2.id);

                expect(store.getState().goal.plan!.dependenciesList).toEqual([{ source: task1.id, target: task2.id }]);
            });

            it("should allow the goal as a target", () => {
                store.addDependency(task1.id, GOAL_ID);

                expect(store.getState().goal.plan!.dependenciesList).toEqual([{ source: task1.id, target: GOAL_ID }]);
            });

            it("should throw InvalidDependencyError for a self-dependency", () => {
                expect(() => store.addDependency(task1.id, task1.id)).toThrow(InvalidDependencyError);
                expect(store.getState().goal.plan!.dependenciesList).toHaveLength(0);
            });

            it("should throw TaskNotFoundError when the source does not exist", () => {
                expect(() => store.addDependency("unknown", task1.id)).toThrow(TaskNotFoundError);
            });

            it("should throw InvalidDependencyError when the target is not a sibling", () => {
                const child = store.addTask(task1.id, "Child");

                // Target lives in a different scope than the source
                expect(() => store.addDependency(task2.id, child.id)).toThrow(InvalidDependencyError);
                expect(() => store.addDependency(child.id, task2.id)).toThrow(InvalidDependencyError);
                expect(() => store.addDependency(task2.id, "unknown")).toThrow(InvalidDependencyError);
            });

            it("should name both ends and their plans when an edge crosses plans", () => {
                const child = store.addTask(task1.id, "Child");

                expect(() => store.addDependency(task2.id, child.id)).toThrow(
                    '"Task 2" -> "Child" crosses plans: the source is in the top-level plan and the ' +
                        'target is in the subplan of "Task 1"',
                );
                expect(() => store.addDependency(child.id, task2.id)).toThrow(
                    '"Child" -> "Task 2" crosses plans: the source is in the subplan of "Task 1" and the ' +
                        "target is in the top-level plan",
                );
            });

            it("should say a crossing edge belongs between the tasks whose subplans hold the ends", () => {
                const child = store.addTask(task1.id, "Child");

                expect(() => store.addDependency(task2.id, child.id)).toThrow(
                    /add the edge between the tasks whose subplans hold them/,
                );
            });

            it("should name the source when the target id matches no task at all", () => {
                expect(() => store.addDependency(task1.id, "unknown")).toThrow(
                    /Target of "Task 1" \(.*\).*no task has the id unknown/,
                );
            });

            it("should throw InvalidDependencyError when the dependency would create a cycle", () => {
                store.addDependency(task1.id, task2.id);
                store.addDependency(task2.id, task3.id);

                expect(() => store.addDependency(task3.id, task1.id)).toThrow(InvalidDependencyError);
                expect(store.getState().goal.plan!.dependenciesList).toHaveLength(2);
            });
        });

        describe("removeDependency", () => {
            it("should remove only the matching dependency", () => {
                store.addDependency(task1.id, task2.id);
                store.addDependency(task2.id, task3.id);

                store.removeDependency(task1.id, task2.id);

                expect(store.getState().goal.plan!.dependenciesList).toEqual([{ source: task2.id, target: task3.id }]);
            });

            it("should throw TaskNotFoundError when the source does not exist", () => {
                expect(() => store.removeDependency("unknown", task1.id)).toThrow(TaskNotFoundError);
            });
        });

        describe("updateDependency", () => {
            it("should update an existing dependency", () => {
                store.addDependency(task1.id, task2.id);

                store.updateDependency(task1.id, task2.id, task1.id, task3.id);

                expect(store.getState().goal.plan!.dependenciesList).toEqual([{ source: task1.id, target: task3.id }]);
            });

            it("should throw InvalidDependencyError when the dependency does not exist", () => {
                store.addDependency(task1.id, task2.id);

                expect(() => store.updateDependency(task1.id, task3.id, task2.id, task3.id)).toThrow(
                    InvalidDependencyError,
                );
                expect(store.getState().goal.plan!.dependenciesList).toEqual([{ source: task1.id, target: task2.id }]);
            });

            it("should throw TaskNotFoundError when the old source does not exist", () => {
                expect(() => store.updateDependency("unknown", task1.id, task2.id, task3.id)).toThrow(
                    TaskNotFoundError,
                );
            });
        });
    });

    describe("inbox", () => {
        it("should prepend new ideas and give each a distinct id", () => {
            const first = store.addIdea("first");
            const second = store.addIdea("second");

            expect(inboxTexts(store)).toEqual(["second", "first"]);
            expect(store.getState().inbox.map((idea) => idea.id)).toEqual([second.id, first.id]);
            expect(first.id).not.toBe(second.id);
        });

        it("should keep an idea's id as the ideas around it change", () => {
            const idea = store.addIdea("keep me");
            const newer = store.addIdea("newer");
            store.addIdea("newer still");

            store.removeIdea({ ideaId: newer.id });

            expect(store.findIdea(idea.id)).toEqual({ id: idea.id, text: "keep me" });
        });

        it("should update an idea addressed by id, wherever it now sits", () => {
            const first = store.addIdea("first");
            store.addIdea("second");

            const updated = store.updateIdea({ ideaId: first.id }, "updated");

            expect(updated).toEqual({ id: first.id, text: "updated" });
            expect(inboxTexts(store)).toEqual(["second", "updated"]);
        });

        it("should update an idea at an index", () => {
            store.addIdea("first");
            store.addIdea("second");

            store.updateIdea(1, "updated");

            expect(inboxTexts(store)).toEqual(["second", "updated"]);
        });

        it("should remove an idea addressed by id and return it", () => {
            store.addIdea("first");
            const second = store.addIdea("second");

            const removed = store.removeIdea({ ideaId: second.id });

            expect(removed).toEqual({ id: second.id, text: "second" });
            expect(inboxTexts(store)).toEqual(["first"]);
        });

        it("should remove an idea at an index", () => {
            store.addIdea("first");
            store.addIdea("second");

            store.removeIdea(0);

            expect(inboxTexts(store)).toEqual(["first"]);
        });

        it("should prefer ideaId over index when both are given", () => {
            const first = store.addIdea("first");
            store.addIdea("second");

            store.removeIdea({ ideaId: first.id, index: 0 });

            expect(inboxTexts(store)).toEqual(["second"]);
        });

        it("should throw IdeaNotFoundError for an id the inbox no longer holds", () => {
            const idea = store.addIdea("promote me");
            store.setGoal("Goal");
            store.promoteIdea({ ideaId: idea.id });

            expect(() => store.promoteIdea({ ideaId: idea.id })).toThrow(IdeaNotFoundError);
            expect(() => store.removeIdea({ ideaId: "never existed" })).toThrow(IdeaNotFoundError);
        });

        it("should build each task from the idea whose id was passed, whatever the order", () => {
            store.setGoal("Goal");
            const added = ["a", "b", "c", "d", "e"].map((text) => store.addIdea(text));
            const shuffled = [added[3], added[0], added[4], added[1], added[2]];

            const tasks = shuffled.map((idea) => store.promoteIdea({ ideaId: idea.id }));

            expect(tasks.map((task) => task.name)).toEqual(shuffled.map((idea) => idea.text));
            expect(inboxTexts(store)).toEqual([]);
        });

        it("should take the name and description passed over the idea's text", () => {
            store.setGoal("Goal");
            const idea = store.addIdea("we should probably sort out the venue at some point");

            const task = store.promoteIdea({ ideaId: idea.id }, GOAL_ID, undefined, {
                name: "Book venue",
                description: "Seats 80, within 20 minutes of the station",
            });

            expect(task.name).toBe("Book venue");
            expect(task.description).toBe("Seats 80, within 20 minutes of the station");
        });

        it("should add several ideas as one change", () => {
            const versionBefore = store.getVersion();

            const added = store.addIdeas(["a", "b", "c"]);

            expect(added.map((idea) => idea.text)).toEqual(["a", "b", "c"]);
            expect(inboxTexts(store)).toEqual(["c", "b", "a"]);
            expect(store.getVersion()).toBe(versionBefore + 1);
        });

        it("should find an idea by text, ignoring case and surrounding space", () => {
            const idea = store.addIdea("Book the venue");

            expect(store.findIdeaByText("  book the   VENUE ")).toEqual({ id: idea.id, text: "Book the venue" });
            expect(store.findIdeaByText("book a venue")).toBeNull();
            expect(store.findIdeaByText("   ")).toBeNull();
        });

        it("should promote an idea to a task under the root goal by default", () => {
            store.setGoal("Goal");
            store.addIdea("great idea");

            const task = store.promoteIdea(0);

            const state = store.getState();
            expect(state.inbox).toEqual([]);
            expect(state.goal.plan!.tasksList).toHaveLength(1);
            expect(state.goal.plan!.tasksList[0].id).toBe(task.id);
            expect(state.goal.plan!.tasksList[0].name).toBe("great idea");
            expect(task.completionState).toBe(false);
        });

        it("should promote an idea under a specific parent and reset its completionState", () => {
            store.setGoal("Goal");
            const parent = store.addTask(GOAL_ID, "Parent");
            const child = store.addTask(parent.id, "Child");
            store.setTaskCompletion(child.id, true);
            expect(store.findTask(parent.id)!.completionState).toBe(true);
            store.addIdea("promoted");

            const task = store.promoteIdea(0, parent.id);

            const storedParent = store.findTask(parent.id)!;
            expect(storedParent.plan!.tasksList).toHaveLength(2);
            expect(storedParent.plan!.tasksList[1].id).toBe(task.id);
            expect(storedParent.completionState).toBe(false);
            expect(inboxTexts(store)).toEqual([]);
        });

        it("should throw TaskNotFoundError when promoting to an unknown parent", () => {
            store.addIdea("idea");

            expect(() => store.promoteIdea(0, "unknown")).toThrow(TaskNotFoundError);
            expect(inboxTexts(store)).toEqual(["idea"]);
        });

        it("should throw InvalidIndexError for out-of-range or non-integer indices", () => {
            store.addIdea("idea");

            expect(() => store.updateIdea(-1, "x")).toThrow(InvalidIndexError);
            expect(() => store.updateIdea(1, "x")).toThrow(InvalidIndexError);
            expect(() => store.updateIdea(0.5, "x")).toThrow(InvalidIndexError);
            expect(() => store.removeIdea(1)).toThrow(InvalidIndexError);
            expect(() => store.promoteIdea(1)).toThrow(InvalidIndexError);
        });
    });

    describe("undo", () => {
        it("should return false when there is nothing to undo", () => {
            const before = store.getVersion();

            expect(store.undo()).toBe(false);
            expect(store.getVersion()).toBe(before);
        });

        it("should undo adding a task", () => {
            store.setGoal("Goal");
            store.addTask(GOAL_ID, "Task 1");
            expect(store.getState().goal.plan!.tasksList).toHaveLength(1);

            expect(store.undo()).toBe(true);

            expect(store.getState().goal.plan!.tasksList).toHaveLength(0);
        });

        it("should undo removing a task", () => {
            store.setGoal("Goal");
            const task = store.addTask(GOAL_ID, "Task 1");
            store.removeTask(task.id);
            expect(store.getState().goal.plan!.tasksList).toHaveLength(0);

            store.undo();

            const tasksList = store.getState().goal.plan!.tasksList;
            expect(tasksList).toHaveLength(1);
            expect(tasksList[0].name).toBe("Task 1");
        });

        it("should restore both the goal and the inbox", () => {
            store.setGoal("Goal");
            store.addIdea("idea");

            store.promoteIdea(0);
            expect(inboxTexts(store)).toEqual([]);
            expect(store.getState().goal.plan!.tasksList).toHaveLength(1);

            store.undo();

            expect(inboxTexts(store)).toEqual(["idea"]);
            expect(store.getState().goal.plan!.tasksList).toHaveLength(0);
        });

        it("should support multiple undos in sequence", () => {
            store.setGoal("Goal");
            store.addTask(GOAL_ID, "Task 1");
            store.addTask(GOAL_ID, "Task 2");
            store.addTask(GOAL_ID, "Task 3");

            store.undo();
            expect(store.getState().goal.plan!.tasksList).toHaveLength(2);
            store.undo();
            expect(store.getState().goal.plan!.tasksList).toHaveLength(1);
            store.undo();
            expect(store.getState().goal.plan!.tasksList).toHaveLength(0);
        });

        it("should bump the version on a successful undo", () => {
            store.addIdea("idea");
            const before = store.getVersion();

            store.undo();

            expect(store.getVersion()).toBe(before + 1);
        });

        it("should cap the undo stack at 50 snapshots", () => {
            for (let i = 0; i < 55; i++) {
                store.addIdea(`idea ${i}`);
            }

            let undoCount = 0;
            while (store.undo()) {
                undoCount++;
            }

            expect(undoCount).toBe(50);
            // Oldest 5 snapshots were dropped, so 5 ideas remain
            expect(inboxTexts(store)).toHaveLength(5);
        });
    });

    describe("load", () => {
        it("should load a goal and inbox and set the active project", () => {
            const goal: Task = {
                id: GOAL_ID,
                name: "Loaded Goal",
                completionState: false,
                plan: {
                    tasksList: [{ id: "1", name: "Task 1", completionState: false, plan: null }],
                    dependenciesList: [{ source: "1", target: GOAL_ID }],
                },
            };

            store.load(goal, [{ id: "idea-1", text: "idea" }], "myProject");

            const state = store.getState();
            expect(state.goal.name).toBe("Loaded Goal");
            expect(state.goal.plan!.tasksList).toHaveLength(1);
            expect(state.inbox).toEqual([{ id: "idea-1", text: "idea" }]);
            expect(state.activeProject).toBe("myProject");
            expect(store.activeProject).toBe("myProject");
        });

        it("should normalize a legacy empty root id to GOAL_ID", () => {
            const legacyGoal: Task = {
                id: "",
                name: "Legacy",
                completionState: false,
                plan: { tasksList: [], dependenciesList: [] },
            };

            store.load(legacyGoal, [], "legacy");

            expect(store.getState().goal.id).toBe(GOAL_ID);
            expect(store.findTask(GOAL_ID)!.name).toBe("Legacy");
        });

        it("should tolerate a null plan", () => {
            const goal: Task = { id: GOAL_ID, name: "No plan", completionState: false, plan: null };

            store.load(goal, [], null);

            expect(store.getState().goal.plan).toBeNull();
        });

        it("should clear the undo stack and bump the version", () => {
            store.addIdea("idea");
            const before = store.getVersion();
            const goal: Task = { id: GOAL_ID, name: "Loaded", completionState: false, plan: null };

            store.load(goal, [], "project");

            expect(store.getVersion()).toBe(before + 1);
            expect(store.undo()).toBe(false);
        });

        it("should not alias the caller's goal object", () => {
            const goal: Task = { id: GOAL_ID, name: "Loaded", completionState: false, plan: null };

            store.load(goal, [], null);
            goal.name = "Mutated";

            expect(store.getState().goal.name).toBe("Loaded");
        });
    });

    describe("reset", () => {
        it("should restore the empty initial state and clear the undo stack", () => {
            store.setGoal("Goal");
            store.addTask(GOAL_ID, "Task");
            store.addIdea("idea");
            store.setActiveProject("project");
            const before = store.getVersion();

            store.reset();

            const state = store.getState();
            expect(state.goal.name).toBe("");
            expect(state.goal.plan).toBeNull();
            expect(state.inbox).toEqual([]);
            expect(state.activeProject).toBeNull();
            expect(store.getVersion()).toBe(before + 1);
            expect(store.undo()).toBe(false);
        });
    });

    describe("setActiveProject", () => {
        it("should set the active project and bump the version", () => {
            const before = store.getVersion();

            store.setActiveProject("myProject");

            expect(store.activeProject).toBe("myProject");
            expect(store.getVersion()).toBe(before + 1);
        });
    });

    describe("getNextTasks", () => {
        it("should return an empty list when there is no plan", () => {
            expect(store.getNextTasks()).toEqual([]);
        });

        it("should return unblocked leaf tasks, descending into unblocked subplans", () => {
            const goal: Task = {
                id: GOAL_ID,
                name: "Goal",
                completionState: false,
                plan: {
                    tasksList: [
                        { id: "0", name: "Task 1", completionState: true, plan: null },
                        {
                            id: "1",
                            name: "Task 2",
                            completionState: false,
                            plan: {
                                tasksList: [{ id: "3", name: "Subtask 1", completionState: false, plan: null }],
                                dependenciesList: [{ source: "3", target: GOAL_ID }],
                            },
                        },
                        { id: "2", name: "Task 3", completionState: false, plan: null },
                    ],
                    dependenciesList: [
                        { source: "0", target: "1" },
                        { source: "1", target: GOAL_ID },
                        { source: "2", target: GOAL_ID },
                    ],
                },
            };
            store.load(goal, [], null);

            const nextTasks = store.getNextTasks();

            expect(nextTasks.map((task) => task.id)).toEqual(["3", "2"]);
        });

        it("should exclude tasks blocked by incomplete dependencies", () => {
            store.setGoal("Goal");
            const task1 = store.addTask(GOAL_ID, "Task 1");
            const task2 = store.addTask(GOAL_ID, "Task 2");
            store.addDependency(task1.id, task2.id);
            store.addDependency(task2.id, GOAL_ID);

            expect(store.getNextTasks().map((task) => task.id)).toEqual([task1.id]);

            store.setTaskCompletion(task1.id, true);

            expect(store.getNextTasks().map((task) => task.id)).toEqual([task2.id]);
        });

        it("should return deep clones", () => {
            store.setGoal("Goal");
            const task = store.addTask(GOAL_ID, "Task 1");
            store.addDependency(task.id, GOAL_ID);

            const nextTasks = store.getNextTasks();
            nextTasks[0].name = "Mutated";

            expect(store.getState().goal.plan!.tasksList[0].name).toBe("Task 1");
        });
    });

    describe("getState", () => {
        it("should return a deep clone that does not alias internal state", () => {
            store.setGoal("Goal");
            store.addTask(GOAL_ID, "Task 1");
            store.addIdea("idea");

            const state = store.getState();
            state.goal.name = "Mutated";
            state.goal.plan!.tasksList.pop();
            state.inbox.pop();

            const fresh = store.getState();
            expect(fresh.goal.name).toBe("Goal");
            expect(fresh.goal.plan!.tasksList).toHaveLength(1);
            expect(fresh.inbox.map((idea) => idea.text)).toEqual(["idea"]);
        });
    });

    describe("findTask", () => {
        it("should return the goal for GOAL_ID even without a plan", () => {
            const found = store.findTask(GOAL_ID);

            expect(found).not.toBeNull();
            expect(found!.id).toBe(GOAL_ID);
        });

        it("should find deeply nested tasks", () => {
            store.setGoal("Goal");
            const parent = store.addTask(GOAL_ID, "Parent");
            const child = store.addTask(parent.id, "Child");
            const grandchild = store.addTask(child.id, "Grandchild");

            expect(store.findTask(grandchild.id)!.name).toBe("Grandchild");
        });

        it("should return null for unknown ids", () => {
            store.setGoal("Goal");

            expect(store.findTask("unknown")).toBeNull();
        });
    });

    describe("change notification", () => {
        const ana: Author = { id: "ana", kind: "person" };

        it("should notify listeners on every mutation", () => {
            const listener = jest.fn();
            store.onChange(listener);

            store.setGoal("Ship it");
            store.addIdea("an idea");

            expect(listener).toHaveBeenCalledTimes(2);
        });

        it("should stop notifying once unsubscribed", () => {
            const listener = jest.fn();
            const unsubscribe = store.onChange(listener);

            unsubscribe();
            store.setGoal("Ship it");

            expect(listener).not.toHaveBeenCalled();
        });

        it("should not let a broken listener fail the mutation that triggered it", () => {
            const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
            const healthy = jest.fn();
            store.onChange(() => {
                throw new Error("listener exploded");
            });
            store.onChange(healthy);

            expect(() => store.setGoal("Ship it")).not.toThrow();
            expect(store.getState().goal.name).toBe("Ship it");
            expect(healthy).toHaveBeenCalled();

            consoleError.mockRestore();
        });

        it("should report who made the most recent change", () => {
            store.runAs(ana, () => store.setGoal("Ship it"));

            expect(store.lastChangeAuthor).toEqual(ana);
        });

        it("should leave changes made outside runAs unattributed", () => {
            store.setGoal("Ship it");

            expect(store.lastChangeAuthor).toBeNull();
        });

        it("should restore the previous author after runAs returns", () => {
            store.runAs(ana, () => store.setGoal("Ship it"));
            store.addIdea("later, by nobody in particular");

            expect(store.lastChangeAuthor).toBeNull();
        });
    });

    describe("preconditions", () => {
        it("should reject a write whose baseVersion is behind", () => {
            store.setGoal("Ship it");
            const stale = store.getVersion();
            store.addIdea("meanwhile, something else happened");

            expect(() => store.setGoal("Ship something else", undefined, stale)).toThrow(VersionConflictError);
        });

        it("should accept a write whose baseVersion is current", () => {
            store.setGoal("Ship it");

            expect(() => store.setGoal("Ship it well", undefined, store.getVersion())).not.toThrow();
        });

        it("should reject a task update whose baseVersion is behind", () => {
            store.setGoal("Ship it");
            const task = store.addTask(GOAL_ID, "Do the thing");
            const stale = store.getVersion();
            store.addIdea("meanwhile");

            expect(() => store.updateTask(task.id, { name: "Renamed", baseVersion: stale })).toThrow(
                VersionConflictError,
            );
        });

        it("should reject an inbox update whose row no longer holds the expected text", () => {
            store.addIdea("theirs");

            expect(() => store.updateIdea(0, "mine", "something else")).toThrow(VersionConflictError);
            expect(inboxTexts(store)).toEqual(["theirs"]);
        });

        it("should reject a removal aimed at a row that has shifted underneath", () => {
            store.addIdea("second");
            // Adding unshifts, so index 0 is no longer the row the caller saw.
            store.addIdea("first");

            expect(() => store.removeIdea(0, "second")).toThrow(VersionConflictError);
            expect(inboxTexts(store)).toEqual(["first", "second"]);
        });

        it("should allow an inbox write whose expected text still matches", () => {
            store.addIdea("mine");

            expect(() => store.updateIdea(0, "mine, edited", "mine")).not.toThrow();
            expect(inboxTexts(store)).toEqual(["mine, edited"]);
        });

        it("should ignore preconditions that were not supplied", () => {
            store.addIdea("whatever");

            expect(() => store.updateIdea(0, "changed")).not.toThrow();
        });
    });

    describe("author-scoped undo", () => {
        const ana: Author = { id: "ana", kind: "person" };
        const ben: Author = { id: "ben", kind: "person" };

        it("should undo your own most recent change", () => {
            store.runAs(ana, () => store.setGoal("Ship it"));
            store.runAs(ana, () => store.addTask(GOAL_ID, "Do the thing"));

            expect(store.runAs(ana, () => store.undo())).toBe(true);
            expect(store.getState().goal.plan.tasksList).toHaveLength(0);
        });

        it("should refuse to revert somebody else's change", () => {
            store.runAs(ana, () => store.setGoal("Ana's goal"));

            expect(() => store.runAs(ben, () => store.undo())).toThrow(UndoBlockedError);
            expect(store.getState().goal.name).toBe("Ana's goal");
        });

        it("should explain that somebody else stands in the way", () => {
            store.runAs(ana, () => store.setGoal("Ana's goal"));

            expect(() => store.runAs(ben, () => store.undo())).toThrow(
                "Someone else has changed the project since your last change",
            );
        });

        it("should call out the assistant by role when it made the change", () => {
            store.runAs({ id: "mcp", kind: "assistant" }, () => store.setGoal("Set over MCP"));

            expect(() => store.runAs(ana, () => store.undo())).toThrow(
                "The assistant has changed the project since your last change",
            );
        });

        it("should report who the next undo would affect", () => {
            store.runAs(ana, () => store.setGoal("Ana's goal"));

            expect(store.undoableBy).toEqual(ana);
        });

        it("should stay unrestricted when nobody is identified", () => {
            store.setGoal("Ship it");

            expect(store.undo()).toBe(true);
        });
    });

    describe("promoteAllIdeas", () => {
        it("should promote every idea into the parent plan", () => {
            store.addIdea("c");
            store.addIdea("b");
            store.addIdea("a");

            const promoted = store.promoteAllIdeas(GOAL_ID);

            expect(promoted.map((task) => task.name)).toEqual(["a", "b", "c"]);
            expect(inboxTexts(store)).toEqual([]);
            expect(store.getState().goal.plan.tasksList).toHaveLength(3);
        });

        it("should count as a single change, so one undo puts every idea back", () => {
            store.addIdea("b");
            store.addIdea("a");

            store.promoteAllIdeas(GOAL_ID);
            store.undo();

            expect(inboxTexts(store)).toEqual(["a", "b"]);
        });

        it("should do nothing for an empty inbox", () => {
            const versionBefore = store.getVersion();

            expect(store.promoteAllIdeas(GOAL_ID)).toEqual([]);
            expect(store.getVersion()).toBe(versionBefore);
        });

        it("should throw for an unknown parent", () => {
            store.addIdea("a");

            expect(() => store.promoteAllIdeas("nope")).toThrow(TaskNotFoundError);
        });
    });

    describe("promoteIdeas", () => {
        beforeEach(() => store.setGoal("Goal"));

        it("should pair every task with the idea whose id was passed", () => {
            const added = ["a", "b", "c", "d"].map((text) => store.addIdea(text));
            const order = [added[2], added[0], added[3], added[1]];

            const tasks = store.promoteIdeas(order.map((idea) => ({ ideaId: idea.id })));

            expect(tasks.map((task) => task.name)).toEqual(["c", "a", "d", "b"]);
            expect(inboxTexts(store)).toEqual([]);
        });

        it("should place each idea under its own parent, with its own name", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            const first = store.addIdea("first");
            const second = store.addIdea("second");

            const tasks = store.promoteIdeas([
                { ideaId: first.id, parentId: parent.id, name: "Do the first thing" },
                { ideaId: second.id, description: "why it matters" },
            ]);

            expect(store.findTask(parent.id)!.plan!.tasksList.map((task) => task.id)).toEqual([tasks[0].id]);
            expect(tasks[0].name).toBe("Do the first thing");
            expect(tasks[1].name).toBe("second");
            expect(tasks[1].description).toBe("why it matters");
        });

        it("should count as a single change, so one undo puts every idea back", () => {
            const added = ["b", "a"].map((text) => store.addIdea(text));

            store.promoteIdeas(added.map((idea) => ({ ideaId: idea.id })));
            store.undo();

            expect(inboxTexts(store)).toEqual(["a", "b"]);
        });

        it("should apply nothing when one promotion in the batch cannot be resolved", () => {
            const idea = store.addIdea("a");

            expect(() => store.promoteIdeas([{ ideaId: idea.id }, { ideaId: "gone" }])).toThrow(IdeaNotFoundError);
            expect(inboxTexts(store)).toEqual(["a"]);
            expect(store.getState().goal.plan!.tasksList).toHaveLength(0);
        });

        it("should refuse to promote the same idea twice in one batch", () => {
            const idea = store.addIdea("a");

            expect(() => store.promoteIdeas([{ ideaId: idea.id }, { ideaId: idea.id }])).toThrow(InvalidBatchError);
            expect(inboxTexts(store)).toEqual(["a"]);
        });
    });

    describe("removeIdeas", () => {
        it("should remove every idea as one change, returning them in the order supplied", () => {
            const added = ["a", "b", "c"].map((text) => store.addIdea(text));
            const versionBefore = store.getVersion();

            const removed = store.removeIdeas([added[2].id, added[0].id]);

            expect(removed.map((idea) => idea.text)).toEqual(["c", "a"]);
            expect(inboxTexts(store)).toEqual(["b"]);
            expect(store.getVersion()).toBe(versionBefore + 1);
        });

        it("should count as a single change, so one undo puts every idea back", () => {
            const added = ["b", "a"].map((text) => store.addIdea(text));

            store.removeIdeas(added.map((idea) => idea.id));
            store.undo();

            expect(inboxTexts(store)).toEqual(["a", "b"]);
        });

        it("should apply nothing when one id in the batch is unknown", () => {
            const idea = store.addIdea("a");

            expect(() => store.removeIdeas([idea.id, "gone"])).toThrow(IdeaNotFoundError);
            expect(inboxTexts(store)).toEqual(["a"]);
        });

        it("should refuse to remove the same idea twice in one batch", () => {
            const idea = store.addIdea("a");

            expect(() => store.removeIdeas([idea.id, idea.id])).toThrow(InvalidBatchError);
            expect(inboxTexts(store)).toEqual(["a"]);
        });
    });

    describe("addTasks", () => {
        beforeEach(() => store.setGoal("Goal"));

        it("should add every task as one change, in the order supplied", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            const versionBefore = store.getVersion();

            const added = store.addTasks([
                { name: "One" },
                { name: "Two", parentId: parent.id, description: "detail" },
                { name: "Three" },
            ]);

            expect(added.map((task) => task.name)).toEqual(["One", "Two", "Three"]);
            expect(store.getState().goal.plan!.tasksList.map((task) => task.name)).toEqual(["Parent", "One", "Three"]);
            expect(store.findTask(parent.id)!.plan!.tasksList[0].description).toBe("detail");
            expect(store.getVersion()).toBe(versionBefore + 1);
        });

        it("should give each task marked withSubplan an empty subplan", () => {
            const added = store.addTasks([{ name: "Run the launch", withSubplan: true }, { name: "Draft copy" }]);

            expect(added[0].plan).toEqual({ tasksList: [], dependenciesList: [] });
            expect(added[1].plan).toBeNull();
            expect(store.findTask(added[0].id)!.plan).toEqual({ tasksList: [], dependenciesList: [] });
        });

        it("should apply nothing when one parent is unknown", () => {
            expect(() => store.addTasks([{ name: "One" }, { name: "Two", parentId: "nope" }])).toThrow(
                TaskNotFoundError,
            );
            expect(store.getState().goal.plan!.tasksList).toHaveLength(0);
        });
    });

    describe("addDependencies", () => {
        beforeEach(() => store.setGoal("Ship it"));

        it("should add every edge as one change and name both ends", () => {
            const first = store.addTask(GOAL_ID, "Draft copy");
            const second = store.addTask(GOAL_ID, "Print flyers");
            const versionBefore = store.getVersion();

            const added = store.addDependencies([
                { sourceId: first.id, targetId: second.id },
                { sourceId: second.id, targetId: GOAL_ID },
            ]);

            expect(added).toEqual([
                { sourceId: first.id, sourceName: "Draft copy", targetId: second.id, targetName: "Print flyers" },
                { sourceId: second.id, sourceName: "Print flyers", targetId: GOAL_ID, targetName: "Ship it" },
            ]);
            expect(store.getVersion()).toBe(versionBefore + 1);
        });

        it("should reject the whole batch when its edges close a cycle between them", () => {
            const first = store.addTask(GOAL_ID, "Draft copy");
            const second = store.addTask(GOAL_ID, "Print flyers");

            expect(() =>
                store.addDependencies([
                    { sourceId: first.id, targetId: second.id },
                    { sourceId: second.id, targetId: first.id },
                ]),
            ).toThrow(/"Print flyers" -> "Draft copy" would create a cycle: .*Draft copy.*Print flyers.*Draft copy/);
            expect(store.getState().goal.plan!.dependenciesList).toEqual([]);
        });

        it("should accept the containing task's own id as a target for the plan's goal", () => {
            const parent = store.addTask(GOAL_ID, "Run the launch");
            const child = store.addTask(parent.id, "Draft copy");

            const [edge] = store.addDependencies([{ sourceId: child.id, targetId: parent.id }]);

            expect(edge).toEqual({
                sourceId: child.id,
                sourceName: "Draft copy",
                targetId: parent.id,
                targetName: "Run the launch",
            });
            expect(store.findTask(parent.id)!.plan!.dependenciesList).toEqual([{ source: child.id, target: GOAL_ID }]);
        });

        it("should apply nothing when one edge names an unknown source", () => {
            const task = store.addTask(GOAL_ID, "Draft copy");

            expect(() =>
                store.addDependencies([
                    { sourceId: task.id, targetId: GOAL_ID },
                    { sourceId: "nope", targetId: GOAL_ID },
                ]),
            ).toThrow(TaskNotFoundError);
            expect(store.getState().goal.plan!.dependenciesList).toEqual([]);
        });
    });

    describe("moveTask", () => {
        beforeEach(() => store.setGoal("Goal"));

        it("should move a task, and its subplan, into another task's plan", () => {
            const destination = store.addTask(GOAL_ID, "Destination");
            const moving = store.addTask(GOAL_ID, "Moving");
            const child = store.addTask(moving.id, "Child");

            const moved = store.moveTask(moving.id, destination.id);

            expect(moved.id).toBe(moving.id);
            expect(store.getState().goal.plan!.tasksList.map((task) => task.id)).toEqual([destination.id]);
            expect(store.findTask(destination.id)!.plan!.tasksList.map((task) => task.id)).toEqual([moving.id]);
            expect(store.findTask(child.id)).not.toBeNull();
        });

        it("should drop dependencies in the plan it leaves", () => {
            const destination = store.addTask(GOAL_ID, "Destination");
            const staying = store.addTask(GOAL_ID, "Staying");
            const moving = store.addTask(GOAL_ID, "Moving");
            store.addDependency(moving.id, staying.id);
            store.addDependency(staying.id, GOAL_ID);

            store.moveTask(moving.id, destination.id);

            expect(store.getState().goal.plan!.dependenciesList).toEqual([{ source: staying.id, target: GOAL_ID }]);
        });

        it("should move a task back up to the root goal", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            const child = store.addTask(parent.id, "Child");

            store.moveTask(child.id, GOAL_ID);

            expect(store.getState().goal.plan!.tasksList.map((task) => task.id)).toEqual([parent.id, child.id]);
            expect(store.findTask(parent.id)!.plan!.tasksList).toHaveLength(0);
        });

        it("should refuse to move a task inside itself or its own descendant", () => {
            const parent = store.addTask(GOAL_ID, "Parent");
            const child = store.addTask(parent.id, "Child");

            expect(() => store.moveTask(parent.id, parent.id)).toThrow(InvalidMoveError);
            expect(() => store.moveTask(parent.id, child.id)).toThrow(InvalidMoveError);
            expect(() => store.moveTask(GOAL_ID, parent.id)).toThrow(InvalidMoveError);
            expect(store.findTask(child.id)).not.toBeNull();
        });

        it("should throw for unknown tasks", () => {
            const task = store.addTask(GOAL_ID, "Task");

            expect(() => store.moveTask("nope", GOAL_ID)).toThrow(TaskNotFoundError);
            expect(() => store.moveTask(task.id, "nope")).toThrow(TaskNotFoundError);
        });

        it("should leave a task where it is when it already sits in that plan", () => {
            const task = store.addTask(GOAL_ID, "Task");
            const versionBefore = store.getVersion();

            expect(store.moveTask(task.id, GOAL_ID).id).toBe(task.id);
            expect(store.getVersion()).toBe(versionBefore);
        });
    });
});
