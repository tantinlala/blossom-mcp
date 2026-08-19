import { useCallback, useEffect, useRef, useState } from "react";
import { InboxIdea, ProjectState, ViewState } from "@blossom/common";
import { APIClient, RequestFailure } from "../utils/APIClient";
import { ConnectionState, Notice, RealtimeClient } from "../utils/RealtimeClient";
import { WorkspaceManager } from "../utils/WorkspaceManager";

// Only used while the socket is down, so it is a safety net rather than the
// mechanism: pushed updates arrive in milliseconds.
const DEGRADED_POLL_INTERVAL_MS = 10000;

/** Whether what is on screen matches the copy on disk. */
export type SaveState = "neverSaved" | "saved" | "unsaved";

interface SyncTargets {
    /** Adopts the inbox of every project in the view, in one go. */
    applyInboxView: (view: ViewState) => void;
    /** Adopts one project's inbox. */
    applyRemoteInbox: (projectKey: string, ideas: InboxIdea[]) => void;
    /** Redraws the board from the workspace. */
    syncBoard: () => void;
    /** Follows which project MCP acts on. */
    applyAssistantProject: (projectKey: string | null) => void;
}

interface UseServerSyncDeps {
    apiClient: APIClient;
    workspace: WorkspaceManager;
    realtime: RealtimeClient;
    /** Shows the user something worth knowing that is not an error. */
    notify?: (message: string) => void;
}

/**
 * Keeps the client in sync with the server-owned project state.
 *
 * The server pushes every change to a project this session is looking at, so
 * changes made by anyone else - another person on another device, or an LLM
 * connected over MCP - land here as they happen. Mutation responses come through
 * the same applyProject path, and a slow poll covers the window while the socket
 * is down.
 *
 * Versions are tracked per project, since each project counts its own changes.
 */
