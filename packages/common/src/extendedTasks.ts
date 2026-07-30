import { Task } from "./types";

export enum TaskState {
    UNDETERMINED = 0,
    BLOCKED = 1,
    UNBLOCKED = 2,
    COMPLETED = 3,
}

export interface TaskAndState {
    task: Task;
    state: TaskState;
}

export interface TaskAndStateAndBlockers extends TaskAndState {
    blockerIDs: string[];
}
