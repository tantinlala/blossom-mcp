import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import { APIClient } from "../utils/APIClient";
import { WorkspaceManager } from "../utils/WorkspaceManager";
import { RealtimeClient } from "../utils/RealtimeClient";
import * as useRoadmapModule from "../hooks/useRoadmap";
import * as useInboxModule from "../hooks/useInbox";
import * as useServerSyncModule from "../hooks/useServerSync";
import * as useBoardProjectsModule from "../hooks/useBoardProjects";
import * as useSidePanelModule from "../hooks/useSidePanel";

jest.mock("../utils/APIClient");
jest.mock("../utils/WorkspaceManager");
jest.mock("../utils/RealtimeClient");
jest.mock("../hooks/useRoadmap");
jest.mock("../hooks/useInbox");
jest.mock("../hooks/useServerSync");
jest.mock("../hooks/useBoardProjects");
jest.mock("../hooks/useSidePanel");

// Mock child components to isolate App-level logic
jest.mock("./NextTasksDrawer", () => (props: any) => (
    <div
        data-testid="next-tasks-drawer"
        data-open={props.open}
        data-show-project-keys={props.showProjectKeys}
        data-task-count={props.shownTasks.length}
    />
));
jest.mock("./TaskDetailsDrawer", () => (props: any) => (
    <div data-testid="task-details-drawer" data-open={props.open} data-show-project-key={props.showProjectKey} />
));
jest.mock("./Header", () => (props: any) => (
    <div data-testid="header">
        <span data-testid="saved-projects">{JSON.stringify(props.savedProjects)}</span>
        <span data-testid="open-projects">{JSON.stringify(props.openProjects)}</span>
        <span data-testid="assistant-project">{props.assistantProject ?? ""}</span>
        <span data-testid="focused-project">{props.focusedProject ?? ""}</span>
        <button data-testid="save-btn" onClick={props.onSave}>
            Save
        </button>
        <button data-testid="reload-btn" onClick={props.onReload}>
            Reload
        </button>
        <button data-testid="open-btn" onClick={() => props.onOpenProject("Trip")}>
            Open
        </button>
        <button data-testid="close-btn" onClick={() => props.onCloseProject("Trip")}>
            Close
        </button>
        <button data-testid="new-btn" onClick={props.onNewProject}>
            New
        </button>
        <button data-testid="delete-btn" onClick={() => props.onDeleteProject("Old Project")}>
            Delete
        </button>
        <button data-testid="assistant-btn" onClick={() => props.onChooseAssistantProject("Trip")}>
            Assistant
        </button>
    </div>
));
jest.mock("@xyflow/react", () => ({
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
}));
jest.mock("./RoadmapGraph", () => (props: any) => (
    <div
        data-testid="roadmap-graph"
        data-lane-count={props.board.lanes.length}
        data-focused-project={props.focusedProject ?? ""}
    >
        <button data-testid="select-in-house" onClick={() => props.onSelectionProjectChange("House")}>
            Select in House
        </button>
        <button data-testid="deselect" onClick={() => props.onSelectionProjectChange(null)}>
            Deselect
        </button>
    </div>
));
jest.mock("./InboxPanel", () => (props: any) => (
    <div data-testid="inbox-panel" data-open={props.open} data-group-count={props.groups.length} />
));

const laneFor = (projectKey: string) => ({
    projectKey,
    savedToDisk: true,
    roadmap: { tasksList: [], dependenciesList: [], isSubplan: false, ancestors: [] },
});

