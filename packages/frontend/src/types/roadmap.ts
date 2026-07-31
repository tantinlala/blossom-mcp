import { TaskAndState } from "./extendedTasks";
import { Dependency } from "@blossom/common";

/** One step of the drill-down path, used to render the breadcrumb. */
export interface RoadmapCrumb {
    id: string;
    name: string;
}

export interface Roadmap {
    tasksList: TaskAndState[];
    dependenciesList: Dependency[];
    isSubplan: boolean;
    /** Root goal first, present context last. A single entry means the root. */
    ancestors: RoadmapCrumb[];
}
