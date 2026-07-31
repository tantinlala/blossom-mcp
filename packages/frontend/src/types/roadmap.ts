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
 * each one carries the path to where it actually lives.
 */
export interface NextTask {
    task: Task;
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
