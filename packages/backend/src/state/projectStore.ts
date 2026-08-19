import {
    Task,
    Plan,
    Dependency,
    InboxIdea,
    ProjectState,
    Author,
    GOAL_ID,
    TaskState,
    TaskAndStateAndBlockers,
    findCycle,
    hasCircularDependencies,
    updateTaskStates,
} from "@blossom/common";
import { v4 as uuidv4 } from "uuid";

const MAX_UNDO_STACK_SIZE = 50;

interface UndoSnapshot {
    goal: Task;
    inbox: InboxIdea[];
    // Who made the change this snapshot precedes, so undo can refuse to
    // rewind somebody else's work. Null for changes made without an identity.
    author: Author | null;
}

/**
 * How a caller names the inbox entry it means. An id addresses one entry for as
 * long as that entry exists, whatever happens to the ideas around it; a bare
 * number is a position in the current newest-first order, which every other
 * write to the inbox renumbers.
 */
type IdeaRef = number | { ideaId?: string; index?: number };

/** A task to add, as supplied to the batch form. */
type TaskDraft = { parentId?: string; name: string; description?: string; withSubplan?: boolean };

/** An idea to promote, as supplied to the batch form. */
type PromotionDraft = { ideaId?: string; index?: number; parentId?: string; name?: string; description?: string };

/**
 * A dependency with both ends named. Callers get this back so they can check
 * the edge that landed is the edge they meant - the ids alone are opaque.
 * `targetId` is the target exactly as the caller addressed it; `targetName`
 * names the task that end resolved to, so a target addressed as the plan's own
 * task or as the goal sentinel comes back under the name of the task whose
 * goal the edge feeds.
 */
type ResolvedDependency = { sourceId: string; sourceName: string; targetId: string; targetName: string };

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

/** A move would put a task inside itself, or had nowhere to put it. */
class InvalidMoveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidMoveError";
    }
}

class InvalidIndexError extends Error {
    constructor(index: number) {
        super(`Invalid inbox index: ${index}`);
        this.name = "InvalidIndexError";
    }
}

/** The inbox holds no entry under that id - it was removed, or promoted. */
class IdeaNotFoundError extends Error {
    constructor(ideaId: string) {
        super(`Inbox idea not found: ${ideaId}`);
        this.name = "IdeaNotFoundError";
    }
}

/** One batch named the same thing twice, so what it asked for is ambiguous. */
class InvalidBatchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidBatchError";
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
 * Single source of truth for one project's state. Both the REST API and the MCP
 * server mutate project state exclusively through a store. Every mutation
 * pushes an undo snapshot, increments the monotonic version counter, and
 * notifies listeners so connected clients can be sent the change.
 *
 * The Workspace decides which key a store answers to and whether it has a file
 * behind it, so those two are the only pieces of its state written from outside.
 */
class ProjectStore {
    private _goal: Task;
    private _inbox: InboxIdea[];
    private _key: string;
    private _savedToDisk: boolean;
    private _version: number;
    private _undoStack: UndoSnapshot[];
    private _listeners: Set<() => void>;
    private _currentAuthor: Author | null;
    private _lastChangeAuthor: Author | null;

