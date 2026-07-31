import { renderHook, act } from "@testing-library/react";
import { useProjectManagement } from "./useProjectManagement";
import { APIClient } from "../utils/APIClient";
import { GOAL_ID, ProjectState } from "@blossom/common";

jest.mock("../utils/APIClient");

const makeState = (activeProject: string | null = null, version = 1): ProjectState => ({
    version,
    activeProject,
    goal: { name: "My Goal", id: GOAL_ID, completionState: false, plan: { tasksList: [], dependenciesList: [] } },
    inbox: [],
});

describe("useProjectManagement", () => {
    let mockedAPIClient: jest.Mocked<APIClient>;
    let mockApplyState: jest.Mock;
    let mockSetSelectedTask: jest.Mock;
    let mockPromptForText: jest.Mock;
    let mockMarkSaved: jest.Mock;
    let mockMarkNeverSaved: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        mockApplyState = jest.fn();
        mockSetSelectedTask = jest.fn();
        mockPromptForText = jest.fn();
        mockMarkSaved = jest.fn();
        mockMarkNeverSaved = jest.fn();
        window.alert = jest.fn();
    });

    const render = () =>
        renderHook(() =>
            useProjectManagement({
                apiClient: mockedAPIClient,
                applyState: mockApplyState,
                setSelectedTask: mockSetSelectedTask,
                promptForText: mockPromptForText,
                markSaved: mockMarkSaved,
                markNeverSaved: mockMarkNeverSaved,
            }),
        );

    it("initializes with empty state", () => {
        const { result } = render();

        expect(result.current.existingProjects).toEqual([]);
        expect(result.current.selectedProject).toBe("");
    });

    it("initializeApp lists projects, fetches state, and adopts the active project", async () => {
        const state = makeState("Project 1");
        mockedAPIClient.listExistingProjects.mockResolvedValue(["Project 1", "Project 2"]);
        mockedAPIClient.getState.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.initializeApp();
        });

        expect(mockedAPIClient.listExistingProjects).toHaveBeenCalled();
        expect(mockedAPIClient.getState).toHaveBeenCalled();
        expect(result.current.existingProjects).toEqual(["Project 1", "Project 2"]);
        expect(mockApplyState).toHaveBeenCalledWith(state);
        expect(result.current.selectedProject).toBe("Project 1");
        expect(mockSetSelectedTask).toHaveBeenCalledWith({ ...state.goal });
    });

    it("initializeApp leaves selectedProject empty when there is no active project", async () => {
        mockedAPIClient.listExistingProjects.mockResolvedValue([]);
        mockedAPIClient.getState.mockResolvedValue(makeState(null));

        const { result } = render();

        await act(async () => {
            await result.current.initializeApp();
        });

        expect(result.current.selectedProject).toBe("");
    });

    it("initializeApp alerts on project list failure", async () => {
        mockedAPIClient.listExistingProjects.mockResolvedValue(undefined);

        const { result } = render();

        await act(async () => {
            await result.current.initializeApp();
        });

        expect(window.alert).toHaveBeenCalledWith("Error: Unable to list existing projects.");
        expect(mockedAPIClient.getState).not.toHaveBeenCalled();
        expect(mockApplyState).not.toHaveBeenCalled();
    });

    it("initializeApp alerts on state fetch failure", async () => {
        mockedAPIClient.listExistingProjects.mockResolvedValue(["Project 1"]);
        mockedAPIClient.getState.mockResolvedValue(undefined);

        const { result } = render();

        await act(async () => {
            await result.current.initializeApp();
        });

        expect(window.alert).toHaveBeenCalledWith("Error: Unable to fetch project state.");
        expect(mockApplyState).not.toHaveBeenCalled();
    });

    it("onRestore starts a new project when no project is selected", async () => {
        const state = makeState(null, 2);
        mockedAPIClient.newProject.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.onRestore();
        });

        expect(mockedAPIClient.newProject).toHaveBeenCalled();
        expect(mockApplyState).toHaveBeenCalledWith(state);
        expect(mockSetSelectedTask).toHaveBeenCalledWith({ ...state.goal });
    });

    it("onRestore alerts when starting a new project fails", async () => {
        mockedAPIClient.newProject.mockResolvedValue(undefined);

        const { result } = render();

        await act(async () => {
            await result.current.onRestore();
        });

        expect(window.alert).toHaveBeenCalledWith("Error: Unable to start a new project.");
        expect(mockApplyState).not.toHaveBeenCalled();
    });

    it("onRestore restores the selected project", async () => {
        const state = makeState("My Project", 2);
        mockedAPIClient.restoreProject.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.handleProjectChange("My Project");
        });

        await act(async () => {
            await result.current.onRestore();
        });

        expect(mockedAPIClient.restoreProject).toHaveBeenCalledWith("My Project");
        expect(mockApplyState).toHaveBeenCalledWith(state);
        expect(mockSetSelectedTask).toHaveBeenCalledWith({ ...state.goal });
    });

    it("onRestore alerts when restoring fails", async () => {
        mockedAPIClient.restoreProject.mockResolvedValue(undefined);

        const { result } = render();

        await act(async () => {
            await result.current.handleProjectChange("My Project");
        });

        jest.clearAllMocks();
        window.alert = jest.fn();

        await act(async () => {
            await result.current.onRestore();
        });

        expect(window.alert).toHaveBeenCalledWith("Error: Unable to restore project.");
        expect(mockApplyState).not.toHaveBeenCalled();
    });

    it("onSave prompts for a filename, saves, and stores the returned project list", async () => {
        mockPromptForText.mockResolvedValue("my-project");
        mockedAPIClient.saveProject.mockResolvedValue(["my-project"]);

        const { result } = render();

        await act(async () => {
            await result.current.onSave();
        });

        expect(mockPromptForText).toHaveBeenCalledWith(expect.objectContaining({ defaultValue: "" }));
        expect(mockedAPIClient.saveProject).toHaveBeenCalledWith("my-project");
        expect(result.current.existingProjects).toEqual(["my-project"]);
        expect(result.current.selectedProject).toBe("my-project");
    });

    it("onSave uses the selected project as the default filename", async () => {
        mockPromptForText.mockResolvedValue("updated-name");
        mockedAPIClient.saveProject.mockResolvedValue(["updated-name"]);
        mockedAPIClient.restoreProject.mockResolvedValue(makeState("existing-project"));

        const { result } = render();

        await act(async () => {
            await result.current.handleProjectChange("existing-project");
        });

        await act(async () => {
            await result.current.onSave();
        });

        expect(mockPromptForText).toHaveBeenCalledWith(expect.objectContaining({ defaultValue: "existing-project" }));
    });

    it("onSave does nothing when the prompt is cancelled", async () => {
        mockPromptForText.mockResolvedValue(null);

        const { result } = render();

        await act(async () => {
            await result.current.onSave();
        });

        expect(mockedAPIClient.saveProject).not.toHaveBeenCalled();
    });

    it("onSave alerts for a whitespace-only filename", async () => {
        mockPromptForText.mockResolvedValue("   ");

        const { result } = render();

        await act(async () => {
            await result.current.onSave();
        });

        expect(window.alert).toHaveBeenCalledWith("Filename cannot be empty or whitespace only.");
        expect(mockedAPIClient.saveProject).not.toHaveBeenCalled();
    });

    it("onSave alerts when saving fails and keeps the existing project list", async () => {
        mockPromptForText.mockResolvedValue("my-project");
        mockedAPIClient.saveProject.mockResolvedValue(undefined);

        const { result } = render();

        await act(async () => {
            await result.current.onSave();
        });

        expect(window.alert).toHaveBeenCalledWith("Error: Unable to save project.");
        expect(result.current.existingProjects).toEqual([]);
    });

    it("handleProjectChange selects and immediately loads the project", async () => {
        const state = makeState("New Project", 2);
        mockedAPIClient.restoreProject.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.handleProjectChange("New Project");
        });

        expect(result.current.selectedProject).toBe("New Project");
        expect(mockedAPIClient.restoreProject).toHaveBeenCalledWith("New Project");
        expect(mockApplyState).toHaveBeenCalledWith(state);
    });

    it("handleProjectChange starts a new project when the empty option is picked", async () => {
        const restored = makeState("Existing", 2);
        const fresh = makeState(null, 3);
        mockedAPIClient.restoreProject.mockResolvedValue(restored);
        mockedAPIClient.newProject.mockResolvedValue(fresh);

        const { result } = render();

        await act(async () => {
            await result.current.handleProjectChange("Existing");
        });
        await act(async () => {
            await result.current.handleProjectChange("");
        });

        expect(mockedAPIClient.newProject).toHaveBeenCalled();
        expect(result.current.selectedProject).toBe("");
    });

    it("handleProjectChange does not reload the project that is already open", async () => {
        const state = makeState("Same Project", 2);
        mockedAPIClient.restoreProject.mockResolvedValue(state);

        const { result } = render();

        await act(async () => {
            await result.current.handleProjectChange("Same Project");
        });
        await act(async () => {
            await result.current.handleProjectChange("Same Project");
        });

        expect(mockedAPIClient.restoreProject).toHaveBeenCalledTimes(1);
    });
});
