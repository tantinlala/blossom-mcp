import { useCallback, useState } from "react";
import { APIClient } from "../utils/APIClient";
import { ProjectState, Task } from "@blossom/common";

interface UseProjectManagementDeps {
    apiClient: APIClient;
    applyState: (state: ProjectState) => void;
    setSelectedTask: React.Dispatch<React.SetStateAction<Task | null>>;
}

export function useProjectManagement({ apiClient, applyState, setSelectedTask }: UseProjectManagementDeps) {
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
    }, [apiClient, applyState, setSelectedTask]);

    const restoreProject = useCallback(
        async (filename: string): Promise<boolean> => {
            const state = await apiClient.restoreProject(filename);
            if (state === undefined) {
                alert("Error: Unable to restore project.");
                return false;
            }

            applyState(state);
            setSelectedTask({ ...state.goal });
            return true;
        },
        [apiClient, applyState, setSelectedTask],
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
    }, [apiClient, applyState, setSelectedTask]);

    const saveProject = useCallback(
        async (filename: string): Promise<void> => {
            const projects = await apiClient.saveProject(filename);
            if (projects === undefined) {
                alert("Error: Unable to save project.");
                return;
            }
            setExistingProjects(projects);
        },
        [apiClient],
    );

    const onSave = useCallback(async () => {
        let defaultFilename = "";
        if (selectedProject !== "") {
            defaultFilename = selectedProject;
        }
        const filename = window.prompt("Enter a filename:", defaultFilename);
        if (filename === null) {
            return;
        }

        if (filename.trim()) {
            await saveProject(filename);
            setSelectedProject(filename);
        } else {
            alert("Filename cannot be empty or whitespace only.");
        }
    }, [selectedProject, saveProject]);

    const onRestore = useCallback(async () => {
        if (selectedProject === "") {
            await setupNewProject();
        } else {
            await restoreProject(selectedProject);
        }
    }, [selectedProject, restoreProject, setupNewProject]);

    const handleProjectChange = useCallback((event: React.ChangeEvent<{ value: unknown }>) => {
        setSelectedProject(event.target.value as string);
    }, []);

    return {
        existingProjects,
        selectedProject,
        initializeApp,
        onSave,
        onRestore,
        handleProjectChange,
    };
}
