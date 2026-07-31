import { useCallback, useState } from "react";
import { PlanManager } from "../utils/PlanManager";
import { APIClient } from "../utils/APIClient";
import { Task, Dependency, ProjectState } from "@blossom/common";
import { Roadmap } from "../types/roadmap";

const EMPTY_ROADMAP: Roadmap = {
    tasksList: [],
    dependenciesList: [],
    isSubplan: false,
    ancestors: [],
};

export function useRoadmap(planManager: PlanManager, apiClient: APIClient, applyState: (state: ProjectState) => void) {
    const [presentlyShownRoadmap, setPresentlyShownRoadmap] = useState<Roadmap>(EMPTY_ROADMAP);
    const [unblockedTasks, setUnblockedTasks] = useState<Task[]>([]);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);

    // Runs on every applied server state, so both the graph and the "next task"
    // list stay in step with the plan. Snapshotting the list when its panel
    // opened instead left it stale as soon as anything changed underneath it,
    // including edits arriving over MCP.
    const syncRoadmap = useCallback(() => {
        setPresentlyShownRoadmap({ ...planManager.presentContextRoadmap });
        setUnblockedTasks(planManager.allUnblockedTasks);
    }, [planManager]);

    // Applies a mutation response; on failure (the APIClient swallows errors
    // and returns undefined, e.g. the task was deleted via MCP) refetches the
    // authoritative state so the UI cannot stay stale.
    const applyResult = useCallback(
        async (result: ProjectState | undefined): Promise<boolean> => {
            if (result) {
                applyState(result);
                return true;
            }
            alert("Error: The operation failed. Refreshing project state.");
            const state = await apiClient.getState();
            if (state) {
                applyState(state);
            }
            return false;
        },
        [apiClient, applyState],
    );

    const setGoal = useCallback(
        async (goalName: string) => {
            await applyResult(await apiClient.setGoal(goalName));
        },
        [apiClient, applyResult],
    );

    const addTask = useCallback(
        async (taskName: string): Promise<Task | null> => {
            const result = await apiClient.addTask(planManager.presentContextGoal.id, taskName);
            if (!result) {
                alert("Error: Unable to add task.");
                return null;
            }
            applyState(result.state);
            return result.task;
        },
        [planManager, apiClient, applyState],
    );

    const removeTask = useCallback(
        async (taskId: string) => {
            await applyResult(await apiClient.removeTask(taskId));
        },
        [apiClient, applyResult],
    );

    const connect = useCallback(
        async (source: string, target: string) => {
            await applyResult(await apiClient.addDependency(source, target));
        },
        [apiClient, applyResult],
    );

    const removeEdge = useCallback(
        async (source: string, target: string) => {
            await applyResult(await apiClient.removeDependency(source, target));
        },
        [apiClient, applyResult],
    );

    const updateEdge = useCallback(
        async (oldSource: string, oldTarget: string, newSource: string, newTarget: string) => {
            await applyResult(await apiClient.updateDependency(oldSource, oldTarget, newSource, newTarget));
        },
        [apiClient, applyResult],
    );

    const toggleComplete = useCallback(
        async (taskId: string) => {
            const task = planManager.findTask(taskId);
            if (!task) {
                return;
            }
            await applyResult(await apiClient.setTaskCompletion(taskId, !task.completionState));
        },
        [planManager, apiClient, applyResult],
    );

    const changeContextToWithinTask = useCallback(
        (taskId: string) => {
            planManager.changeContextToWithinTask(taskId);
            syncRoadmap();
        },
        [planManager, syncRoadmap],
    );

    const changeContextToParent = useCallback(
        (taskId: string) => {
            planManager.changeContextToParent(taskId);
            syncRoadmap();
        },
        [planManager, syncRoadmap],
    );

    const createPlanForTask = useCallback(
        async (taskId: string) => {
            await applyResult(await apiClient.createSubplan(taskId));
        },
        [apiClient, applyResult],
    );

    const selectTask = useCallback(
        (taskId: string): void => {
            const task = planManager.findTaskInPresentContext(taskId);
            if (task) {
                setSelectedTask({ ...task });
                return;
            }
            setSelectedTask(null);
        },
        [planManager],
    );

    const updateTaskDetails = useCallback(
        async (taskId: string, name: string, description?: string, completionState?: boolean): Promise<void> => {
            if (!selectedTask) {
                return;
            }

            if (name || description !== undefined) {
                await applyResult(await apiClient.updateTask(taskId, name || undefined, description));
            }

            if (completionState !== undefined && selectedTask.completionState !== completionState) {
                await applyResult(await apiClient.setTaskCompletion(taskId, completionState));
            }

            const updatedTask = planManager.findTaskInPresentContext(taskId);
            if (updatedTask) {
                setSelectedTask({ ...updatedTask });
            }
        },
        [planManager, apiClient, selectedTask, applyResult],
    );

    const handlePaste = useCallback(
        async (tasks: Task[], dependencies: Dependency[]) => {
            await applyResult(await apiClient.pasteTasks(planManager.presentContextGoal.id, tasks, dependencies));
        },
        [planManager, apiClient, applyResult],
    );

    const handleUndo = useCallback(async () => {
        const state = await apiClient.undo();
        if (!state) {
            return;
        }
        applyState(state);

        setSelectedTask((prev) => {
            if (!prev) return null;
            const found = planManager.findTaskInPresentContext(prev.id);
            return found ? { ...found } : null;
        });
    }, [planManager, apiClient, applyState]);

    const toggleNextTasksDrawer = useCallback(
        (open: boolean) => () => {
            setDrawerOpen(open);
        },
        [],
    );

    const toggleDetailsDrawer = useCallback(
        (open: boolean) => () => {
            setDetailsDrawerOpen(open);
        },
        [],
    );

    return {
        presentlyShownRoadmap,
        unblockedTasks,
        selectedTask,
        drawerOpen,
        detailsDrawerOpen,
        syncRoadmap,
        setSelectedTask,
        setGoal,
        addTask,
        removeTask,
        connect,
        removeEdge,
        updateEdge,
        toggleComplete,
        changeContextToWithinTask,
        changeContextToParent,
        createPlanForTask,
        selectTask,
        updateTaskDetails,
        handlePaste,
        handleUndo,
        toggleNextTasksDrawer,
        toggleDetailsDrawer,
    };
}
