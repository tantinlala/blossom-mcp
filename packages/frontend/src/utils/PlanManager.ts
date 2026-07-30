import {
    Plan,
    Task,
    Dependency,
    GOAL_ID,
    TaskState,
    TaskAndState,
    TaskAndStateAndBlockers,
    hasCircularDependencies,
    updateTaskStates,
} from "@blossom/common";
import { Roadmap } from "../types/roadmap";

/**
 * Client-side view-model over the server-owned project state. The backend's
 * ProjectStore is the source of truth; this class only keeps a local copy of
 * the goal tree (applyServerState), the drill-down context, and derived views
 * for rendering. All mutations go through the APIClient.
 */
class PlanManager {
    private _fullProject: Task;
    private _presentContext: Task;

    public reset() {
        this._fullProject = { name: "", id: GOAL_ID, completionState: false, plan: null };
        this._presentContext = this._fullProject;
    }

    constructor() {
        this.reset();
    }

    public get fullProject(): Task {
        return this._fullProject;
    }

    public initialized(): boolean {
        return this._fullProject.plan !== null;
    }

    /**
     * Replaces the local copy of the goal tree with the server's version and
     * re-resolves the drill-down context by id, falling back to the root if
     * the context task no longer exists.
     */
    public applyServerState(goal: Task) {
        const presentContextId = this._presentContext.id;
        this._fullProject = goal;

        if (presentContextId === GOAL_ID || !this._fullProject.plan) {
            this._presentContext = this._fullProject;
            return;
        }

        const found = this._findTaskById(presentContextId, this._fullProject.plan);
        this._presentContext = found && found.plan ? found : this._fullProject;
    }

    // This function creates a new extendedTasks array by determining the state of all tasks and adding the goal's task to it
    private determineAllTaskStates = (goal: string, tasks: Task[], dependencies: Dependency[]) => {
        let extendedTasks: TaskAndStateAndBlockers[] = tasks.map((task) => {
            return { task, state: TaskState.UNDETERMINED, blockerIDs: [] };
        });

        let goalTask: TaskAndStateAndBlockers = {
            task: { name: goal, id: GOAL_ID, completionState: false, plan: null },
            state: TaskState.UNDETERMINED,
            blockerIDs: [],
        };
        extendedTasks.push(goalTask);

        dependencies.forEach((dependency) => {
            let targetExtendedTask = extendedTasks.find((extendedTask) => extendedTask.task.id === dependency.target);
            if (targetExtendedTask !== undefined) {
                targetExtendedTask.blockerIDs.push(dependency.source);
            }
        });

        if (!hasCircularDependencies(dependencies)) {
            updateTaskStates(GOAL_ID, extendedTasks);
        }

        return extendedTasks;
    };

    private _findAllUnblockedTasksForSubplan(allUnblockedTasks: Task[], parent: Task) {
        let extendedTasks = this.determineAllTaskStates("", parent.plan.tasksList, parent.plan.dependenciesList);
        let unblockedTasks = extendedTasks.filter((extendedTask) => extendedTask.state === TaskState.UNBLOCKED);
        unblockedTasks.forEach((unblockedTask) => {
            if (unblockedTask.task.id === GOAL_ID) {
                return;
            }

            if (unblockedTask.task.plan === null) {
                allUnblockedTasks.push(unblockedTask.task);
                return;
            }

            this._findAllUnblockedTasksForSubplan(allUnblockedTasks, unblockedTask.task);
        });
    }

    private _findTaskById(taskId: string, plan: Plan): Task | null {
        for (let task of plan.tasksList) {
            if (task.id === taskId) {
                return task;
            }
            if (task.plan) {
                let foundTask = this._findTaskById(taskId, task.plan);
                if (foundTask) {
                    return foundTask;
                }
            }
        }
        return null; // Task was not found in this branch
    }

    private _findParentTaskOfId(taskId: string, plan: Plan): Task | null {
        for (let task of plan.tasksList) {
            if (task.plan) {
                if (task.plan.tasksList.some((t) => t.id === taskId)) {
                    return task;
                }
                let foundTask = this._findParentTaskOfId(taskId, task.plan);
                if (foundTask) {
                    return foundTask;
                }
            }
        }
        return null; // Parent task was not found in this branch
    }

    public findTask(taskId: string): Task | null {
        if (taskId === GOAL_ID) {
            return this._fullProject;
        }
        if (!this._fullProject.plan) {
            return null;
        }
        return this._findTaskById(taskId, this._fullProject.plan);
    }

    changeContextToWithinTask(taskId: string) {
        if (taskId === GOAL_ID) {
            this._presentContext = this._fullProject;
            return;
        }

        // Go through the present context and find the task with the given taskId
        let task: Task | null = this._findTaskById(taskId, this._fullProject.plan);

        // If the task is not found, return
        if (!task) {
            return;
        }

        if (!task.plan) {
            return;
        }

        // Set the present context equal to the task
        this._presentContext = task;
    }

    changeContextToParent(taskId: string) {
        // First check if the task is in the top level
        if (this._fullProject.plan.tasksList.some((t) => t.id === taskId)) {
            this._presentContext = this._fullProject;
            return;
        }

        // Find the parent of the task
        let parentTask: Task | null = this._findParentTaskOfId(taskId, this._fullProject.plan);
        if (!parentTask) {
            return;
        }

        // Set the present context equal to the parent task
        this._presentContext = parentTask;
    }

    findTaskInPresentContext(taskId: string): Task | null {
        if (taskId === GOAL_ID) {
            return { ...this._presentContext, id: GOAL_ID };
        }

        return this._presentContext.plan.tasksList.find((task) => task.id === taskId) || null;
    }

    get goal(): Task {
        return this._fullProject;
    }

    get fullPlan(): Plan {
        return this._fullProject.plan;
    }

    get presentContextPlan(): Plan {
        return this._presentContext.plan;
    }

    get presentContextGoal(): Task {
        return this._presentContext;
    }

    get presentContextRoadmap(): Roadmap {
        if (!this._presentContext.plan) {
            return { isSubplan: false, tasksList: [], dependenciesList: [] };
        }

        let tasksList: Task[] = this._presentContext.plan.tasksList;
        let dependenciesList: Dependency[] = this._presentContext.plan.dependenciesList;
        let extendedTasks: TaskAndState[] = this.determineAllTaskStates(
            this._presentContext.name,
            tasksList,
            dependenciesList,
        );
        return { isSubplan: this._presentContext !== this._fullProject, tasksList: extendedTasks, dependenciesList };
    }

    get allUnblockedTasks(): Task[] {
        let allUnblockedTasks: Task[] = [];
        if (!this._fullProject.plan) {
            return allUnblockedTasks;
        }
        let dummyTask = { name: "", id: "Dummy", completionState: false, plan: this._fullProject.plan };
        this._findAllUnblockedTasksForSubplan(allUnblockedTasks, dummyTask);
        return allUnblockedTasks;
    }
}

export { PlanManager };
