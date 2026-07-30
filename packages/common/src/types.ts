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

// Full server-side project state exposed to clients (REST and MCP).
export type ProjectState = {
    version: number;
    activeProject: string | null;
    goal: Task;
    inbox: string[];
};

// On-disk format for saved projects.
export type StoredProjectV2 = {
    formatVersion: 2;
    goal: Task;
    inbox: string[];
};
