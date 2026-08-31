import { TaskAndState } from "./extendedTasks";
import { Dependency, Task } from "@blossom/common";

/** One step of the drill-down path, used to render the breadcrumb. */
export interface RoadmapCrumb {
    id: string;
    name: string;
}

/**
 * A task that can be started now. Startable tasks are usually leaves nested in
 * subplans and so appear nowhere in the plan currently on screen, which is why
 * each one carries the path to where it actually lives - and, since a board can
 * hold several projects at once, which project that path belongs to.
 */
export interface NextTask {
    task: Task;
    projectKey: string;
    /** Ancestor tasks owning this one, outermost first. Empty at the top level. */
    path: RoadmapCrumb[];
}

export interface Roadmap {
    tasksList: TaskAndState[];
    dependenciesList: Dependency[];
    isSubplan: boolean;
    /** Root goal first, present context last. A single entry means the root. */
    ancestors: RoadmapCrumb[];
}

/**
 * One project's band across the board. Each lane holds the plan level that
 * project is drilled into, so two projects on one board can be looked at from
 * different depths at the same time.
 */
export interface BoardLane {
    projectKey: string;
    /** Whether a file holds this project's work. */
    savedToDisk: boolean;
    roadmap: Roadmap;
}

/** Every project a session is looking at, in the order the lanes are drawn. */
export interface Board {
    lanes: BoardLane[];
}

/** Which task, in which project. Every action on the board names one. */
export interface TaskRef {
    projectKey: string;
    taskId: string;
}
