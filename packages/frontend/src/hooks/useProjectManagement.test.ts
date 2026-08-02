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
    let mockNotify: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        mockApplyState = jest.fn();
        mockSetSelectedTask = jest.fn();
        mockPromptForText = jest.fn();
        mockMarkSaved = jest.fn();
        mockMarkNeverSaved = jest.fn();
        mockNotify = jest.fn();
        mockedAPIClient.lastFailure.mockReturnValue(null);
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
                notify: mockNotify,
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

    it("initializeApp reports a project list failure", async () => {
        mockedAPIClient.listExistingProjects.mockResolvedValue(undefined);

        const { result } = render();

        await act(async () => {
            await result.current.initializeApp();
        });

        expect(mockNotify).toHaveBeenCalledWith("Could not list the saved projects.");
        expect(mockedAPIClient.getState).not.toHaveBeenCalled();
        expect(mockApplyState).not.toHaveBeenCalled();
    });

    it("initializeApp reports a state fetch failure", async () => {
        mockedAPIClient.listExistingProjects.mockResolvedValue(["Project 1"]);
        mockedAPIClient.getState.mockResolvedValue(undefined);

        const { result } = render();

        await act(async () => {
            await result.current.initializeApp();
        });

        expect(mockNotify).toHaveBeenCalledWith("Could not load the project.");
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

    it("onRestore reports a failure to start a new project", async () => {
        mockedAPIClient.newProject.mockResolvedValue(undefined);

        const { result } = render();

        await act(async () => {
            await result.current.onRestore();
        });

        expect(mockNotify).toHaveBeenCalledWith("Could not start a new project.");
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

    it("onRestore reports a failure to restore", async () => {
        mockedAPIClient.restoreProject.mockResolvedValue(undefined);

        const { result } = render();

        await act(async () => {
            await result.current.handleProjectChange("My Project");
        });

        jest.clearAllMocks();
        mockedAPIClient.lastFailure.mockReturnValue(null);

        await act(async () => {
            await result.current.onRestore();
        });

        expect(mockNotify).toHaveBeenCalledWith("Could not open that project.");
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

        expect(mockNotify).toHaveBeenCalledWith("A filename cannot be blank.");
        expect(mockedAPIClient.saveProject).not.toHaveBeenCalled();
    });

    it("onSave reports a failure to save and keeps the existing project list", async () => {
        mockPromptForText.mockResolvedValue("my-project");
        mockedAPIClient.saveProject.mockResolvedValue(undefined);

        const { result } = render();

        await act(async () => {
            await result.current.onSave();
        });

        expect(mockNotify).toHaveBeenCalledWith("Could not save the project.");
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

    describe("following a project switch made by somebody else", () => {
        beforeEach(() => {
            mockedAPIClient.listExistingProjects.mockResolvedValue([]);
        });

        it("selects the project the server reports as active", () => {
            const { result } = render();

            act(() => result.current.applyActiveProject("q3-roadmap"));

            expect(result.current.selectedProject).toBe("q3-roadmap");
        });

        it("clears the selection when everyone is moved to a new project", () => {
            const { result } = render();
            act(() => result.current.applyActiveProject("q3-roadmap"));

            act(() => result.current.applyActiveProject(null));

            expect(result.current.selectedProject).toBe("");
        });

        it("refetches the list when the active project is one it has not heard of", async () => {
            mockedAPIClient.listExistingProjects.mockResolvedValue(["q3-roadmap"]);
            const { result } = render();

            await act(async () => {
                result.current.applyActiveProject("q3-roadmap");
            });

            // A selector whose value has no matching option renders blank, so
            // the newly saved project has to make it into the list.
            expect(mockedAPIClient.listExistingProjects).toHaveBeenCalled();
            expect(result.current.existingProjects).toEqual(["q3-roadmap"]);
        });

        it("does not refetch for a project it already knows about", async () => {
            mockedAPIClient.listExistingProjects.mockResolvedValue(["known"]);
            const { result } = render();
            await act(async () => {
                await result.current.initializeApp();
            });
            mockedAPIClient.listExistingProjects.mockClear();

            await act(async () => {
                result.current.applyActiveProject("known");
            });

            expect(mockedAPIClient.listExistingProjects).not.toHaveBeenCalled();
        });
    });

    describe("declining to switch everyone's project", () => {
        it("says nothing when the person cancelled the confirmation", async () => {
            mockedAPIClient.restoreProject.mockResolvedValue(undefined);
            mockedAPIClient.lastFailure.mockReturnValue({ code: "cancelled", message: "Cancelled" });
            const { result } = render();

            await act(async () => {
                await result.current.handleProjectChange("q3-roadmap");
            });

            // Deciding not to switch is a decision, not a failure.
            expect(mockNotify).not.toHaveBeenCalled();
        });

        it("reports a genuine failure to open a project", async () => {
            mockedAPIClient.restoreProject.mockResolvedValue(undefined);
            mockedAPIClient.lastFailure.mockReturnValue({ code: "network", message: "Network Error" });
            const { result } = render();

            await act(async () => {
                await result.current.handleProjectChange("q3-roadmap");
            });

            expect(mockNotify).toHaveBeenCalledWith("Could not open that project.");
        });
    });
});
