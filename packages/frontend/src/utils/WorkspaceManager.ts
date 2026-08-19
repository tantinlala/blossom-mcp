import { GOAL_ID, ProjectState, Task, TaskState, ViewState } from "@blossom/common";
import { PlanManager } from "./PlanManager";
import { Board, BoardLane, NextTask, TaskRef } from "../types/roadmap";

interface Lane {
    key: string;
    savedToDisk: boolean;
    version: number;
    planManager: PlanManager;
}

/**
 * Every project this session is looking at, each with its own plan view-model.
 *
 * The board draws one lane per project, in the order the session asked for them,
 * and each lane is drilled into on its own - so one project can be open at a
 * subplan while the one beside it shows its top level. Which projects these are
 * is this session's business alone: another browser can be looking at an
 * entirely different set over the same server.
 *
 * It holds no React state and performs no mutations. Writes go through the
 * APIClient and come back as the project state this applies.
 */
class WorkspaceManager {
    private readonly _lanes = new Map<string, Lane>();
    private _order: string[] = [];
    private _assistantProject: string | null = null;

    /** The projects on the board, in lane order. */
    public get keys(): string[] {
        return this._order.filter((key) => this._lanes.has(key));
    }

    /** Which project MCP tool calls act on, as chosen by whoever set it. */
    public get assistantProject(): string | null {
        return this._assistantProject;
    }

    /**
     * Replaces the board with the projects the server says this session holds.
     * A project already on the board keeps its plan view-model, and with it the
     * level it is drilled into.
     */
    public applyView(view: ViewState) {
        this._order = view.projects.map((project) => project.key);
        this._assistantProject = view.assistantProject;

        for (const key of [...this._lanes.keys()]) {
            if (!this._order.includes(key)) {
                this._lanes.delete(key);
            }
        }
        for (const project of view.projects) {
            this.applyProject(project);
        }
    }

    /**
     * Applies one project's state. A project the board does not hold is somebody
     * else's business, and answers false so a caller can tell that nothing on
     * screen moved.
     */
    public applyProject(state: ProjectState): boolean {
        const lane = this._lanes.get(state.key);
        if (lane) {
            lane.savedToDisk = state.savedToDisk;
            lane.version = state.version;
            lane.planManager.applyServerState(state.goal);
            return true;
        }

        if (!this._order.includes(state.key)) {
            return false;
        }

        const planManager = new PlanManager(state.key);
        planManager.applyServerState(state.goal);
        this._lanes.set(state.key, {
            key: state.key,
            savedToDisk: state.savedToDisk,
            version: state.version,
            planManager,
        });
        return true;
    }

    /** Puts a project on the board, at the end, keeping the rest in place. */
    public addProject(state: ProjectState) {
        if (!this._order.includes(state.key)) {
            this._order = [...this._order, state.key];
        }
        this.applyProject(state);
    }

    /** Takes a project off the board. Its plan view-model goes with it. */
    public removeProject(key: string) {
        this._order = this._order.filter((entry) => entry !== key);
        this._lanes.delete(key);
    }

    /**
     * Follows a project that answers to a new key, keeping its place on the
     * board and the level it is drilled into. A project is renamed by being
     * written to disk under another filename.
     */
    public renameProject(from: string, to: string) {
        const lane = this._lanes.get(from);
        this._order = this._order.map((key) => (key === from ? to : key));
        if (!lane) {
            return;
        }
        this._lanes.delete(from);
        // The plan view-model keeps its tree and the level it is drilled into, so
        // a save under another filename leaves the person where they were.
        lane.planManager.setProjectKey(to);
        this._lanes.set(to, { ...lane, key: to });
    }

    /** Which key MCP acts on, as the server reports it. */
    public applyAssistantProject(key: string | null) {
        this._assistantProject = key;
    }

    public has(key: string): boolean {
        return this._lanes.has(key);
    }

    /** The plan view-model for one project, for the actions scoped to it. */
    public planManagerFor(key: string): PlanManager | null {
        return this._lanes.get(key)?.planManager ?? null;
    }

    public savedToDisk(key: string): boolean {
        return this._lanes.get(key)?.savedToDisk ?? false;
    }

    /** Each project's version counter, read by the poll that runs while the socket is down. */
    public versions(): Record<string, number> {
        const versions: Record<string, number> = {};
        for (const key of this.keys) {
            versions[key] = this._lanes.get(key)!.version;
        }
        return versions;
    }

    /**
     * Everything on screen: one lane per project, at the level that project is
     * open at.
     *
     * Every lane carries the goal entry that anchors it, so a project holding
     * nothing yet still draws its own goal node and takes up a band of the
     * canvas - which is what makes it visible, and reachable, on a board it
     * shares with projects that do hold work.
     */
    public board(): Board {
        const lanes: BoardLane[] = this.keys.map((key) => {
            const lane = this._lanes.get(key)!;
            const roadmap = { ...lane.planManager.presentContextRoadmap };
            if (!roadmap.tasksList.some((entry) => entry.task.id === GOAL_ID)) {
                const goal = lane.planManager.presentContextGoal;
                roadmap.tasksList = [
                    ...roadmap.tasksList,
                    {
                        task: { name: goal.name, id: GOAL_ID, completionState: false, plan: null as any },
                        state: TaskState.UNDETERMINED,
                    },
                ];
            }
            return { projectKey: key, savedToDisk: lane.savedToDisk, roadmap };
        });
        return { lanes };
    }

    /** The startable tasks across every project on the board, project by project. */
    public allUnblockedTasks(): NextTask[] {
        return this.keys.flatMap((key) => this._lanes.get(key)!.planManager.allUnblockedTasks);
    }

    /**
     * Finds a task anywhere on the board. Task ids are unique across projects, so
     * an id alone settles which project a task belongs to.
     */
    public findTask(taskId: string): { ref: TaskRef; task: Task } | null {
        for (const key of this.keys) {
            const task = this._lanes.get(key)!.planManager.findTask(taskId);
            if (task) {
                return { ref: { projectKey: key, taskId }, task };
            }
        }
        return null;
    }

    /** The task under that ref, as the plan level it sits in describes it. */
    public findTaskInContext(ref: TaskRef): Task | null {
        return this._lanes.get(ref.projectKey)?.planManager.findTaskInPresentContext(ref.taskId) ?? null;
    }
}

export { WorkspaceManager };
