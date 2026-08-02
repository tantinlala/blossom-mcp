import {
    Task,
    Plan,
    Dependency,
    ProjectState,
    Author,
    GOAL_ID,
    TaskState,
    TaskAndStateAndBlockers,
    hasCircularDependencies,
    updateTaskStates,
} from "@blossom/common";
import { v4 as uuidv4 } from "uuid";

const MAX_UNDO_STACK_SIZE = 50;

interface UndoSnapshot {
    goal: Task;
    inbox: string[];
    // Who made the change this snapshot precedes, so undo can refuse to
    // rewind somebody else's work. Null for changes made without an identity.
    author: Author | null;
}

class TaskNotFoundError extends Error {
    constructor(taskId: string) {
        super(`Task not found: ${taskId}`);
        this.name = "TaskNotFoundError";
    }
}

class InvalidDependencyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidDependencyError";
    }
}

class InvalidIndexError extends Error {
    constructor(index: number) {
        super(`Invalid inbox index: ${index}`);
        this.name = "InvalidIndexError";
    }
}

/**
 * A write carried a precondition that no longer holds: either the caller's
 * baseVersion is behind the store, or the inbox row it addressed no longer
 * holds the text the caller expected.
 */
class VersionConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "VersionConflictError";
    }
}

/** Undo would have reverted a change made by somebody else. */
class UndoBlockedError extends Error {
    constructor(blockedBy: Author) {
        super(
            blockedBy.kind === "assistant"
                ? "The assistant has changed the project since your last change"
                : "Someone else has changed the project since your last change",
        );
        this.name = "UndoBlockedError";
    }
}

/**
 * Single source of truth for the active project's state. Both the REST API and
 * the MCP server mutate project state exclusively through this store. Every
 * mutation pushes an undo snapshot, increments the monotonic version counter,
 * and notifies listeners so connected clients can be sent the change.
 */
class ProjectStore {
    private _goal: Task;
    private _inbox: string[];
    private _activeProject: string | null;
    private _version: number;
    private _undoStack: UndoSnapshot[];
    private _listeners: Set<() => void>;
    private _currentAuthor: Author | null;
    private _lastChangeAuthor: Author | null;

    constructor() {
        this._goal = this._emptyGoal();
        this._inbox = [];
        this._activeProject = null;
        this._version = 1;
        this._undoStack = [];
        this._listeners = new Set();
        this._currentAuthor = null;
        this._lastChangeAuthor = null;
    }

    private _emptyGoal(): Task {
        return { name: "", id: GOAL_ID, completionState: false, plan: null };
    }

    private _deepClone<T>(value: T): T {
        return JSON.parse(JSON.stringify(value));
    }

    private _saveSnapshot() {
        this._undoStack.push({
            goal: this._deepClone(this._goal),
            inbox: [...this._inbox],
            author: this._currentAuthor,
        });
        if (this._undoStack.length > MAX_UNDO_STACK_SIZE) {
            this._undoStack.shift();
        }
    }

    private _bump() {
        this._version++;
        this._lastChangeAuthor = this._currentAuthor;
        this._notify();
    }

    // ------------------------------------------------------- change notification

