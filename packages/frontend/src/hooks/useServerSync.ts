import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectState } from "@blossom/common";
import { APIClient, RequestFailure } from "../utils/APIClient";
import { ConnectionState, Notice, RealtimeClient } from "../utils/RealtimeClient";
import { PlanManager } from "../utils/PlanManager";

// Only used while the socket is down, so it is a safety net rather than the
// mechanism: pushed updates arrive in milliseconds.
const DEGRADED_POLL_INTERVAL_MS = 10000;

/** Whether what is on screen matches the copy on disk. */
export type SaveState = "neverSaved" | "saved" | "unsaved";

interface SyncTargets {
    applyRemoteInbox: (ideas: string[]) => void;
    applyActiveProject: (activeProject: string | null) => void;
    syncRoadmap: () => void;
}

interface UseServerSyncDeps {
    apiClient: APIClient;
    planManager: PlanManager;
    realtime: RealtimeClient;
    /** Shows the user something worth knowing that is not an error. */
    notify?: (message: string) => void;
}

/**
 * Keeps the client in sync with the server-owned project state.
 *
 * The server pushes every change over the realtime socket, so changes made by
 * anyone else - another person on another device, or an LLM connected over MCP
 * - land here as they happen. Mutation responses come through the same
 * applyState path, and a slow poll covers the window while the socket is down.
 */
export function useServerSync({ apiClient, planManager, realtime, notify }: UseServerSyncDeps) {
    const targetsRef = useRef<SyncTargets>({
        applyRemoteInbox: () => {},
        applyActiveProject: () => {},
        syncRoadmap: () => {},
    });
    const versionRef = useRef<number>(0);
    const serverIdRef = useRef<string | null>(null);
    const pollInFlightRef = useRef<boolean>(false);
    const notifyRef = useRef(notify);
    notifyRef.current = notify;

    // The server bumps its version on every mutation, so comparing the current
    // version against the one captured at the last save is enough to know
    // whether there is anything unsaved - including edits made over MCP.
    const [version, setVersion] = useState<number>(0);
    const [savedVersion, setSavedVersion] = useState<number | null>(null);
    const [connectionState, setConnectionState] = useState<ConnectionState>(() => realtime.getConnectionState());

    const applyState = useCallback(
        (state: ProjectState) => {
            versionRef.current = state.version;
            setVersion(state.version);
            planManager.applyServerState(state.goal);
            targetsRef.current.applyRemoteInbox(state.inbox);
            targetsRef.current.applyActiveProject(state.activeProject);
            targetsRef.current.syncRoadmap();
        },
        [planManager],
    );

    /**
     * Applies a pushed update. The version counter only ever climbs, so an
     * update at or below the one already held is stale - a duplicate delivery,
     * a reordered frame, or the echo of a change this client just made - and
     * dropping it is what makes the push path idempotent.
     *
     * Snapshots bypass the check: they arrive on connect, and after a server
     * restart the version starts over below whatever the client is holding.
     */
    const applyUpdate = useCallback(
        (state: ProjectState, isSnapshot: boolean, serverId?: string) => {
            const restarted =
                serverId !== undefined && serverIdRef.current !== null && serverId !== serverIdRef.current;
            if (serverId !== undefined) {
                serverIdRef.current = serverId;
            }
            if (!isSnapshot && !restarted && state.version <= versionRef.current) {
                return;
            }
            applyState(state);
        },
        [applyState],
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

    useEffect(() => {
        const unsubscribes = [
            realtime.onState(({ state, isSnapshot, serverId }) => applyUpdate(state, isSnapshot, serverId)),
            realtime.onConnectionChange(setConnectionState),
            realtime.onProtocolMismatch(() =>
                notifyRef.current?.("This page is out of date and has stopped syncing. Reload to continue."),
            ),
            realtime.onNotice((notice: Notice) => {
                const target = notice.project ?? "a new project";
                notifyRef.current?.(`Somebody switched everyone to ${target}`);
                // The notice follows the state that carried the switch, so the
                // version is already current. Whoever did the switching knows
                // how it stands against disk; everyone else learns it here.
                if (notice.project) {
                    markSaved();
                } else {
                    markNeverSaved();
                }
            }),
        ];
        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    }, [realtime, applyUpdate, markSaved, markNeverSaved]);

    // A rejected write leaves this client holding state the server disagrees
    // with, and the server hands back its own copy precisely so that can be
    // repaired here rather than in every call site.
    useEffect(() => {
        return apiClient.onRequestFailure((failure: RequestFailure) => {
            if (failure.state) {
                applyUpdate(failure.state, true);
            }
            if (failure.code === "conflict" || failure.code === "undo-blocked") {
                notifyRef.current?.(failure.message);
            }
        });
    }, [apiClient, applyUpdate]);

    useEffect(() => {
        if (connectionState === "open") {
            return;
        }

        const poll = async () => {
            if (pollInFlightRef.current) {
                return;
            }
            pollInFlightRef.current = true;
            try {
                const polledVersion = await apiClient.getStateVersion();
                if (polledVersion !== undefined && polledVersion !== versionRef.current) {
                    const state = await apiClient.getState();
                    if (state) {
                        applyState(state);
                    }
                }
            } finally {
                pollInFlightRef.current = false;
            }
        };

        const interval = setInterval(poll, DEGRADED_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [apiClient, applyState, connectionState]);

    return {
        applyState,
        registerTargets,
        saveState,
        markSaved,
        markNeverSaved,
        connectionState,
    };
}
