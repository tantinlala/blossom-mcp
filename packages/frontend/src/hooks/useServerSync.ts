import { useCallback, useEffect, useRef } from "react";
import { ProjectState } from "@blossom/common";
import { APIClient } from "../utils/APIClient";
import { PlanManager } from "../utils/PlanManager";

const POLL_INTERVAL_MS = 3000;

interface SyncTargets {
    setIdeaList: (ideas: string[]) => void;
    syncRoadmap: () => void;
}

interface UseServerSyncDeps {
    apiClient: APIClient;
    planManager: PlanManager;
}

/**
 * Keeps the client in sync with the server-owned project state. Every REST
 * mutation response is pushed through applyState, so polling only needs to
 * catch changes made by other writers (e.g. an LLM connected via MCP): it
 * checks the state version counter every few seconds and refetches the full
 * state when it moved.
 */
export function useServerSync({ apiClient, planManager }: UseServerSyncDeps) {
    const targetsRef = useRef<SyncTargets>({ setIdeaList: () => {}, syncRoadmap: () => {} });
    const versionRef = useRef<number>(0);
    const editingPausedRef = useRef<boolean>(false);
    const pollInFlightRef = useRef<boolean>(false);

    const applyState = useCallback(
        (state: ProjectState) => {
            versionRef.current = state.version;
            planManager.applyServerState(state.goal);
            targetsRef.current.setIdeaList(state.inbox);
            targetsRef.current.syncRoadmap();
        },
        [planManager],
    );

    // Hooks that own React state register their setters here (they are created
    // after this hook, so registration happens via an effect in App).
    const registerTargets = useCallback((targets: SyncTargets) => {
        targetsRef.current = targets;
    }, []);

    // While the user is mid-edit (e.g. typing an inbox idea), polling is
    // paused so a refetch cannot clobber the in-progress text.
    const setEditingPaused = useCallback((paused: boolean) => {
        editingPausedRef.current = paused;
    }, []);

    useEffect(() => {
        const poll = async () => {
            if (pollInFlightRef.current || editingPausedRef.current) {
                return;
            }
            pollInFlightRef.current = true;
            try {
                const version = await apiClient.getStateVersion();
                if (version !== undefined && version !== versionRef.current) {
                    const state = await apiClient.getState();
                    if (state) {
                        applyState(state);
                    }
                }
            } finally {
                pollInFlightRef.current = false;
            }
        };

        const interval = setInterval(poll, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [apiClient, applyState]);

    return { applyState, registerTargets, setEditingPaused };
}
