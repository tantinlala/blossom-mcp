import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectState } from "@blossom/common";
import { APIClient } from "../utils/APIClient";
import { PlanManager } from "../utils/PlanManager";

const POLL_INTERVAL_MS = 3000;

/** Whether what is on screen matches the copy on disk. */
export type SaveState = "neverSaved" | "saved" | "unsaved";

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

    // The server bumps its version on every mutation, so comparing the current
    // version against the one captured at the last save is enough to know
    // whether there is anything unsaved - including edits made over MCP.
    const [version, setVersion] = useState<number>(0);
    const [savedVersion, setSavedVersion] = useState<number | null>(null);

    const applyState = useCallback(
        (state: ProjectState) => {
            versionRef.current = state.version;
            setVersion(state.version);
            planManager.applyServerState(state.goal);
            targetsRef.current.setIdeaList(state.inbox);
            targetsRef.current.syncRoadmap();
        },
        [planManager],
    );

    /** Call once what is on screen has been written to disk, or read from it. */
    const markSaved = useCallback(() => setSavedVersion(versionRef.current), []);

    /** Call for a project that has no file behind it yet. */
    const markNeverSaved = useCallback(() => setSavedVersion(null), []);

    let saveState: SaveState = "unsaved";
    if (savedVersion === null) {
        saveState = "neverSaved";
    } else if (savedVersion === version) {
        saveState = "saved";
    }

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

    return { applyState, registerTargets, setEditingPaused, saveState, markSaved, markNeverSaved };
}
