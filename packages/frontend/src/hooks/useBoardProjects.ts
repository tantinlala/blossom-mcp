import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectState } from "@blossom/common";
import { APIClient } from "../utils/APIClient";
import { RealtimeClient } from "../utils/RealtimeClient";
import { WorkspaceManager } from "../utils/WorkspaceManager";
import { readSelection, writeSelection } from "../utils/viewSelection";
import { PromptForText } from "./useTextPrompt";
import { AskForConfirmation } from "./useConfirm";

interface UseBoardProjectsDeps {
    apiClient: APIClient;
    realtime: RealtimeClient;
    workspace: WorkspaceManager;
    addProject: (state: ProjectState) => void;
    removeProject: (key: string) => void;
    applyProject: (state: ProjectState) => void;
    markSaved: (key: string) => void;
    promptForText: PromptForText;
    askForConfirmation: AskForConfirmation;
    /** Shows the user something worth knowing that is not an error. */
    notify?: (message: string) => void;
}

/**
 * Which projects this session has on its board, and the housekeeping that goes
 * with them: listing what is saved, opening and closing lanes, starting new
 * projects, saving, reloading and deleting, and choosing which project MCP works
 * on.
 *
 * The board belongs to this session alone. Opening a project puts it on this
 * board and leaves every other browser exactly where it was, which is why none
 * of this needs anybody's agreement first. The one shared choice is which
 * project the assistant works on, and everybody is told when it moves.
 */
