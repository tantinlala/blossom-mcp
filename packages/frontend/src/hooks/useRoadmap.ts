import { useCallback, useState } from "react";
import { WorkspaceManager } from "../utils/WorkspaceManager";
import { APIClient } from "../utils/APIClient";
import { Task, Dependency, ProjectState } from "@blossom/common";
import { Board, NextTask, TaskRef } from "../types/roadmap";

const EMPTY_BOARD: Board = { lanes: [] };

/** A task on the board, and which project it belongs to. */
export interface SelectedTask {
    ref: TaskRef;
    task: Task;
}

export function useRoadmap(
    workspace: WorkspaceManager,
    apiClient: APIClient,
    applyProject: (state: ProjectState) => void,
    notify?: (message: string) => void,
) {
    const [board, setBoard] = useState<Board>(EMPTY_BOARD);
    const [unblockedTasks, setUnblockedTasks] = useState<NextTask[]>([]);
    const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);

    // Runs on every applied project state, so both the board and the "next task"
    // list stay in step with the plans. Snapshotting the list when its panel
    // opened instead left it stale as soon as anything changed underneath it,
    // including edits arriving over MCP.
    const syncBoard = useCallback(() => {
        setBoard(workspace.board());
        setUnblockedTasks(workspace.allUnblockedTasks());
    }, [workspace]);

    /**
     * Applies a mutation response. On failure the APIClient returns undefined
     * (e.g. the task was deleted by somebody else first). A refusal comes back
     * with the server's own state and an explanation, both already handled
     * centrally; anything else is unexplained, so refetch to avoid staying stale.
     */
    const applyResult = useCallback(
        async (projectKey: string, result: ProjectState | undefined): Promise<boolean> => {
            if (result) {
                applyProject(result);
                return true;
            }

            const failure = apiClient.lastFailure();
            if (failure?.state) {
                return false;
            }

            notify?.("That did not work. Refreshing the project.");
            const view = await apiClient.getView([projectKey]);
            const state = view?.projects.find((project) => project.key === projectKey);
            if (state) {
                applyProject(state);
            }
            return false;
        },
        [apiClient, applyProject, notify],
    );

    const setGoal = useCallback(
        async (projectKey: string, goalName: string) => {
            await applyResult(projectKey, await apiClient.setGoal(projectKey, goalName));
        },
        [apiClient, applyResult],
    );

    /** Adds a task to the plan level the project is drilled into. */
    const addTask = useCallback(
        async (projectKey: string, taskName: string): Promise<Task | null> => {
            const planManager = workspace.planManagerFor(projectKey);
            if (!planManager) {
                return null;
            }
            const result = await apiClient.addTask(projectKey, planManager.presentContextGoal.id, taskName);
            if (!result) {
                notify?.("Could not add that task.");
                return null;
            }
            applyProject(result.state);
            return result.task;
        },
        [workspace, apiClient, applyProject, notify],
    );

    const removeTask = useCallback(
        async (ref: TaskRef) => {
            await applyResult(ref.projectKey, await apiClient.removeTask(ref.projectKey, ref.taskId));
        },
        [apiClient, applyResult],
    );

    const connect = useCallback(
        async (projectKey: string, source: string, target: string) => {
            await applyResult(projectKey, await apiClient.addDependency(projectKey, source, target));
        },
        [apiClient, applyResult],
    );

    const removeEdge = useCallback(
        async (projectKey: string, source: string, target: string) => {
            await applyResult(projectKey, await apiClient.removeDependency(projectKey, source, target));
        },
        [apiClient, applyResult],
    );

    const updateEdge = useCallback(
        async (projectKey: string, oldSource: string, oldTarget: string, newSource: string, newTarget: string) => {
            await applyResult(
                projectKey,
                await apiClient.updateDependency(projectKey, oldSource, oldTarget, newSource, newTarget),
            );
        },
        [apiClient, applyResult],
    );

    const toggleComplete = useCallback(
        async (ref: TaskRef) => {
            const found = workspace.findTask(ref.taskId);
            if (!found) {
                return;
            }
            await applyResult(
                ref.projectKey,
                await apiClient.setTaskCompletion(ref.projectKey, ref.taskId, !found.task.completionState),
            );
        },
        [workspace, apiClient, applyResult],
    );

    const changeContextToWithinTask = useCallback(
        (ref: TaskRef) => {
            workspace.planManagerFor(ref.projectKey)?.changeContextToWithinTask(ref.taskId);
            syncBoard();
        },
        [workspace, syncBoard],
    );

    const changeContextToParent = useCallback(
        (ref: TaskRef) => {
            workspace.planManagerFor(ref.projectKey)?.changeContextToParent(ref.taskId);
            syncBoard();
        },
        [workspace, syncBoard],
    );

    const createPlanForTask = useCallback(
        async (ref: TaskRef) => {
            await applyResult(ref.projectKey, await apiClient.createSubplan(ref.projectKey, ref.taskId));
        },
        [apiClient, applyResult],
    );

    const selectTask = useCallback(
        (ref: TaskRef): void => {
            const task = workspace.findTaskInContext(ref);
            setSelectedTask(task ? { ref, task: { ...task } } : null);
        },
        [workspace],
    );

    const updateTaskDetails = useCallback(
        async (name: string, description?: string, completionState?: boolean): Promise<void> => {
            if (!selectedTask) {
                return;
            }
            const { ref } = selectedTask;

            if (name || description !== undefined) {
                await applyResult(
                    ref.projectKey,
                    await apiClient.updateTask(ref.projectKey, ref.taskId, name || undefined, description),
                );
            }

            if (completionState !== undefined && selectedTask.task.completionState !== completionState) {
                await applyResult(
                    ref.projectKey,
                    await apiClient.setTaskCompletion(ref.projectKey, ref.taskId, completionState),
                );
            }

            const updatedTask = workspace.findTaskInContext(ref);
            if (updatedTask) {
                setSelectedTask({ ref, task: { ...updatedTask } });
            }
        },
        [workspace, apiClient, selectedTask, applyResult],
    );

    const handlePaste = useCallback(
        async (projectKey: string, tasks: Task[], dependencies: Dependency[]) => {
            const planManager = workspace.planManagerFor(projectKey);
            if (!planManager) {
                return;
            }
            await applyResult(
                projectKey,
                await apiClient.pasteTasks(projectKey, planManager.presentContextGoal.id, tasks, dependencies),
            );
        },
        [workspace, apiClient, applyResult],
    );

    const handleUndo = useCallback(
        async (projectKey: string) => {
            const state = await apiClient.undo(projectKey);
            if (!state) {
                return;
            }
            applyProject(state);

            setSelectedTask((previous) => {
                if (!previous) return null;
                const found = workspace.findTaskInContext(previous.ref);
                return found ? { ref: previous.ref, task: { ...found } } : null;
            });
        },
        [workspace, apiClient, applyProject],
    );

    return {
        board,
        unblockedTasks,
        selectedTask,
        syncBoard,
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
    };
}
