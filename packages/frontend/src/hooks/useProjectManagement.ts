import { useCallback, useRef, useState } from "react";
import { APIClient } from "../utils/APIClient";
import { ProjectState, Task } from "@blossom/common";
import { PromptForText } from "./useTextPrompt";
import { AskForConfirmation } from "./useConfirm";

interface UseProjectManagementDeps {
    apiClient: APIClient;
    applyState: (state: ProjectState) => void;
    setSelectedTask: React.Dispatch<React.SetStateAction<Task | null>>;
    promptForText: PromptForText;
    askForConfirmation: AskForConfirmation;
    markSaved: () => void;
    markNeverSaved: () => void;
    /** Shows the user something worth knowing that is not an error. */
    notify?: (message: string) => void;
}

export function useProjectManagement({
    apiClient,
    applyState,
    setSelectedTask,
    promptForText,
    askForConfirmation,
    markSaved,
    markNeverSaved,
    notify,
}: UseProjectManagementDeps) {
    const [existingProjects, setExistingProjects] = useState<string[]>([]);
    const [selectedProject, setSelectedProject] = useState("");
    const existingProjectsRef = useRef(existingProjects);
    existingProjectsRef.current = existingProjects;

    /**
     * Follows the active project the server reports. Anyone opening or saving a
     * project changes it for everybody, so the selector has to track state
     * arriving from other people rather than only what this browser chose.
     *
     * A project somebody else has just saved under a new name will not be in
     * this browser's list yet, and a selector whose value has no matching option
     * renders blank - so the list is refetched when that happens.
     */
    const applyActiveProject = useCallback(
        (activeProject: string | null) => {
            setSelectedProject(activeProject ?? "");
            if (!activeProject || existingProjectsRef.current.includes(activeProject)) {
                return;
            }
            apiClient.listExistingProjects().then((projects) => {
                if (projects) {
                    setExistingProjects(projects);
                }
            });
        },
        [apiClient],
    );

    // Declining a confirmation is a decision, not a failure, so it is reported
    // as neither. Everything else goes to the notice channel, which leaves the
    // tab usable while the message is up.
    const reportProblem = useCallback(
        (message: string) => {
            if (apiClient.lastFailure()?.code === "cancelled") {
                return;
            }
            notify?.(message);
        },
        [apiClient, notify],
    );

    const setupNewProject = useCallback(async () => {
        setSelectedProject("");
        const state = await apiClient.newProject();
        if (state === undefined) {
            reportProblem("Could not start a new project.");
            return;
        }
        applyState(state);
        setSelectedTask({ ...state.goal });
        // A brand new project has no file behind it yet
        markNeverSaved();
    }, [apiClient, applyState, setSelectedTask, markNeverSaved, reportProblem]);

    const restoreProject = useCallback(
        async (filename: string): Promise<boolean> => {
            const state = await apiClient.restoreProject(filename);
            if (state === undefined) {
                reportProblem("Could not open that project.");
                return false;
            }

            applyState(state);
            setSelectedTask({ ...state.goal });
            // Just read from disk, so the two match by definition
            markSaved();
            return true;
        },
        [apiClient, applyState, setSelectedTask, markSaved, reportProblem],
    );

    const initializeApp = useCallback(async () => {
        const retrievedProjects = await apiClient.listExistingProjects();
        if (retrievedProjects === undefined) {
            reportProblem("Could not list the saved projects.");
            return;
        }
        setExistingProjects(retrievedProjects);

        // The server owns the state; just adopt whatever it currently has
        const state = await apiClient.getState();
        if (state === undefined) {
            reportProblem("Could not load the project.");
            return;
        }
        applyState(state);
        setSelectedProject(state.activeProject ?? "");
        setSelectedTask({ ...state.goal });
        // Only a project with a file behind it can be assumed to match disk
        if (state.activeProject) {
            markSaved();
        } else {
            markNeverSaved();
        }
    }, [apiClient, applyState, setSelectedTask, markSaved, markNeverSaved, reportProblem]);

    const saveProject = useCallback(
        async (filename: string): Promise<void> => {
            const projects = await apiClient.saveProject(filename);
            if (projects === undefined) {
                reportProblem("Could not save the project.");
                return;
            }
            setExistingProjects(projects);
            markSaved();
        },
        [apiClient, markSaved, reportProblem],
    );

    const onSave = useCallback(async () => {
        let defaultFilename = "";
        if (selectedProject !== "") {
            defaultFilename = selectedProject;
        }
        const filename = await promptForText({
            title: "Save project",
            label: "Filename",
            defaultValue: defaultFilename,
            confirmLabel: "Save",
        });
        if (filename === null) {
            return;
        }

        if (filename.trim()) {
            await saveProject(filename);
            setSelectedProject(filename);
        } else {
            notify?.("A filename cannot be blank.");
        }
    }, [selectedProject, saveProject, promptForText, notify]);

    const onRestore = useCallback(async () => {
        if (selectedProject === "") {
            await setupNewProject();
        } else {
            await restoreProject(selectedProject);
        }
    }, [selectedProject, restoreProject, setupNewProject]);

    /**
     * Removes a saved project's file. Deleting the one that is open leaves the
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

            setExistingProjects(result.projects);
            applyState(result.state);
            if (result.state.activeProject === null) {
                markNeverSaved();
            }
            notify?.(`Deleted ${filename}.`);
        },
        [apiClient, applyState, askForConfirmation, markNeverSaved, notify, reportProblem],
    );

    /** Picking a project loads it: the dropdown reads as a project switcher, so it behaves like one. */
    const handleProjectChange = useCallback(
        async (filename: string) => {
            if (filename === selectedProject) {
                return;
            }

            setSelectedProject(filename);
            if (filename === "") {
                await setupNewProject();
                return;
            }
            await restoreProject(filename);
        },
        [selectedProject, restoreProject, setupNewProject],
    );

    return {
        existingProjects,
        selectedProject,
        applyActiveProject,
        initializeApp,
        onSave,
        onRestore,
        deleteProject,
        handleProjectChange,
    };
}