export function useServerSync({ apiClient, workspace, realtime, notify }: UseServerSyncDeps) {
    const targetsRef = useRef<SyncTargets>({
        applyInboxView: () => {},
        applyRemoteInbox: () => {},
        syncBoard: () => {},
        applyAssistantProject: () => {},
    });
    const versionsRef = useRef<Record<string, number>>({});
    const serverIdRef = useRef<string | null>(null);
    const pollInFlightRef = useRef<boolean>(false);
    const notifyRef = useRef(notify);
    notifyRef.current = notify;

    // The server bumps a project's version on every mutation to it, so comparing
    // the current version against the one captured at the last save is enough to
    // know whether there is anything unsaved - including edits made over MCP.
    const [versions, setVersions] = useState<Record<string, number>>({});
    const [savedVersions, setSavedVersions] = useState<Record<string, number>>({});
    const [connectionState, setConnectionState] = useState<ConnectionState>(() => realtime.getConnectionState());

    const setVersionFor = useCallback((key: string, version: number) => {
        versionsRef.current = { ...versionsRef.current, [key]: version };
        setVersions(versionsRef.current);
    }, []);

    /** Replaces the board with what the server says this session is looking at. */
    const applyView = useCallback(
        (view: ViewState) => {
            workspace.applyView(view);

            const next: Record<string, number> = {};
            for (const project of view.projects) {
                next[project.key] = project.version;
            }
            versionsRef.current = next;
            setVersions(next);

            targetsRef.current.applyInboxView(view);
            targetsRef.current.applyAssistantProject(view.assistantProject);
            targetsRef.current.syncBoard();
        },
        [workspace],
    );

    /**
     * Applies one project's state. A project this session is not looking at
     * belongs to somebody else's board and is left alone.
     */
    const applyProject = useCallback(
        (state: ProjectState) => {
            if (!workspace.applyProject(state)) {
                return;
            }
            setVersionFor(state.key, state.version);
            targetsRef.current.applyRemoteInbox(state.key, state.inbox);
            targetsRef.current.syncBoard();
        },
        [workspace, setVersionFor],
    );

    /** Puts a project this session has just opened or started onto the board. */
    const addProject = useCallback(
        (state: ProjectState) => {
            workspace.addProject(state);
            setVersionFor(state.key, state.version);
            targetsRef.current.applyRemoteInbox(state.key, state.inbox);
            targetsRef.current.syncBoard();
        },
        [workspace, setVersionFor],
    );

    /** Takes a project off the board, and with it everything tracked about it. */
    const removeProject = useCallback(
        (key: string) => {
            workspace.removeProject(key);
            const { [key]: removedVersion, ...remainingVersions } = versionsRef.current;
            versionsRef.current = remainingVersions;
            setVersions(remainingVersions);
            setSavedVersions(({ [key]: removedSave, ...rest }) => rest);
            targetsRef.current.syncBoard();
        },
        [workspace],
    );

    /**
     * Applies a pushed update. A project's version counter only ever climbs, so
     * an update at or below the one already held is stale - a duplicate delivery,
     * a reordered frame, or the echo of a change this client just made - and
     * dropping it is what makes the push path idempotent.
     *
     * A restarted server counts from the beginning again, so a new server id is
     * taken as reason to trust whatever arrives.
     */
    const applyUpdate = useCallback(
        (state: ProjectState, serverId?: string) => {
            const restarted =
                serverId !== undefined && serverIdRef.current !== null && serverId !== serverIdRef.current;
            if (serverId !== undefined) {
                serverIdRef.current = serverId;
            }
            const held = versionsRef.current[state.key];
            if (!restarted && held !== undefined && state.version <= held) {
                return;
            }
            applyProject(state);
        },
        [applyProject],
    );

    /** Call once a project has been written to disk, or read from it. */
    const markSaved = useCallback((key: string) => {
        setSavedVersions((previous) => ({ ...previous, [key]: versionsRef.current[key] ?? 0 }));
    }, []);

    /** Where one project stands against its copy on disk. */
    const saveStateOf = useCallback(
        (key: string | null): SaveState => {
            if (!key || !workspace.savedToDisk(key)) {
                return "neverSaved";
            }
            return savedVersions[key] === versions[key] ? "saved" : "unsaved";
        },
        [workspace, savedVersions, versions],
    );

    /** Follows a project that answers to a new key, keeping what is tracked about it. */
    const renameProject = useCallback(
        (from: string, to: string) => {
            workspace.renameProject(from, to);

            const { [from]: version, ...otherVersions } = versionsRef.current;
            versionsRef.current = version === undefined ? otherVersions : { ...otherVersions, [to]: version };
            setVersions(versionsRef.current);

            setSavedVersions(({ [from]: saved, ...rest }) => (saved === undefined ? rest : { ...rest, [to]: saved }));
            targetsRef.current.syncBoard();
        },
        [workspace],
    );

    // Hooks that own React state register their setters here (they are created
    // after this hook, so registration happens via an effect in App).
    const registerTargets = useCallback((targets: SyncTargets) => {
        targetsRef.current = targets;
    }, []);

    useEffect(() => {
        const unsubscribes = [
            realtime.onView(({ view, serverId }) => {
                serverIdRef.current = serverId;
                applyView(view);
            }),
            realtime.onState(({ state, serverId }) => applyUpdate(state, serverId)),
            realtime.onConnectionChange(setConnectionState),
            realtime.onProtocolMismatch(() =>
                notifyRef.current?.("This page is out of date and has stopped syncing. Reload to continue."),
            ),
            realtime.onNotice((notice: Notice) => {
                if (notice.kind === "assistant-target") {
                    targetsRef.current.applyAssistantProject(notice.project);
                    return;
                }
                renameProject(notice.from, notice.to);
                // Whoever saved the project watched themselves do it.
                if (!notice.byThisBrowser) {
                    notifyRef.current?.(`${notice.from} was saved as ${notice.to}`);
                }
                markSaved(notice.to);
            }),
        ];
        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    }, [realtime, applyView, applyUpdate, renameProject, markSaved]);

    // A rejected write leaves this client holding state the server disagrees
    // with, and the server hands back its own copy precisely so that can be
    // repaired here rather than in every call site.
    useEffect(() => {
        return apiClient.onRequestFailure((failure: RequestFailure) => {
            if (failure.state) {
                applyProject(failure.state);
            }
            if (failure.code === "conflict" || failure.code === "undo-blocked") {
                notifyRef.current?.(failure.message);
            }
        });
    }, [apiClient, applyProject]);

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
                const keys = workspace.keys;
                if (keys.length === 0) {
                    return;
                }
                const polled = await apiClient.getViewVersions(keys);
                if (polled === undefined) {
                    return;
                }
                const moved = keys.some((key) => polled[key] !== undefined && polled[key] !== versionsRef.current[key]);
                if (!moved) {
                    return;
                }
                const view = await apiClient.getView(keys);
                if (view) {
                    applyView(view);
                }
            } finally {
                pollInFlightRef.current = false;
            }
        };

        const interval = setInterval(poll, DEGRADED_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [apiClient, applyView, connectionState, workspace]);

    return {
        applyView,
        applyProject,
        addProject,
        removeProject,
        renameProject,
        registerTargets,
        saveStateOf,
        markSaved,
        connectionState,
    };
}
