export type Task = {
    name: string;
    description?: string;
    id: string;
    completionState: boolean;
    plan: Plan;
};

export type Dependency = {
    source: string;
    target: string;
};

export type Plan = {
    tasksList: Task[];
    dependenciesList: Dependency[];
};

// Sentinel id for the root goal node. Dependencies within a plan may target
// this id to indicate they feed directly into the plan's goal.
export const GOAL_ID = "Goal";

/**
 * One raw idea parked in the inbox. The id is stable for the lifetime of the
 * entry: it survives every other idea being added, edited, removed or promoted
 * around it, which a position does not.
 */
export type InboxIdea = {
    id: string;
    text: string;
};

/**
 * Full server-side project state exposed to clients (REST and MCP).
 *
 * `inbox` is ordered newest first: a freshly added idea is element 0.
 */
export type ProjectState = {
    version: number;
    activeProject: string | null;
    goal: Task;
    inbox: InboxIdea[];
};

// On-disk format for saved projects, newest first.
export type StoredProjectV3 = {
    formatVersion: 3;
    goal: Task;
    inbox: InboxIdea[];
};

export type StoredProjectV2 = {
    formatVersion: 2;
    goal: Task;
    inbox: string[];
};
