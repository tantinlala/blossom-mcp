import { useCallback, useState } from "react";
import { APIClient } from "../utils/APIClient";
import { ProjectState, Task } from "@blossom/common";
import { PromptForText } from "./useTextPrompt";

interface UseProjectManagementDeps {
    apiClient: APIClient;
    applyState: (state: ProjectState) => void;
    setSelectedTask: React.Dispatch<React.SetStateAction<Task | null>>;
    promptForText: PromptForText;
    markSaved: () => void;
    markNeverSaved: () => void;
}

export function useProjectManagement({
    apiClient,
    applyState,
    setSelectedTask,
    promptForText,
    markSaved,
    markNeverSaved,
}: UseProjectManagementDeps) {
    const [existingProjects, setExistingProjects] = useState<string[]>([]);
    const [selectedProject, setSelectedProject] = useState("");

    const setupNewProject = useCallback(async () => {
        setSelectedProject("");
        const state = await apiClient.newProject();
        if (state === undefined) {
            alert("Error: Unable to start a new project.");
            return;
        }
        applyState(state);
        setSelectedTask({ ...state.goal });
        // A brand new project has no file behind it yet
        markNeverSaved();
    }, [apiClient, applyState, setSelectedTask, markNeverSaved]);

    const restoreProject = useCallback(
        async (filename: string): Promise<boolean> => {
            const state = await apiClient.restoreProject(filename);
            if (state === undefined) {
                alert("Error: Unable to restore project.");
                return false;
            }

            applyState(state);
            setSelectedTask({ ...state.goal });
            // Just read from disk, so the two match by definition
            markSaved();
            return true;
        },
        [apiClient, applyState, setSelectedTask, markSaved],
    );

    const initializeApp = useCallback(async () => {
        const retrievedProjects = await apiClient.listExistingProjects();
        if (retrievedProjects === undefined) {
            alert("Error: Unable to list existing projects.");
            return;
        }
        setExistingProjects(retrievedProjects);

        // The server owns the state; just adopt whatever it currently has
        const state = await apiClient.getState();
        if (state === undefined) {
            alert("Error: Unable to fetch project state.");
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
    }, [apiClient, applyState, setSelectedTask, markSaved, markNeverSaved]);

    const saveProject = useCallback(
        async (filename: string): Promise<void> => {
            const projects = await apiClient.saveProject(filename);
            if (projects === undefined) {
                alert("Error: Unable to save project.");
                return;
            }
            setExistingProjects(projects);
            markSaved();
        },
        [apiClient, markSaved],
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
            alert("Filename cannot be empty or whitespace only.");
        }
    }, [selectedProject, saveProject, promptForText]);

    const onRestore = useCallback(async () => {
        if (selectedProject === "") {
            await setupNewProject();
        } else {
            await restoreProject(selectedProject);
        }
    }, [selectedProject, restoreProject, setupNewProject]);

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
        initializeApp,
        onSave,
        onRestore,
        handleProjectChange,
    };
}
