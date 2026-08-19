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
 * One project as clients see it (REST, socket and MCP).
 *
 * `key` addresses the project for as long as the server holds it open, and is
 * what every write names to say which project it means. A project with a file
 * behind it is keyed by its filename; one with nothing saved yet is keyed by a
 * minted name and reports `savedToDisk: false`.
 *
 * `inbox` is ordered newest first: a freshly added idea is element 0.
 */
export type ProjectState = {
    version: number;
    key: string;
    savedToDisk: boolean;
    goal: Task;
    inbox: InboxIdea[];
};

/**
 * Everything one session is looking at. Each session keeps its own view, so two
 * browsers can sit on different projects, or on different combinations of them,
 * at the same time.
 *
 * `projects` is in the order the session asked for them, which is the order the
 * board draws its lanes in. `assistantProject` is the key of the project MCP
 * tool calls act on, and is the same for everybody.
 */
export type ViewState = {
    projects: ProjectState[];
    assistantProject: string | null;
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
