import { useCallback, useState } from "react";
import { ProjectState } from "@blossom/common";
import { APIClient } from "../utils/APIClient";
import { PlanManager } from "../utils/PlanManager";

interface UseInboxDeps {
    apiClient: APIClient;
    planManager: PlanManager;
    applyState: (state: ProjectState) => void;
    setEditingPaused: (paused: boolean) => void;
}

export function useInbox({ apiClient, planManager, applyState, setEditingPaused }: UseInboxDeps) {
    const [ideaList, setIdeaList] = useState<string[]>([]);

    const applyResult = useCallback(
        async (result: ProjectState | undefined) => {
            if (result) {
                applyState(result);
                return;
            }
            alert("Error: The operation failed. Refreshing project state.");
            const state = await apiClient.getState();
            if (state) {
                applyState(state);
            }
        },
        [apiClient, applyState],
    );

    const addIdea = useCallback(async () => {
        await applyResult(await apiClient.addIdea(""));
    }, [apiClient, applyResult]);

    const deleteIdea = useCallback(
        async (index: number) => {
            await applyResult(await apiClient.removeIdea(index));
        },
        [apiClient, applyResult],
    );

    // Keystroke edits stay local (and pause polling) so a background refetch
    // cannot clobber text mid-edit; commitIdea persists on blur/Enter.
    const changeIdea = useCallback(
        (index: number, newIdea: string) => {
            setEditingPaused(true);
            setIdeaList((prev) => {
                const next = [...prev];
                next[index] = newIdea;
                return next;
            });
        },
        [setEditingPaused],
    );

    const commitIdea = useCallback(
        async (index: number) => {
            setEditingPaused(false);
            await applyResult(await apiClient.updateIdea(index, ideaList[index] ?? ""));
        },
        [apiClient, applyResult, ideaList, setEditingPaused],
    );

    const addTaskToContextAndRemove = useCallback(
        async (index: number): Promise<void> => {
            await applyResult(await apiClient.promoteIdea(index, planManager.presentContextGoal.id));
        },
        [apiClient, planManager, applyResult],
    );

    const addAllIdeasToPlan = useCallback(async (): Promise<void> => {
        const parentId = planManager.presentContextGoal.id;
        let lastState: ProjectState | undefined;
        const count = ideaList.length;
        if (count === 0) {
            return;
        }
        for (let i = 0; i < count; i++) {
            // Always promote index 0: each promotion shifts the remaining ideas up
            lastState = await apiClient.promoteIdea(0, parentId);
            if (!lastState) {
                break;
            }
        }
        await applyResult(lastState);
    }, [apiClient, planManager, ideaList, applyResult]);

    return {
        ideaList,
        setIdeaList,
        addIdea,
        deleteIdea,
        changeIdea,
        commitIdea,
        addTaskToContextAndRemove,
        addAllIdeasToPlan,
    };
}
