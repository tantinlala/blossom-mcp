import { updateTaskStates } from "./updateTaskStates";
import { TaskState, TaskAndStateAndBlockers } from "./extendedTasks";

describe("updateAncestorsAndItselfCompletedState", () => {
    test("when 1 blocks 2 and both are not complete, expect 1 to be next", () => {
        const tasks: TaskAndStateAndBlockers[] = [
            {
                task: { id: "1", name: "Task 1", completionState: false, plan: null },
                state: TaskState.UNDETERMINED,
                blockerIDs: [],
            },
            {
                task: { id: "2", name: "Task 2", completionState: false, plan: null },
                state: TaskState.UNDETERMINED,
                blockerIDs: ["1"],
            },
        ];

        updateTaskStates("2", tasks);

        expect(tasks[0].state).toBe(TaskState.UNBLOCKED);
        expect(tasks[1].state).toBe(TaskState.BLOCKED);
    });

    test("when 1 blocks 2 and only 2 complete, expect 1 to be next", () => {
        const tasks: TaskAndStateAndBlockers[] = [
            {
                task: { id: "1", name: "Task 1", completionState: false, plan: null },
                state: TaskState.UNDETERMINED,
                blockerIDs: [],
            },
            {
                task: { id: "2", name: "Task 2", completionState: true, plan: null },
                state: TaskState.UNDETERMINED,
                blockerIDs: ["1"],
            },
        ];

        updateTaskStates("2", tasks);

        expect(tasks[0].state).toBe(TaskState.UNBLOCKED);
        expect(tasks[1].state).toBe(TaskState.BLOCKED);
    });

    test("when 1 blocks 2 and only 1 complete, expect 2 to be next", () => {
        const tasks: TaskAndStateAndBlockers[] = [
            {
                task: { id: "1", name: "Task 1", completionState: true, plan: null },
                state: TaskState.UNDETERMINED,
                blockerIDs: [],
            },
            {
                task: { id: "2", name: "Task 2", completionState: false, plan: null },
                state: TaskState.UNDETERMINED,
                blockerIDs: ["1"],
            },
        ];

        updateTaskStates("2", tasks);

        expect(tasks[0].state).toBe(TaskState.COMPLETED);
        expect(tasks[1].state).toBe(TaskState.UNBLOCKED);
    });

    test("when 1 blocks 2 and both complete, expect none to be next", () => {
        const tasks: TaskAndStateAndBlockers[] = [
            {
                task: { id: "1", name: "Task 1", completionState: true, plan: null },
                state: TaskState.UNDETERMINED,
                blockerIDs: [],
            },
            {
                task: { id: "2", name: "Task 2", completionState: true, plan: null },
                state: TaskState.UNDETERMINED,
                blockerIDs: ["1"],
            },
        ];

        updateTaskStates("2", tasks);

        expect(tasks[0].state).toBe(TaskState.COMPLETED);
        expect(tasks[1].state).toBe(TaskState.COMPLETED);
    });

    test("when task references a predecessor that does not exist, should treat predecessor as completed", () => {
        const tasks: TaskAndStateAndBlockers[] = [
            {
                task: { id: "2", name: "Task 2", completionState: false, plan: null },
                state: TaskState.UNDETERMINED,
                blockerIDs: ["1"],
            },
        ];

        updateTaskStates("2", tasks);

        expect(tasks[0].state).toBe(TaskState.UNBLOCKED);
    });
});
