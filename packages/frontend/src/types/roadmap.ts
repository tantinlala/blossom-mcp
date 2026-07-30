import { TaskAndState } from "./extendedTasks";
import { Dependency } from "@blossom/common";

export interface Roadmap {
    tasksList: TaskAndState[];
    dependenciesList: Dependency[];
    isSubplan: boolean;
}