export function useBoardProjects({
    apiClient,
    realtime,
    workspace,
    addProject,
    removeProject,
    applyProject,
    markSaved,
    promptForText,
    askForConfirmation,
    notify,
}: UseBoardProjectsDeps) {
    const [savedProjects, setSavedProjects] = useState<string[]>([]);
    const [openProjects, setOpenProjects] = useState<string[]>([]);
    const [assistantProject, setAssistantProject] = useState<string | null>(null);
    const selectionRef = useRef<string[]>([]);

    /** Records the board in the address bar and in storage, and tells the server. */
    const publishSelection = useCallback(
        (keys: string[]) => {
            selectionRef.current = keys;
            setOpenProjects(keys);
            writeSelection(keys);
            realtime.subscribe(keys);
        },
        [realtime],
    );

    const reportProblem = useCallback(
        (message: string) => {
            notify?.(message);
        },
        [notify],
    );

    const refreshSavedProjects = useCallback(async () => {
        const listing = await apiClient.listProjects();
        if (listing === undefined) {
            reportProblem("Could not list the saved projects.");
            return;
        }
        setSavedProjects(listing.projects);
        setAssistantProject(listing.assistantProject);
    }, [apiClient, reportProblem]);

    /**
     * Opens the board this session was last on. The projects come from the
     * address bar or from storage, so a link opens the board it names and a
     * revisit lands back where the person left off.
     */
    const initializeApp = useCallback(async () => {
        await refreshSavedProjects();

        const keys = readSelection();
        publishSelection(keys);
        if (keys.length === 0) {
            return;
        }

        const view = await apiClient.getView(keys);
        if (view === undefined) {
            reportProblem("Could not load the board.");
            return;
        }
        // A project named by a stale link is left out of what comes back, so the
        // board settles on the projects that are actually there.
        const landed = view.projects.map((project) => project.key);
        if (landed.length !== keys.length) {
            publishSelection(landed);
        }
        for (const project of view.projects) {
            if (project.savedToDisk) {
                markSaved(project.key);
            }
        }
    }, [apiClient, refreshSavedProjects, publishSelection, markSaved, reportProblem]);

    /** Puts a saved project on the board. */
    const openProject = useCallback(
        async (filename: string): Promise<boolean> => {
            if (selectionRef.current.includes(filename)) {
                return true;
            }
            const state = await apiClient.openProject(filename);
            if (state === undefined) {
                reportProblem("Could not open that project.");
                return false;
            }
            publishSelection([...selectionRef.current, state.key]);
            addProject(state);
            // Just read from disk, so the two match by definition.
            markSaved(state.key);
            return true;
        },
        [apiClient, publishSelection, addProject, markSaved, reportProblem],
    );

    /**
     * Takes a project off this board. The project stays open on the server for
     * anybody else looking at it, and its work is untouched.
     */
    const closeProject = useCallback(
        (key: string) => {
            publishSelection(selectionRef.current.filter((entry) => entry !== key));
            removeProject(key);
        },
        [publishSelection, removeProject],
    );

    /** Starts an empty project and puts it on the board beside whatever is there. */
    const startNewProject = useCallback(async (): Promise<string | null> => {
        const state = await apiClient.newProject();
        if (state === undefined) {
            reportProblem("Could not start a new project.");
            return null;
        }
        publishSelection([...selectionRef.current, state.key]);
        addProject(state);
        return state.key;
    }, [apiClient, publishSelection, addProject, reportProblem]);

    const saveProject = useCallback(
        async (projectKey: string, filename: string): Promise<void> => {
            const result = await apiClient.saveProject(projectKey, filename);
            if (result === undefined) {
                reportProblem("Could not save the project.");
                return;
            }
            setSavedProjects(result.projects);
            // A project written under another filename answers to it from then
            // on. The server tells every session looking at it, this one
            // included, so the board follows it there.
            applyProject(result.state);
            markSaved(result.state.key);
        },
        [apiClient, applyProject, markSaved, reportProblem],
    );

    /** Asks for a filename and writes the project to it. */
    const onSave = useCallback(
        async (projectKey: string | null) => {
            if (!projectKey) {
                return;
            }
            const filename = await promptForText({
                title: "Save project",
                label: "Filename",
                defaultValue: workspace.savedToDisk(projectKey) ? projectKey : "",
                confirmLabel: "Save",
            });
            if (filename === null) {
                return;
            }

            if (filename.trim()) {
                await saveProject(projectKey, filename.trim());
            } else {
                notify?.("A filename cannot be blank.");
            }
        },
        [promptForText, saveProject, workspace, notify],
    );

    /** Re-reads a project from disk, discarding what is on screen. */
    const onReload = useCallback(
        async (projectKey: string | null) => {
            if (!projectKey) {
                return;
            }
            if (!workspace.savedToDisk(projectKey)) {
                notify?.("There is nothing on disk to reload. Save it first.");
                return;
            }
            const state = await apiClient.reloadProject(projectKey);
            if (state === undefined) {
                reportProblem("Could not reload that project.");
                return;
            }
            applyProject(state);
            markSaved(state.key);
        },
        [apiClient, applyProject, markSaved, workspace, notify, reportProblem],
    );

    /**
     * Removes a saved project's file. Deleting one that is on a board leaves the
     * work on screen with nothing behind it, which is the state a project that
     * has never been saved is already in, so it is reported the same way.
     */
    const deleteProject = useCallback(
        async (filename: string): Promise<void> => {
            const confirmed = await askForConfirmation({
                title: `Delete ${filename}?`,
                message:
                    "The saved copy is removed for everyone and cannot be recovered. Anything currently open stays on screen.",
                confirmLabel: "Delete",
            });
            if (!confirmed) {
                return;
            }

            const result = await apiClient.deleteProject(filename);
            if (result === undefined) {
                reportProblem("Could not delete that project.");
                return;
            }

            setSavedProjects(result.projects);
            if (result.state) {
                applyProject(result.state);
            }
            notify?.(`Deleted ${filename}.`);
        },
        [apiClient, applyProject, askForConfirmation, notify, reportProblem],
    );

    /** Chooses which project MCP tool calls act on. */
    const chooseAssistantProject = useCallback(
        async (projectKey: string | null) => {
            const chosen = await apiClient.setAssistantProject(projectKey);
            if (chosen === undefined) {
                reportProblem("Could not choose that project for the assistant.");
                return;
            }
            setAssistantProject(chosen);
        },
        [apiClient, reportProblem],
    );

    /** Follows the choice the server reports, which every session is told about. */
    const applyAssistantProject = useCallback(
        (projectKey: string | null) => {
            workspace.applyAssistantProject(projectKey);
            setAssistantProject(projectKey);
        },
        [workspace],
    );

    // A project written under another filename answers to it from then on, so the
    // board - and the link that carries it - follows the project to its new name.
    useEffect(() => {
        return realtime.onNotice((notice) => {
            if (notice.kind !== "project-renamed") {
                return;
            }
            if (!selectionRef.current.includes(notice.from)) {
                return;
            }
            publishSelection(selectionRef.current.map((key) => (key === notice.from ? notice.to : key)));
            void refreshSavedProjects();
        });
    }, [realtime, publishSelection, refreshSavedProjects]);

    return {
        savedProjects,
        openProjects,
        assistantProject,
        initializeApp,
        refreshSavedProjects,
        openProject,
        closeProject,
        startNewProject,
        onSave,
        onReload,
        deleteProject,
        chooseAssistantProject,
        applyAssistantProject,
    };
}
