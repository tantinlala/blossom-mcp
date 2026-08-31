import { renderHook, act } from "@testing-library/react";
import { useBoardProjects } from "./useBoardProjects";
import { APIClient } from "../utils/APIClient";
import { Notice, RealtimeClient } from "../utils/RealtimeClient";
import { WorkspaceManager } from "../utils/WorkspaceManager";
import { readSelection, STORAGE_KEY, QUERY_PARAM } from "../utils/viewSelection";
import { GOAL_ID, ProjectState } from "@blossom/common";

jest.mock("../utils/APIClient");

const state = (key: string, savedToDisk = true, version = 1): ProjectState => ({
    version,
    key,
    savedToDisk,
    goal: { name: "Goal", id: GOAL_ID, completionState: false, plan: { tasksList: [], dependenciesList: [] } },
    inbox: [],
});

describe("useBoardProjects", () => {
    let mockedAPIClient: jest.Mocked<APIClient>;
    let workspace: WorkspaceManager;
    let subscribe: jest.Mock;
    let noticeListeners: ((notice: Notice) => void)[];
    let realtime: RealtimeClient;
    let addProject: jest.Mock;
    let removeProject: jest.Mock;
    let applyProject: jest.Mock;
    let markSaved: jest.Mock;
    let promptForText: jest.Mock;
    let askForConfirmation: jest.Mock;
    let notify: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        window.history.replaceState(null, "", "/");

        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        mockedAPIClient.listProjects.mockResolvedValue({ projects: [], open: [], assistantProject: null });
        workspace = new WorkspaceManager();
        subscribe = jest.fn();
        noticeListeners = [];
        realtime = {
            subscribe,
            onNotice: (listener: (notice: Notice) => void) => {
                noticeListeners.push(listener);
                return () => {};
            },
        } as unknown as RealtimeClient;
        addProject = jest.fn((incoming: ProjectState) => workspace.addProject(incoming));
        removeProject = jest.fn((key: string) => workspace.removeProject(key));
        applyProject = jest.fn((incoming: ProjectState) => workspace.applyProject(incoming));
        markSaved = jest.fn();
        promptForText = jest.fn();
        askForConfirmation = jest.fn().mockResolvedValue(true);
        notify = jest.fn();
    });

    const render = () =>
        renderHook(() =>
            useBoardProjects({
                apiClient: mockedAPIClient,
                realtime,
                workspace,
                addProject,
                removeProject,
                applyProject,
                markSaved,
                promptForText,
                askForConfirmation,
                notify,
            }),
        );

    const pushNotice = (notice: Notice) =>
        act(() => {
            noticeListeners.forEach((listener) => listener(notice));
        });

    describe("opening the board this session was last on", () => {
        it("reads the saved projects and which one the assistant works on", async () => {
            mockedAPIClient.listProjects.mockResolvedValue({
                projects: ["Trip", "House"],
                open: ["Trip"],
                assistantProject: "Trip",
            });
            const { result } = render();

            await act(async () => result.current.initializeApp());

            expect(result.current.savedProjects).toEqual(["Trip", "House"]);
            expect(result.current.assistantProject).toBe("Trip");
        });

        it("opens the projects the link names, and tells the server", async () => {
            window.history.replaceState(null, "", `/?${QUERY_PARAM}=Trip,House`);
            mockedAPIClient.getView.mockResolvedValue({
                projects: [state("Trip"), state("House")],
                assistantProject: null,
            });
            const { result } = render();

            await act(async () => result.current.initializeApp());

            expect(subscribe).toHaveBeenCalledWith(["Trip", "House"]);
            expect(mockedAPIClient.getView).toHaveBeenCalledWith(["Trip", "House"]);
            expect(result.current.openProjects).toEqual(["Trip", "House"]);
        });

        it("settles on the projects that are there when a link outlives one of them", async () => {
            window.history.replaceState(null, "", `/?${QUERY_PARAM}=Trip,Gone`);
            mockedAPIClient.getView.mockResolvedValue({ projects: [state("Trip")], assistantProject: null });
            const { result } = render();

            await act(async () => result.current.initializeApp());

            expect(result.current.openProjects).toEqual(["Trip"]);
            expect(readSelection()).toEqual(["Trip"]);
        });

        it("treats a project just read from disk as matching disk", async () => {
            window.history.replaceState(null, "", `/?${QUERY_PARAM}=Trip,Untitled`);
            mockedAPIClient.getView.mockResolvedValue({
                projects: [state("Trip", true), state("Untitled", false)],
                assistantProject: null,
            });
            const { result } = render();

            await act(async () => result.current.initializeApp());

            expect(markSaved).toHaveBeenCalledWith("Trip");
            expect(markSaved).not.toHaveBeenCalledWith("Untitled");
        });

        it("asks for nothing when the board is empty", async () => {
            const { result } = render();

            await act(async () => result.current.initializeApp());

            expect(subscribe).toHaveBeenCalledWith([]);
            expect(mockedAPIClient.getView).not.toHaveBeenCalled();
        });

        it("says so when the board cannot be read", async () => {
            window.localStorage.setItem(STORAGE_KEY, "Trip");
            mockedAPIClient.getView.mockResolvedValue(undefined);
            const { result } = render();

            await act(async () => result.current.initializeApp());

            expect(notify).toHaveBeenCalledWith("Could not load the board.");
        });
    });

    describe("putting projects on the board and taking them off", () => {
        it("opens a saved project and records the board", async () => {
            mockedAPIClient.openProject.mockResolvedValue(state("Trip"));
            const { result } = render();

            await act(async () => result.current.openProject("Trip"));

            expect(mockedAPIClient.openProject).toHaveBeenCalledWith("Trip");
            expect(addProject).toHaveBeenCalledWith(state("Trip"));
            expect(result.current.openProjects).toEqual(["Trip"]);
            expect(readSelection()).toEqual(["Trip"]);
            expect(markSaved).toHaveBeenCalledWith("Trip");
        });

        it("keeps a project already on the board to one lane", async () => {
            mockedAPIClient.openProject.mockResolvedValue(state("Trip"));
            const { result } = render();
            await act(async () => result.current.openProject("Trip"));

            await act(async () => result.current.openProject("Trip"));

            expect(mockedAPIClient.openProject).toHaveBeenCalledTimes(1);
            expect(result.current.openProjects).toEqual(["Trip"]);
        });

        it("says so when a project cannot be opened", async () => {
            mockedAPIClient.openProject.mockResolvedValue(undefined);
            const { result } = render();

            await act(async () => result.current.openProject("Gone"));

            expect(notify).toHaveBeenCalledWith("Could not open that project.");
            expect(result.current.openProjects).toEqual([]);
        });

        it("takes a project off the board", async () => {
            mockedAPIClient.openProject.mockResolvedValue(state("Trip"));
            const { result } = render();
            await act(async () => result.current.openProject("Trip"));

            act(() => result.current.closeProject("Trip"));

            expect(removeProject).toHaveBeenCalledWith("Trip");
            expect(result.current.openProjects).toEqual([]);
            expect(subscribe).toHaveBeenLastCalledWith([]);
        });

        it("starts a project and puts it on the board beside whatever is there", async () => {
            mockedAPIClient.openProject.mockResolvedValue(state("Trip"));
            mockedAPIClient.newProject.mockResolvedValue(state("Untitled", false));
            const { result } = render();
            await act(async () => result.current.openProject("Trip"));

            let key: string | null = null;
            await act(async () => {
                key = await result.current.startNewProject();
            });

            expect(key).toBe("Untitled");
            expect(result.current.openProjects).toEqual(["Trip", "Untitled"]);
        });

        it("says so when a project cannot be started", async () => {
            mockedAPIClient.newProject.mockResolvedValue(undefined);
            const { result } = render();

            await act(async () => result.current.startNewProject());

            expect(notify).toHaveBeenCalledWith("Could not start a new project.");
        });
    });

    describe("saving", () => {
        beforeEach(async () => {
            mockedAPIClient.openProject.mockResolvedValue(state("Untitled", false));
        });

        it("asks for a filename and writes the project to it", async () => {
            promptForText.mockResolvedValue("q3-roadmap");
            mockedAPIClient.saveProject.mockResolvedValue({
                projects: ["q3-roadmap"],
                state: state("q3-roadmap", true, 2),
            });
            const { result } = render();

            await act(async () => result.current.onSave("Untitled"));

            expect(mockedAPIClient.saveProject).toHaveBeenCalledWith("Untitled", "q3-roadmap");
            expect(result.current.savedProjects).toEqual(["q3-roadmap"]);
            expect(markSaved).toHaveBeenCalledWith("q3-roadmap");
        });

        it("offers the filename a saved project already answers to", async () => {
            workspace.applyView({ projects: [state("Trip", true)], assistantProject: null });
            promptForText.mockResolvedValue("Trip");
            mockedAPIClient.saveProject.mockResolvedValue({ projects: ["Trip"], state: state("Trip", true, 2) });
            const { result } = render();

            await act(async () => result.current.onSave("Trip"));

            expect(promptForText).toHaveBeenCalledWith(expect.objectContaining({ defaultValue: "Trip" }));
        });

        it("offers no filename for a project with nothing saved for it", async () => {
            workspace.applyView({ projects: [state("Untitled", false)], assistantProject: null });
            promptForText.mockResolvedValue(null);
            const { result } = render();

            await act(async () => result.current.onSave("Untitled"));

            expect(promptForText).toHaveBeenCalledWith(expect.objectContaining({ defaultValue: "" }));
            expect(mockedAPIClient.saveProject).not.toHaveBeenCalled();
        });

        it("refuses a blank filename", async () => {
            promptForText.mockResolvedValue("   ");
            const { result } = render();

            await act(async () => result.current.onSave("Untitled"));

            expect(mockedAPIClient.saveProject).not.toHaveBeenCalled();
            expect(notify).toHaveBeenCalledWith("A filename cannot be blank.");
        });

        it("does nothing when there is no project to save", async () => {
            const { result } = render();

            await act(async () => result.current.onSave(null));

            expect(promptForText).not.toHaveBeenCalled();
        });

        it("says so when the save fails", async () => {
            promptForText.mockResolvedValue("q3-roadmap");
            mockedAPIClient.saveProject.mockResolvedValue(undefined);
            const { result } = render();

            await act(async () => result.current.onSave("Untitled"));

            expect(notify).toHaveBeenCalledWith("Could not save the project.");
        });
    });

    describe("reloading", () => {
        it("re-reads the project from disk and treats it as matching disk", async () => {
            workspace.applyView({ projects: [state("Trip", true)], assistantProject: null });
            mockedAPIClient.reloadProject.mockResolvedValue(state("Trip", true, 5));
            const { result } = render();

            await act(async () => result.current.onReload("Trip"));

            expect(mockedAPIClient.reloadProject).toHaveBeenCalledWith("Trip");
            expect(applyProject).toHaveBeenCalledWith(state("Trip", true, 5));
            expect(markSaved).toHaveBeenCalledWith("Trip");
        });

        it("says there is nothing on disk to reload for a project with no file", async () => {
            workspace.applyView({ projects: [state("Untitled", false)], assistantProject: null });
            const { result } = render();

            await act(async () => result.current.onReload("Untitled"));

            expect(mockedAPIClient.reloadProject).not.toHaveBeenCalled();
            expect(notify).toHaveBeenCalledWith("There is nothing on disk to reload. Save it first.");
        });

        it("does nothing when there is no project to reload", async () => {
            const { result } = render();

            await act(async () => result.current.onReload(null));

            expect(mockedAPIClient.reloadProject).not.toHaveBeenCalled();
        });
    });

    describe("deleting", () => {
        it("asks first, then removes the file and reports what remains", async () => {
            mockedAPIClient.deleteProject.mockResolvedValue({ projects: ["House"], state: state("Trip", false, 3) });
            const { result } = render();

            await act(async () => result.current.deleteProject("Trip"));

            expect(askForConfirmation).toHaveBeenCalled();
            expect(mockedAPIClient.deleteProject).toHaveBeenCalledWith("Trip");
            expect(result.current.savedProjects).toEqual(["House"]);
            expect(applyProject).toHaveBeenCalledWith(state("Trip", false, 3));
            expect(notify).toHaveBeenCalledWith("Deleted Trip.");
        });

        it("does nothing when the confirmation is declined", async () => {
            askForConfirmation.mockResolvedValue(false);
            const { result } = render();

            await act(async () => result.current.deleteProject("Trip"));

            expect(mockedAPIClient.deleteProject).not.toHaveBeenCalled();
        });

        it("says so when the delete fails", async () => {
            mockedAPIClient.deleteProject.mockResolvedValue(undefined);
            const { result } = render();

            await act(async () => result.current.deleteProject("Trip"));

            expect(notify).toHaveBeenCalledWith("Could not delete that project.");
        });
    });

    describe("the assistant's project", () => {
        it("chooses which project the assistant works on", async () => {
            mockedAPIClient.setAssistantProject.mockResolvedValue("Trip");
            const { result } = render();

            await act(async () => result.current.chooseAssistantProject("Trip"));

            expect(mockedAPIClient.setAssistantProject).toHaveBeenCalledWith("Trip");
            expect(result.current.assistantProject).toBe("Trip");
        });

        it("says so when the choice cannot be made", async () => {
            mockedAPIClient.setAssistantProject.mockResolvedValue(undefined);
            const { result } = render();

            await act(async () => result.current.chooseAssistantProject("Trip"));

            expect(notify).toHaveBeenCalledWith("Could not choose that project for the assistant.");
        });

        it("follows the choice the server reports", () => {
            const { result } = render();

            act(() => result.current.applyAssistantProject("House"));

            expect(result.current.assistantProject).toBe("House");
            expect(workspace.assistantProject).toBe("House");
        });
    });

    describe("a project written under another filename", () => {
        it("follows it, so the link carries the name it now answers to", async () => {
            mockedAPIClient.openProject.mockResolvedValue(state("Untitled", false));
            const { result } = render();
            await act(async () => result.current.openProject("Untitled"));

            pushNotice({ kind: "project-renamed", from: "Untitled", to: "q3-roadmap", byThisBrowser: true });

            expect(result.current.openProjects).toEqual(["q3-roadmap"]);
            expect(readSelection()).toEqual(["q3-roadmap"]);
            expect(subscribe).toHaveBeenLastCalledWith(["q3-roadmap"]);
        });

        it("leaves a board that does not hold it alone", async () => {
            mockedAPIClient.openProject.mockResolvedValue(state("Trip"));
            const { result } = render();
            await act(async () => result.current.openProject("Trip"));
            subscribe.mockClear();

            pushNotice({ kind: "project-renamed", from: "Untitled", to: "q3-roadmap", byThisBrowser: false });

            expect(result.current.openProjects).toEqual(["Trip"]);
            expect(subscribe).not.toHaveBeenCalled();
        });

        it("takes no notice of which project the assistant works on", async () => {
            mockedAPIClient.openProject.mockResolvedValue(state("Trip"));
            const { result } = render();
            await act(async () => result.current.openProject("Trip"));
            subscribe.mockClear();

            pushNotice({ kind: "assistant-target", project: "Trip", byThisBrowser: false });

            expect(subscribe).not.toHaveBeenCalled();
        });
    });
});