    /**
     * Registers a listener fired after every mutation. The payload is deliberately
     * empty: listeners call getState() themselves, which lets the realtime layer
     * coalesce a burst of mutations into a single clone and a single broadcast.
     * Returns an unsubscribe function.
     */
    public onChange(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    private _notify() {
        for (const listener of this._listeners) {
            try {
                listener();
            } catch (error) {
                // A broken listener must never fail the mutation that triggered it.
                console.error("ProjectStore change listener threw:", error);
            }
        }
    }

    // ------------------------------------------------------- authorship

    /**
     * Runs a synchronous mutation attributed to the given author, so undo
     * snapshots and change broadcasts know who is responsible. Restores the
     * previous author afterwards; a mutation made outside a runAs block is
     * unattributed, and undo does not restrict it.
     */
    public runAs<T>(author: Author, fn: () => T): T {
        const previous = this._currentAuthor;
        this._currentAuthor = author;
        try {
            return fn();
        } finally {
            this._currentAuthor = previous;
        }
    }

    public get lastChangeAuthor(): Author | null {
        return this._lastChangeAuthor;
    }

    // ------------------------------------------------------------------ reads

    public getState(): ProjectState {
        return {
            version: this._version,
            activeProject: this._activeProject,
            goal: this._deepClone(this._goal),
            inbox: [...this._inbox],
        };
    }

    public getVersion(): number {
        return this._version;
    }

    public get activeProject(): string | null {
        return this._activeProject;
    }

    public findTask(taskId: string): Task | null {
        if (taskId === GOAL_ID) {
            return this._goal;
        }
        if (!this._goal.plan) {
            return null;
        }
        return this._findTaskById(taskId, this._goal.plan);
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
        return null;
    }

    // Finds the task whose plan directly contains taskId (the goal counts as
    // the container for top-level tasks). Returns null if taskId is unknown.
    private _findContainerOf(taskId: string): Task | null {
        if (!this._goal.plan) {
            return null;
        }
        if (this._goal.plan.tasksList.some((t) => t.id === taskId)) {
            return this._goal;
        }
        return this._findParentTaskOfId(taskId, this._goal.plan);
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
        return null;
    }

    // ------------------------------------------------------- lifecycle

    public reset() {
        this._goal = this._emptyGoal();
        this._inbox = [];
        this._activeProject = null;
        this._undoStack = [];
        this._bump();
    }

    public load(goal: Task, inbox: string[], activeProject: string | null) {
        this._goal = this._deepClone(goal);
        // Normalize legacy root ids ("" in old saved files) to the sentinel
        this._goal.id = GOAL_ID;
        this._inbox = [...inbox];
        this._activeProject = activeProject;
        this._undoStack = [];
        this._bump();
    }

    public setActiveProject(name: string | null) {
        this._activeProject = name;
        this._bump();
    }

    /**
     * Reverts the most recent change. Snapshots restore whole state, so undoing
     * a change that somebody else has since built on would silently discard
     * their work - when the caller has an identity and the newest change is not
     * theirs, undo refuses instead.
     */
    public undo(): boolean {
        if (this._undoStack.length === 0) {
            return false;
        }

        const author = this._currentAuthor;
        const newest = this._undoStack[this._undoStack.length - 1];
        if (author && newest.author && newest.author.id !== author.id) {
            throw new UndoBlockedError(newest.author);
        }

        const snapshot = this._undoStack.pop()!;
        this._goal = snapshot.goal;
        this._inbox = snapshot.inbox;
        this._bump();
        return true;
    }

    /** Who made the change undo would revert, if anyone. */
    public get undoableBy(): Author | null {
        const newest = this._undoStack[this._undoStack.length - 1];
        return newest ? newest.author : null;
    }

    // ------------------------------------------------------- goal & tasks

    public setGoal(name: string, description?: string, baseVersion?: number) {
        this._assertVersion(baseVersion);
        this._saveSnapshot();
        this._goal.name = name;
        if (description !== undefined) {
            this._goal.description = description;
        }
        if (!this._goal.plan) {
            this._goal.plan = { tasksList: [], dependenciesList: [] };
        }
        this._bump();
    }

    public addTask(parentId: string, name: string, description?: string): Task {
        const parent = this.findTask(parentId);
        if (!parent) {
            throw new TaskNotFoundError(parentId);
        }

        this._saveSnapshot();
        if (!parent.plan) {
            parent.plan = { tasksList: [], dependenciesList: [] };
        }
        const newTask: Task = { name, id: uuidv4(), completionState: false, plan: null };
        if (description !== undefined) {
            newTask.description = description;
        }
        parent.plan.tasksList.push(newTask);
        parent.completionState = false; // New incomplete task was added
        this._bump();
        return this._deepClone(newTask);
    }

    public updateTask(taskId: string, updates: { name?: string; description?: string; baseVersion?: number }) {
        const task = this.findTask(taskId);
        if (!task) {
            throw new TaskNotFoundError(taskId);
        }

        this._assertVersion(updates.baseVersion);
        this._saveSnapshot();
        if (updates.name !== undefined && updates.name !== "") {
            task.name = updates.name;
        }
        if (updates.description !== undefined) {
            task.description = updates.description;
        }
        this._bump();
    }

    public setTaskCompletion(taskId: string, completed: boolean) {
        if (taskId === GOAL_ID) {
            throw new InvalidDependencyError("Cannot set completion of the goal directly");
        }
        if (!this.findTask(taskId)) {
            throw new TaskNotFoundError(taskId);
        }

        this._saveSnapshot();
        this._setCompletion(taskId, completed, this._goal.plan);
        this._bump();
    }

    // Sets completion and propagates completion state up through parents.
    private _setCompletion(taskId: string, completed: boolean, plan: Plan): boolean {
        for (let task of plan.tasksList) {
            if (task.id === taskId) {
                task.completionState = completed;
                return true;
            }

            if (task.plan) {
                let found = this._setCompletion(taskId, completed, task.plan);
                if (found) {
                    // A subtask changed, so recompute this parent's completion
                    task.completionState = task.plan.tasksList.every((t) => t.completionState);
                    return true;
                }
            }
        }

        return false;
    }

    public removeTask(taskId: string) {
        const container = this._findContainerOf(taskId);
        if (!container) {
            throw new TaskNotFoundError(taskId);
        }

        this._saveSnapshot();
        container.plan.tasksList = container.plan.tasksList.filter((task) => task.id !== taskId);
        container.plan.dependenciesList = container.plan.dependenciesList.filter(
            (dependency) => dependency.source !== taskId && dependency.target !== taskId,
        );
        container.completionState = container.plan.tasksList.every((task) => task.completionState);
        this._bump();
    }

    public createSubplan(taskId: string) {
        const task = this.findTask(taskId);
        if (!task) {
            throw new TaskNotFoundError(taskId);
        }

        this._saveSnapshot();
        if (!task.plan) {
            task.plan = { tasksList: [], dependenciesList: [] };
        }
        this._bump();
    }

    // ------------------------------------------------------- dependencies

    public addDependency(sourceId: string, targetId: string) {
        if (sourceId === targetId) {
            throw new InvalidDependencyError("A task cannot depend on itself");
        }

        const container = this._findContainerOf(sourceId);
        if (!container) {
            throw new TaskNotFoundError(sourceId);
        }

        const scope = container.plan;
        const targetExists = targetId === GOAL_ID || scope.tasksList.some((task) => task.id === targetId);
        if (!targetExists) {
            throw new InvalidDependencyError(`Target must be the goal or a sibling of the source: ${targetId}`);
        }

        const candidate = [...scope.dependenciesList, { source: sourceId, target: targetId }];
        if (hasCircularDependencies(candidate)) {
            throw new InvalidDependencyError("Dependency would create a cycle");
        }

        this._saveSnapshot();
        scope.dependenciesList.push({ source: sourceId, target: targetId });
        this._bump();
    }

    public removeDependency(sourceId: string, targetId: string) {
        const container = this._findContainerOf(sourceId);
        if (!container) {
            throw new TaskNotFoundError(sourceId);
        }

        this._saveSnapshot();
        container.plan.dependenciesList = container.plan.dependenciesList.filter(
            (dependency) => !(dependency.source === sourceId && dependency.target === targetId),
        );
        this._bump();
    }

    public updateDependency(oldSource: string, oldTarget: string, newSource: string, newTarget: string) {
        const container = this._findContainerOf(oldSource);
        if (!container) {
            throw new TaskNotFoundError(oldSource);
        }

        const dependency = container.plan.dependenciesList.find(
            (dep) => dep.source === oldSource && dep.target === oldTarget,
        );
        if (!dependency) {
            throw new InvalidDependencyError(`Dependency not found: ${oldSource} -> ${oldTarget}`);
        }

        this._saveSnapshot();
        dependency.source = newSource;
        dependency.target = newTarget;
        this._bump();
    }

    // ------------------------------------------------------- paste

    public pasteTasks(parentId: string, tasks: Task[], dependencies: Dependency[]) {
        const parent = this.findTask(parentId);
        if (!parent) {
            throw new TaskNotFoundError(parentId);
        }

        this._saveSnapshot();
        if (!parent.plan) {
            parent.plan = { tasksList: [], dependenciesList: [] };
        }

        const idMap = new Map<string, string>();

        // Recursively copy tasks, generating fresh ids so pasted tasks never
        // collide with their originals.
        const deepCopyTaskWithNewIds = (task: Task): Task => {
            const newId = uuidv4();
            idMap.set(task.id, newId);

            let newPlan: Plan | null = null;
            if (task.plan) {
                const newTasksList = task.plan.tasksList.map((t) => deepCopyTaskWithNewIds(t));
                const newDependenciesList = task.plan.dependenciesList.map((dep) => ({
                    source: idMap.get(dep.source) || dep.source,
                    target: idMap.get(dep.target) || dep.target,
                }));
                newPlan = { tasksList: newTasksList, dependenciesList: newDependenciesList };
            }

            return { ...task, id: newId, plan: newPlan };
        };

        const newTasks = tasks.map((task) => deepCopyTaskWithNewIds(task));

        const newDependencies = dependencies
            .map((dep) => {
                const newSource = idMap.get(dep.source);
                const newTarget = idMap.get(dep.target);
                if (newSource && newTarget) {
                    return { source: newSource, target: newTarget };
                }
                return null;
            })
            .filter((dep): dep is Dependency => dep !== null);

        parent.plan.tasksList.push(...newTasks);
        parent.plan.dependenciesList.push(...newDependencies);
        parent.completionState = parent.plan.tasksList.every((task) => task.completionState);
        this._bump();
    }

    // ------------------------------------------------------- inbox

    public addIdea(text: string) {
        this._saveSnapshot();
        this._inbox.unshift(text);
        this._bump();
    }

    public updateIdea(index: number, text: string, expectedText?: string) {
        this._assertIndex(index);
        this._assertIdeaText(index, expectedText);
        this._saveSnapshot();
        this._inbox[index] = text;
        this._bump();
    }

    public removeIdea(index: number, expectedText?: string) {
        this._assertIndex(index);
        this._assertIdeaText(index, expectedText);
        this._saveSnapshot();
        this._inbox.splice(index, 1);
        this._bump();
    }

    public promoteIdea(index: number, parentId: string = GOAL_ID, expectedText?: string): Task {
        this._assertIndex(index);
        this._assertIdeaText(index, expectedText);
        const parent = this.findTask(parentId);
        if (!parent) {
            throw new TaskNotFoundError(parentId);
        }

        this._saveSnapshot();
        const newTask = this._promote(index, parent);
        this._bump();
        return this._deepClone(newTask);
    }

    /**
     * Promotes every idea into the parent's plan in one mutation, so the inbox
     * cannot shift underneath a caller part-way through the way a sequence of
     * single promotions can.
     */
    public promoteAllIdeas(parentId: string = GOAL_ID): Task[] {
        const parent = this.findTask(parentId);
        if (!parent) {
            throw new TaskNotFoundError(parentId);
        }
        if (this._inbox.length === 0) {
            return [];
        }

        this._saveSnapshot();
        const promoted: Task[] = [];
        // Always take the first idea: each promotion shifts the rest up.
        while (this._inbox.length > 0) {
            promoted.push(this._promote(0, parent));
        }
        this._bump();
        return this._deepClone(promoted);
    }

    private _promote(index: number, parent: Task): Task {
        const [text] = this._inbox.splice(index, 1);
        if (!parent.plan) {
            parent.plan = { tasksList: [], dependenciesList: [] };
        }
        const newTask: Task = { name: text, id: uuidv4(), completionState: false, plan: null };
        parent.plan.tasksList.push(newTask);
        parent.completionState = false;
        return newTask;
    }

    private _assertIndex(index: number) {
        if (!Number.isInteger(index) || index < 0 || index >= this._inbox.length) {
            throw new InvalidIndexError(index);
        }
    }

    // Inbox rows are addressed by index, and adding an idea unshifts, so any
    // concurrent write renumbers every row. Callers that know which text they
    // were looking at pass it here rather than trusting the index alone.
    private _assertIdeaText(index: number, expectedText?: string) {
        if (expectedText !== undefined && this._inbox[index] !== expectedText) {
            throw new VersionConflictError(
                `Inbox item ${index} has changed since you last read it. Expected "${expectedText}".`,
            );
        }
    }

    private _assertVersion(baseVersion?: number) {
        if (baseVersion !== undefined && baseVersion !== this._version) {
            throw new VersionConflictError(
                `The project changed since you started editing (expected version ${baseVersion}, now ${this._version}).`,
            );
        }
    }

    // ------------------------------------------------------- derived views

    public getNextTasks(): Task[] {
        const allUnblockedTasks: Task[] = [];
        if (this._goal.plan) {
            const dummyTask: Task = { name: "", id: "Dummy", completionState: false, plan: this._goal.plan };
            this._findAllUnblockedTasksForSubplan(allUnblockedTasks, dummyTask);
        }
        return this._deepClone(allUnblockedTasks);
    }

    private _determineAllTaskStates(tasks: Task[], dependencies: Dependency[]): TaskAndStateAndBlockers[] {
        let extendedTasks: TaskAndStateAndBlockers[] = tasks.map(
            (task): TaskAndStateAndBlockers => ({ task, state: TaskState.UNDETERMINED, blockerIDs: [] }),
        );

        const goalNode: TaskAndStateAndBlockers = {
            task: { name: "", id: GOAL_ID, completionState: false, plan: null },
            state: TaskState.UNDETERMINED,
            blockerIDs: [],
        };
        extendedTasks.push(goalNode);

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
    }

    private _findAllUnblockedTasksForSubplan(allUnblockedTasks: Task[], parent: Task) {
        let extendedTasks = this._determineAllTaskStates(parent.plan.tasksList, parent.plan.dependenciesList);
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
}

export {
    ProjectStore,
    TaskNotFoundError,
    InvalidDependencyError,
    InvalidIndexError,
    VersionConflictError,
    UndoBlockedError,
};