    constructor(key: string, savedToDisk: boolean = false) {
        this._goal = this._emptyGoal();
        this._inbox = [];
        this._key = key;
        this._savedToDisk = savedToDisk;
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

    private _takeSnapshot(): UndoSnapshot {
        return {
            goal: this._deepClone(this._goal),
            inbox: this._inbox.map((idea) => ({ ...idea })),
            author: this._currentAuthor,
        };
    }

    private _pushSnapshot(snapshot: UndoSnapshot) {
        this._undoStack.push(snapshot);
        if (this._undoStack.length > MAX_UNDO_STACK_SIZE) {
            this._undoStack.shift();
        }
    }

    private _saveSnapshot() {
        this._pushSnapshot(this._takeSnapshot());
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

    /** The inbox comes back newest first: a freshly added idea is element 0. */
    public getState(): ProjectState {
        return {
            version: this._version,
            key: this._key,
            savedToDisk: this._savedToDisk,
            goal: this._deepClone(this._goal),
            inbox: this._inbox.map((idea) => ({ ...idea })),
        };
    }

    public getVersion(): number {
        return this._version;
    }

    /** What this project answers to. The Workspace keeps these unique. */
    public get key(): string {
        return this._key;
    }

    /** Whether a file holds this project's work. */
    public get savedToDisk(): boolean {
        return this._savedToDisk;
    }

    public findIdea(ideaId: string): InboxIdea | null {
        const idea = this._inbox.find((entry) => entry.id === ideaId);
        return idea ? { ...idea } : null;
    }

    /** The first idea whose text matches, ignoring case and surrounding space. */
    public findIdeaByText(text: string): InboxIdea | null {
        const wanted = this._normalizeText(text);
        if (wanted === "") {
            return null;
        }
        const idea = this._inbox.find((entry) => this._normalizeText(entry.text) === wanted);
        return idea ? { ...idea } : null;
    }

    private _normalizeText(text: string): string {
        return text.trim().replace(/\s+/g, " ").toLowerCase();
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

    /** Fills the store from a saved project, discarding whatever it held. */
    public load(goal: Task, inbox: InboxIdea[]) {
        this._goal = this._deepClone(goal);
        // Normalize legacy root ids ("" in old saved files) to the sentinel
        this._goal.id = GOAL_ID;
        this._inbox = inbox.map((idea) => ({ ...idea }));
        this._undoStack = [];
        this._bump();
    }

    /**
     * Renames the project. Called by the Workspace, which owns key uniqueness;
     * writing a project to disk under another filename is what moves it.
     */
    public setKey(key: string) {
        this._key = key;
        this._bump();
    }

    /** Records whether a file holds this project's work. */
    public setSavedToDisk(savedToDisk: boolean) {
        this._savedToDisk = savedToDisk;
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

    public addTask(parentId: string, name: string, description?: string, withSubplan?: boolean): Task {
        const parent = this.findTask(parentId);
        if (!parent) {
            throw new TaskNotFoundError(parentId);
        }

        this._saveSnapshot();
        if (!parent.plan) {
            parent.plan = { tasksList: [], dependenciesList: [] };
        }
        const newTask = this._append(parent, name, description, withSubplan);
        this._bump();
        return this._deepClone(newTask);
    }

    /**
     * Adds every task in one mutation, so a batch cannot land half-applied and
     * one undo puts the plan back as it was. Every parent is checked before
     * anything is written; the results come back in the order supplied.
     */
    public addTasks(drafts: TaskDraft[]): Task[] {
        const parents = drafts.map((draft) => {
            const parent = this.findTask(draft.parentId ?? GOAL_ID);
            if (!parent) {
                throw new TaskNotFoundError(draft.parentId ?? GOAL_ID);
            }
            return parent;
        });

        if (drafts.length === 0) {
            return [];
        }

        this._saveSnapshot();
        const added = drafts.map((draft, position) =>
            this._append(parents[position], draft.name, draft.description, draft.withSubplan),
        );
        this._bump();
        return this._deepClone(added);
    }

    private _append(parent: Task, name: string, description?: string, withSubplan?: boolean): Task {
        if (!parent.plan) {
            parent.plan = { tasksList: [], dependenciesList: [] };
        }
        const plan: Plan | null = withSubplan ? { tasksList: [], dependenciesList: [] } : null;
        const newTask: Task = { name, id: uuidv4(), completionState: false, plan };
        if (description !== undefined) {
            newTask.description = description;
        }
        parent.plan.tasksList.push(newTask);
        parent.completionState = false; // New incomplete task was added
        return newTask;
    }

    /**
     * Moves a task, and whatever subplan it carries, into another task's plan.
     *
     * Dependencies in the plan it leaves are dropped: they describe an ordering
     * among siblings it is no longer one of. A task cannot be moved inside
     * itself or anything it contains, which would detach that whole branch from
     * the tree.
     */
    public moveTask(taskId: string, newParentId: string): Task {
        const [task] = this.moveTasks([{ taskId, newParentId }]);
        return task;
    }

    /**
     * Moves several tasks in one mutation, or none of them.
     *
     * Moves apply in the order supplied, and a moved task joins the end of its
     * destination plan, so the order of the batch is the order the tasks read
     * in afterwards. Each move is checked against the tree as the moves before
     * it have left it - two moves that are each fine alone can put a branch
     * inside itself together - and a batch that fails part-way is rolled back
     * whole, so the plan is left exactly as the caller saw it.
     */
    public moveTasks(moves: { taskId: string; newParentId: string }[]): Task[] {
        if (moves.length === 0) {
            return [];
        }

        // The snapshot is held aside and joins the undo stack only once a move
        // has actually changed something, so a no-op batch and a failed batch
        // both leave the undo history exactly as they found it, however full
        // the stack is.
        const before = this._takeSnapshot();
        let changed = false;
        try {
            const moved = moves.map(({ taskId, newParentId }) => {
                const result = this._applyMove(taskId, newParentId);
                changed = changed || result.changed;
                return result.task;
            });
            if (!changed) {
                return this._deepClone(moved);
            }
            this._pushSnapshot(before);
            this._bump();
            return this._deepClone(moved);
        } catch (error) {
            this._goal = before.goal;
            this._inbox = before.inbox;
            throw error;
        }
    }

    // Validates and applies one move against the tree as it currently stands.
    // Reports whether anything moved: a task sent to the plan it is already in
    // counts as satisfied without a write.
    private _applyMove(taskId: string, newParentId: string): { task: Task; changed: boolean } {
        if (taskId === GOAL_ID) {
            throw new InvalidMoveError("The root goal cannot be moved");
        }

        const task = this.findTask(taskId);
        if (!task) {
            throw new TaskNotFoundError(taskId);
        }
        const newParent = this.findTask(newParentId);
        if (!newParent) {
            throw new TaskNotFoundError(newParentId);
        }
        if (newParentId === taskId) {
            throw new InvalidMoveError("A task cannot be moved inside itself");
        }
        if (this._contains(task, newParentId)) {
            throw new InvalidMoveError(`"${newParent.name}" is inside "${task.name}", so it cannot become its parent`);
        }

        const container = this._findContainerOf(taskId)!;
        if (container.id === newParentId) {
            return { task, changed: false };
        }

        container.plan.tasksList = container.plan.tasksList.filter((sibling) => sibling.id !== taskId);
        container.plan.dependenciesList = container.plan.dependenciesList.filter(
            (dependency) => dependency.source !== taskId && dependency.target !== taskId,
        );
        container.completionState = container.plan.tasksList.every((sibling) => sibling.completionState);

        if (!newParent.plan) {
            newParent.plan = { tasksList: [], dependenciesList: [] };
        }
        newParent.plan.tasksList.push(task);
        newParent.completionState = newParent.plan.tasksList.every((child) => child.completionState);
        return { task, changed: true };
    }

    /** Whether candidateId is the task itself or sits somewhere beneath it. */
    private _contains(task: Task, candidateId: string): boolean {
        if (task.id === candidateId) {
            return true;
        }
        return (task.plan?.tasksList ?? []).some((child) => this._contains(child, candidateId));
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
        this.removeTasks([taskId]);
    }

    /**
     * Deletes several tasks in one mutation. Every id is resolved before
     * anything is removed, so the batch lands whole or not at all, and the
     * names come back in the order supplied. Deleting a task deletes its whole
     * subplan, so a batch may name both a task and one of its descendants: the
     * descendant goes with its ancestor.
     */
    public removeTasks(taskIds: string[]): { id: string; name: string }[] {
        const seen = new Set<string>();
        const doomed = taskIds.map((taskId) => {
            const container = this._findContainerOf(taskId);
            if (!container) {
                throw new TaskNotFoundError(taskId);
            }
            if (seen.has(taskId)) {
                throw new InvalidBatchError(`The same task is deleted twice in one batch: ${taskId}`);
            }
            seen.add(taskId);
            const task = container.plan.tasksList.find((sibling) => sibling.id === taskId)!;
            return { id: taskId, name: task.name };
        });

        if (taskIds.length === 0) {
            return [];
        }

        this._saveSnapshot();
        for (const { id } of doomed) {
            const container = this._findContainerOf(id);
            if (!container) {
                // Already deleted along with an ancestor named earlier in the
                // batch, so there is nothing left to do for it.
                continue;
            }
            container.plan.tasksList = container.plan.tasksList.filter((task) => task.id !== id);
            container.plan.dependenciesList = container.plan.dependenciesList.filter(
                (dependency) => dependency.source !== id && dependency.target !== id,
            );
            container.completionState = container.plan.tasksList.every((task) => task.completionState);
        }
        this._bump();
        return doomed;
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

    public addDependency(sourceId: string, targetId: string): ResolvedDependency {
        const [edge] = this.addDependencies([{ sourceId, targetId }]);
        return edge;
    }

    /**
     * Adds every dependency in one mutation, or none of them.
     *
     * The whole batch is checked against the plans it touches before anything is
     * written, so a batch that would close a cycle is refused outright: a
     * part-applied batch would leave the roadmap in a state the caller never
     * asked for and cannot tell apart from the one it wanted.
     */
    public addDependencies(edges: { sourceId: string; targetId: string }[]): ResolvedDependency[] {
        const resolved = edges.map((edge) => this._resolveEdge(edge.sourceId, edge.targetId));

        // Cycles are a property of a plan, not of one edge, so the batch's own
        // edges have to be in the graph before it is checked - two edges that
        // are each fine alone can close a loop together.
        const byContainer = new Map<Task, Dependency[]>();
        for (const edge of resolved) {
            const container = edge.container;
            const pending = byContainer.get(container) ?? [...container.plan.dependenciesList];
            pending.push({ source: edge.sourceId, target: edge.storedTarget });
            byContainer.set(container, pending);

            const cycle = findCycle(pending);
            if (cycle) {
                const path = cycle.map((id) => this._edgeEndName(container, id)).join(" -> ");
                throw new InvalidDependencyError(
                    `"${edge.sourceName}" -> "${edge.targetName}" would create a cycle: ${path}`,
                );
            }
        }

        if (edges.length === 0) {
            return [];
        }

        this._saveSnapshot();
        for (const edge of resolved) {
            edge.container.plan.dependenciesList.push({ source: edge.sourceId, target: edge.storedTarget });
        }
        this._bump();
        return resolved.map(({ sourceId, sourceName, targetId, targetName }) => ({
            sourceId,
            sourceName,
            targetId,
            targetName,
        }));
    }

    /**
     * Works out which plan an edge belongs in and what its target is stored as.
     *
     * A target naming the task that owns the plan means the same thing as the
     * goal sentinel - both say "this feeds the plan's goal" - so both store as
     * the sentinel. The reported edge keeps the target id the caller passed,
     * named after the task whose goal it feeds.
     */
    private _resolveEdge(
        sourceId: string,
        targetId: string,
    ): {
        container: Task;
        sourceId: string;
        sourceName: string;
        targetId: string;
        storedTarget: string;
        targetName: string;
    } {
        if (sourceId === targetId) {
            throw new InvalidDependencyError("A task cannot depend on itself");
        }

        const container = this._findContainerOf(sourceId);
        if (!container) {
            throw new TaskNotFoundError(sourceId);
        }

        const source = container.plan.tasksList.find((task) => task.id === sourceId)!;
        const feedsPlanGoal = targetId === GOAL_ID || targetId === container.id;
        const target = feedsPlanGoal ? null : container.plan.tasksList.find((task) => task.id === targetId);
        if (!feedsPlanGoal && !target) {
            // The refusal names both ends and where each lives - a bare id
            // appears in several edges of a batch, so an id alone does not say
            // which edge is the bad one, or what to do about it.
            const targetContainer = this._findContainerOf(targetId);
            if (targetContainer) {
                const stranger = targetContainer.plan.tasksList.find((task) => task.id === targetId)!;
                throw new InvalidDependencyError(
                    `"${source.name}" -> "${stranger.name}" crosses plans: the source is in ` +
                        `${this._planLabel(container)} and the target is in ${this._planLabel(targetContainer)}. ` +
                        `A dependency connects siblings in one plan, and a subplan holds a chain of work that ` +
                        `is complete in itself - so either add the edge between the tasks whose subplans hold ` +
                        `them, or move a task so both ends are siblings.`,
                );
            }
            throw new InvalidDependencyError(
                `Target of "${source.name}" (${sourceId}) must be one of its siblings, the plan's own task ` +
                    `id, or "${GOAL_ID}": no task has the id ${targetId}`,
            );
        }

        return {
            container,
            sourceId,
            sourceName: source.name,
            targetId,
            storedTarget: feedsPlanGoal ? GOAL_ID : targetId,
            targetName: feedsPlanGoal ? container.name : target!.name,
        };
    }

    // How a plan is referred to in an error message: by the task that owns it,
    // or as the top level when that task is the root goal.
    private _planLabel(container: Task): string {
        if (container.id === GOAL_ID) {
            return "the top-level plan";
        }
        return `the subplan of "${container.name}"`;
    }

    // What to call one end of an edge when reporting on it. The sentinel stands
    // for whichever task owns the plan the edge lives in.
    private _edgeEndName(container: Task, id: string): string {
        if (id === GOAL_ID) {
            return container.name;
        }
        return container.plan.tasksList.find((task) => task.id === id)?.name ?? id;
    }

    public removeDependency(sourceId: string, targetId: string): ResolvedDependency {
        const container = this._findContainerOf(sourceId);
        if (!container) {
            throw new TaskNotFoundError(sourceId);
        }

        const storedTarget = targetId === container.id ? GOAL_ID : targetId;
        this._saveSnapshot();
        container.plan.dependenciesList = container.plan.dependenciesList.filter(
            (dependency) => !(dependency.source === sourceId && dependency.target === storedTarget),
        );
        this._bump();
        return {
            sourceId,
            sourceName: this._edgeEndName(container, sourceId),
            targetId,
            targetName: this._edgeEndName(container, storedTarget),
        };
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

    /** Adds one idea at the front of the inbox and returns it, id and all. */
    public addIdea(text: string): InboxIdea {
        this._saveSnapshot();
        const idea = { id: uuidv4(), text };
        this._inbox.unshift(idea);
        this._bump();
        return { ...idea };
    }

    /**
     * Adds every idea in one mutation. They end up in the order supplied, with
     * the last one supplied nearest the front, and the results come back in
     * that same order so a caller can pair each id with the text it sent.
     */
    public addIdeas(texts: string[]): InboxIdea[] {
        if (texts.length === 0) {
            return [];
        }
        this._saveSnapshot();
        const added = texts.map((text) => {
            const idea = { id: uuidv4(), text };
            this._inbox.unshift(idea);
            return idea;
        });
        this._bump();
        return added.map((idea) => ({ ...idea }));
    }

    public updateIdea(ref: IdeaRef, text: string, expectedText?: string): InboxIdea {
        const index = this._resolveIdeaIndex(ref);
        this._assertIdeaText(index, expectedText);
        this._saveSnapshot();
        this._inbox[index] = { ...this._inbox[index], text };
        this._bump();
        return { ...this._inbox[index] };
    }

    public removeIdea(ref: IdeaRef, expectedText?: string): InboxIdea {
        const index = this._resolveIdeaIndex(ref);
        this._assertIdeaText(index, expectedText);
        this._saveSnapshot();
        const [removed] = this._inbox.splice(index, 1);
        this._bump();
        return removed;
    }

    /**
     * Removes several ideas in one mutation. Every id is resolved before
     * anything is removed, so the batch reads the inbox exactly as the caller
     * saw it and either lands whole or not at all. Results come back in the
     * order supplied.
     */
    public removeIdeas(ideaIds: string[]): InboxIdea[] {
        const seen = new Set<string>();
        for (const ideaId of ideaIds) {
            if (!this._inbox.some((idea) => idea.id === ideaId)) {
                throw new IdeaNotFoundError(ideaId);
            }
            if (seen.has(ideaId)) {
                throw new InvalidBatchError(`The same inbox idea is removed twice in one batch: ${ideaId}`);
            }
            seen.add(ideaId);
        }

        if (ideaIds.length === 0) {
            return [];
        }

        this._saveSnapshot();
        const removed = ideaIds.map((ideaId) => {
            const index = this._inbox.findIndex((idea) => idea.id === ideaId);
            const [idea] = this._inbox.splice(index, 1);
            return idea;
        });
        this._bump();
        return removed;
    }

    public promoteIdea(
        ref: IdeaRef,
        parentId: string = GOAL_ID,
        expectedText?: string,
        overrides: { name?: string; description?: string } = {},
    ): Task {
        const index = this._resolveIdeaIndex(ref);
        this._assertIdeaText(index, expectedText);
        const parent = this.findTask(parentId);
        if (!parent) {
            throw new TaskNotFoundError(parentId);
        }

        this._saveSnapshot();
        const newTask = this._promote(this._inbox[index].id, parent, overrides);
        this._bump();
        return this._deepClone(newTask);
    }

    /**
     * Promotes several ideas in one mutation. Every reference is resolved to an
     * id, and every parent checked, before anything moves, so the batch reads
     * the inbox exactly as the caller saw it and either lands whole or not at
     * all. Results come back in the order supplied.
     */
    public promoteIdeas(drafts: PromotionDraft[]): Task[] {
        const seen = new Set<string>();
        const planned = drafts.map((draft) => {
            const index = this._resolveIdeaIndex({ ideaId: draft.ideaId, index: draft.index });
            const ideaId = this._inbox[index].id;
            if (seen.has(ideaId)) {
                throw new InvalidBatchError(`The same inbox idea is promoted twice in one batch: ${ideaId}`);
            }
            seen.add(ideaId);

            const parent = this.findTask(draft.parentId ?? GOAL_ID);
            if (!parent) {
                throw new TaskNotFoundError(draft.parentId ?? GOAL_ID);
            }
            return { ideaId, parent, overrides: { name: draft.name, description: draft.description } };
        });

        if (drafts.length === 0) {
            return [];
        }

        this._saveSnapshot();
        const promoted = planned.map((item) => this._promote(item.ideaId, item.parent, item.overrides));
        this._bump();
        return this._deepClone(promoted);
    }

    /**
     * Promotes every idea into the parent's plan in one mutation, so the inbox
     * cannot shift underneath a caller part-way through the way a sequence of
     * single promotions can. The tasks land in inbox order, newest first.
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
        const ids = this._inbox.map((idea) => idea.id);
        const promoted = ids.map((ideaId) => this._promote(ideaId, parent));
        this._bump();
        return this._deepClone(promoted);
    }

    private _promote(ideaId: string, parent: Task, overrides: { name?: string; description?: string } = {}): Task {
        const index = this._inbox.findIndex((idea) => idea.id === ideaId);
        const [idea] = this._inbox.splice(index, 1);
        const name = overrides.name !== undefined && overrides.name !== "" ? overrides.name : idea.text;
        return this._append(parent, name, overrides.description);
    }

    /**
     * Turns however a caller named an inbox entry into a position in the current
     * list. An id addresses the entry itself and fails loudly once that entry is
     * gone; a position is only ever as good as the moment it was read. An id
     * wins when both are given.
     */
    private _resolveIdeaIndex(ref: IdeaRef): number {
        const ideaId = typeof ref === "number" ? undefined : ref.ideaId;
        if (ideaId !== undefined) {
            const index = this._inbox.findIndex((idea) => idea.id === ideaId);
            if (index === -1) {
                throw new IdeaNotFoundError(ideaId);
            }
            return index;
        }

        const index = typeof ref === "number" ? ref : (ref.index as number);
        if (!Number.isInteger(index) || index < 0 || index >= this._inbox.length) {
            throw new InvalidIndexError(index);
        }
        return index;
    }

    // Callers that address a row by position pass the text they were looking at
    // as well, since every other write to the inbox renumbers the rows.
    private _assertIdeaText(index: number, expectedText?: string) {
        if (expectedText !== undefined && this._inbox[index].text !== expectedText) {
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
    MAX_UNDO_STACK_SIZE,
    TaskNotFoundError,
    InvalidDependencyError,
    InvalidMoveError,
    InvalidIndexError,
    InvalidBatchError,
    IdeaNotFoundError,
    VersionConflictError,
    UndoBlockedError,
};
export type { IdeaRef, TaskDraft, PromotionDraft, ResolvedDependency };