describe("App", () => {
    let mockedAPIClient: jest.Mocked<APIClient>;
    let mockedWorkspace: jest.Mocked<WorkspaceManager>;
    let mockedRealtime: jest.Mocked<RealtimeClient>;

    // Hook return value mocks
    let mockSync: ReturnType<typeof createMockServerSync>;
    let mockRoadmap: ReturnType<typeof createMockRoadmap>;
    let mockInbox: ReturnType<typeof createMockInbox>;
    let mockProjects: ReturnType<typeof createMockProjects>;
    let mockPanel: ReturnType<typeof createMockPanel>;

    function createMockServerSync() {
        return {
            applyView: jest.fn(),
            applyProject: jest.fn(),
            addProject: jest.fn(),
            removeProject: jest.fn(),
            renameProject: jest.fn(),
            registerTargets: jest.fn(),
            saveStateOf: jest.fn().mockReturnValue("saved" as const),
            markSaved: jest.fn(),
            connectionState: "open" as const,
        };
    }

    function createMockRoadmap() {
        return {
            board: { lanes: [laneFor("Trip")] },
            unblockedTasks: [] as any[],
            selectedTask: null as any,
            syncBoard: jest.fn(),
            setSelectedTask: jest.fn(),
            setGoal: jest.fn(),
            addTask: jest.fn(),
            removeTask: jest.fn(),
            connect: jest.fn(),
            removeEdge: jest.fn(),
            updateEdge: jest.fn(),
            toggleComplete: jest.fn(),
            changeContextToWithinTask: jest.fn(),
            changeContextToParent: jest.fn(),
            createPlanForTask: jest.fn(),
            selectTask: jest.fn(),
            updateTaskDetails: jest.fn(),
            handlePaste: jest.fn(),
            handleUndo: jest.fn(),
        };
    }

    function createMockInbox() {
        return {
            ideaGroups: [] as any[],
            totalIdeaCount: 0,
            applyInboxView: jest.fn(),
            applyRemoteInbox: jest.fn(),
            addIdea: jest.fn(),
            deleteIdea: jest.fn(),
            changeIdea: jest.fn(),
            commitIdea: jest.fn(),
            addTaskToContextAndRemove: jest.fn(),
            addAllIdeasToPlan: jest.fn(),
        };
    }

    function createMockPanel() {
        return {
            activePanel: "inbox" as string | null,
            showNextTasks: jest.fn(),
            showDetails: jest.fn(),
            toggleNextTasks: jest.fn(),
            showInbox: jest.fn(),
            toggleInbox: jest.fn(),
            closeActivePanel: jest.fn(),
        };
    }

    function createMockProjects() {
        return {
            savedProjects: [] as string[],
            openProjects: [] as string[],
            assistantProject: null as string | null,
            initializeApp: jest.fn(),
            refreshSavedProjects: jest.fn(),
            openProject: jest.fn(),
            closeProject: jest.fn(),
            startNewProject: jest.fn().mockResolvedValue("Untitled"),
            onSave: jest.fn(),
            onReload: jest.fn(),
            deleteProject: jest.fn(),
            chooseAssistantProject: jest.fn(),
            applyAssistantProject: jest.fn(),
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();

        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        mockedWorkspace = new WorkspaceManager() as jest.Mocked<WorkspaceManager>;
        mockedRealtime = new RealtimeClient() as jest.Mocked<RealtimeClient>;

        mockSync = createMockServerSync();
        mockRoadmap = createMockRoadmap();
        mockInbox = createMockInbox();
        mockProjects = createMockProjects();
        mockPanel = createMockPanel();

        (useServerSyncModule.useServerSync as jest.Mock).mockReturnValue(mockSync);
        (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
        (useInboxModule.useInbox as jest.Mock).mockReturnValue(mockInbox);
        (useBoardProjectsModule.useBoardProjects as jest.Mock).mockReturnValue(mockProjects);
        (useSidePanelModule.useSidePanel as jest.Mock).mockReturnValue(mockPanel);
    });

    const renderApp = () =>
        render(<App apiClient={mockedAPIClient} workspace={mockedWorkspace} realtime={mockedRealtime} />);

    describe("rendering", () => {
        it("renders Header, RoadmapGraph and InboxPanel", () => {
            renderApp();

            expect(screen.getByTestId("header")).toBeInTheDocument();
            expect(screen.getByTestId("roadmap-graph")).toBeInTheDocument();
            expect(screen.getByTestId("inbox-panel")).toBeInTheDocument();
        });

        it("hands the whole board to the graph", () => {
            mockRoadmap.board = { lanes: [laneFor("Trip"), laneFor("House")] };
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
            renderApp();

            expect(screen.getByTestId("roadmap-graph").getAttribute("data-lane-count")).toBe("2");
        });

        it("gives the panel slot to the next task list when it is active", () => {
            (useSidePanelModule.useSidePanel as jest.Mock).mockReturnValue({
                ...mockPanel,
                activePanel: "nextTasks",
            });
            renderApp();

            expect(screen.getByTestId("next-tasks-drawer").getAttribute("data-open")).toBe("true");
            expect(screen.getByTestId("task-details-drawer").getAttribute("data-open")).toBe("false");
            expect(screen.getByTestId("inbox-panel").getAttribute("data-open")).toBe("false");
        });

        it("gives the panel slot to task details when it is active", () => {
            (useSidePanelModule.useSidePanel as jest.Mock).mockReturnValue({
                ...mockPanel,
                activePanel: "details",
            });
            renderApp();

            expect(screen.getByTestId("task-details-drawer").getAttribute("data-open")).toBe("true");
        });

        it("leaves the project unsaid in the panels while the board holds one", () => {
            renderApp();

            expect(screen.getByTestId("next-tasks-drawer").getAttribute("data-show-project-keys")).toBe("false");
            expect(screen.getByTestId("task-details-drawer").getAttribute("data-show-project-key")).toBe("false");
        });

        it("names the project in the panels once the board holds more than one", () => {
            mockRoadmap.board = { lanes: [laneFor("Trip"), laneFor("House")] };
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
            renderApp();

            expect(screen.getByTestId("next-tasks-drawer").getAttribute("data-show-project-keys")).toBe("true");
            expect(screen.getByTestId("task-details-drawer").getAttribute("data-show-project-key")).toBe("true");
        });
    });

    describe("hook wiring", () => {
        it("passes apiClient, the workspace and the realtime client to useServerSync", () => {
            renderApp();
            expect(useServerSyncModule.useServerSync).toHaveBeenCalledWith({
                apiClient: mockedAPIClient,
                workspace: mockedWorkspace,
                realtime: mockedRealtime,
                notify: expect.any(Function),
            });
        });

        it("passes the workspace, apiClient and applyProject to useRoadmap", () => {
            renderApp();
            expect(useRoadmapModule.useRoadmap).toHaveBeenCalledWith(
                mockedWorkspace,
                mockedAPIClient,
                mockSync.applyProject,
                expect.any(Function),
            );
        });

        it("passes correct deps to useInbox", () => {
            renderApp();
            expect(useInboxModule.useInbox).toHaveBeenCalledWith({
                apiClient: mockedAPIClient,
                workspace: mockedWorkspace,
                applyProject: mockSync.applyProject,
                notify: expect.any(Function),
            });
        });

        it("passes correct deps to useBoardProjects", () => {
            renderApp();
            expect(useBoardProjectsModule.useBoardProjects).toHaveBeenCalledWith({
                apiClient: mockedAPIClient,
                realtime: mockedRealtime,
                workspace: mockedWorkspace,
                addProject: mockSync.addProject,
                removeProject: mockSync.removeProject,
                applyProject: mockSync.applyProject,
                markSaved: mockSync.markSaved,
                promptForText: expect.any(Function),
                askForConfirmation: expect.any(Function),
                notify: expect.any(Function),
            });
        });

        it("registers the inbox, the board and the assistant's project as sync targets on mount", () => {
            renderApp();
            expect(mockSync.registerTargets).toHaveBeenCalledWith({
                applyInboxView: mockInbox.applyInboxView,
                applyRemoteInbox: mockInbox.applyRemoteInbox,
                syncBoard: mockRoadmap.syncBoard,
                applyAssistantProject: mockProjects.applyAssistantProject,
            });
        });

        it("labels this browser's writes", () => {
            renderApp();
            expect(mockedAPIClient.setAuthor).toHaveBeenCalledWith(expect.objectContaining({ kind: "person" }));
        });
    });

    describe("initialization", () => {
        it("opens the board this session was last on", () => {
            renderApp();
            expect(mockProjects.initializeApp).toHaveBeenCalled();
        });
    });

    describe("prop wiring to Header", () => {
        it("passes the saved and open projects, and the assistant's, to Header", () => {
            mockProjects.savedProjects = ["Trip", "House"];
            mockProjects.openProjects = ["Trip"];
            mockProjects.assistantProject = "Trip";
            (useBoardProjectsModule.useBoardProjects as jest.Mock).mockReturnValue(mockProjects);
            renderApp();

            expect(screen.getByTestId("saved-projects")).toHaveTextContent('["Trip","House"]');
            expect(screen.getByTestId("open-projects")).toHaveTextContent('["Trip"]');
            expect(screen.getByTestId("assistant-project")).toHaveTextContent("Trip");
        });

        it("starts on the board's first lane", () => {
            renderApp();

            expect(screen.getByTestId("focused-project")).toHaveTextContent("Trip");
        });

        it("follows the project holding whatever was picked out", async () => {
            mockRoadmap.board = { lanes: [laneFor("Trip"), laneFor("House")] };
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
            renderApp();

            fireEvent.click(screen.getByTestId("select-in-house"));

            await waitFor(() => expect(screen.getByTestId("focused-project")).toHaveTextContent("House"));
        });

        it("names the same project to the canvas as it does to the header", async () => {
            mockRoadmap.board = { lanes: [laneFor("Trip"), laneFor("House")] };
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
            renderApp();

            fireEvent.click(screen.getByTestId("select-in-house"));

            await waitFor(() => expect(screen.getByTestId("focused-project")).toHaveTextContent("House"));
            expect(screen.getByTestId("roadmap-graph").getAttribute("data-focused-project")).toBe("House");
        });

        it("stays where it is when the selection is put down", async () => {
            mockRoadmap.board = { lanes: [laneFor("Trip"), laneFor("House")] };
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
            renderApp();
            fireEvent.click(screen.getByTestId("select-in-house"));
            await waitFor(() => expect(screen.getByTestId("focused-project")).toHaveTextContent("House"));

            fireEvent.click(screen.getByTestId("deselect"));

            expect(screen.getByTestId("focused-project")).toHaveTextContent("House");
        });

        it("gives way to the first lane when the project it named leaves the board", async () => {
            mockRoadmap.board = { lanes: [laneFor("Trip"), laneFor("House")] };
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
            const { rerender } = renderApp();
            fireEvent.click(screen.getByTestId("select-in-house"));
            await waitFor(() => expect(screen.getByTestId("focused-project")).toHaveTextContent("House"));

            mockRoadmap.board = { lanes: [laneFor("Trip")] };
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue({ ...mockRoadmap });
            rerender(<App apiClient={mockedAPIClient} workspace={mockedWorkspace} realtime={mockedRealtime} />);

            expect(screen.getByTestId("focused-project")).toHaveTextContent("Trip");
        });

        it("saves the project being worked in", async () => {
            mockRoadmap.board = { lanes: [laneFor("Trip"), laneFor("House")] };
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
            renderApp();
            fireEvent.click(screen.getByTestId("select-in-house"));
            await waitFor(() => expect(screen.getByTestId("focused-project")).toHaveTextContent("House"));

            fireEvent.click(screen.getByTestId("save-btn"));

            expect(mockProjects.onSave).toHaveBeenCalledWith("House");
        });

        it("reloads the project being worked in", async () => {
            mockRoadmap.board = { lanes: [laneFor("Trip"), laneFor("House")] };
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
            renderApp();
            fireEvent.click(screen.getByTestId("select-in-house"));
            await waitFor(() => expect(screen.getByTestId("focused-project")).toHaveTextContent("House"));

            fireEvent.click(screen.getByTestId("reload-btn"));

            expect(mockProjects.onReload).toHaveBeenCalledWith("House");
        });

        it("reports where the project being worked in stands against disk", () => {
            renderApp();

            expect(mockSync.saveStateOf).toHaveBeenCalled();
        });

        it("opens a project onto the board", () => {
            renderApp();
            fireEvent.click(screen.getByTestId("open-btn"));

            expect(mockProjects.openProject).toHaveBeenCalledWith("Trip");
        });

        it("takes a project off the board", () => {
            renderApp();
            fireEvent.click(screen.getByTestId("close-btn"));

            expect(mockProjects.closeProject).toHaveBeenCalledWith("Trip");
        });

        it("starts a new project and works in it once its lane arrives", async () => {
            mockRoadmap.board = { lanes: [laneFor("Trip"), laneFor("Untitled")] };
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
            renderApp();

            fireEvent.click(screen.getByTestId("new-btn"));

            await waitFor(() => expect(mockProjects.startNewProject).toHaveBeenCalled());
            await waitFor(() => expect(screen.getByTestId("focused-project")).toHaveTextContent("Untitled"));
        });

        it("passes a project up to be deleted", () => {
            renderApp();
            fireEvent.click(screen.getByTestId("delete-btn"));

            expect(mockProjects.deleteProject).toHaveBeenCalledWith("Old Project");
        });

        it("hands a project to the assistant", () => {
            renderApp();
            fireEvent.click(screen.getByTestId("assistant-btn"));

            expect(mockProjects.chooseAssistantProject).toHaveBeenCalledWith("Trip");
        });
    });
});
