import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "./App";
import { APIClient } from "../utils/APIClient";
import { PlanManager } from "../utils/PlanManager";
import * as useRoadmapModule from "../hooks/useRoadmap";
import * as useInboxModule from "../hooks/useInbox";
import * as useServerSyncModule from "../hooks/useServerSync";
import * as useProjectManagementModule from "../hooks/useProjectManagement";

jest.mock("../utils/APIClient");
jest.mock("../utils/PlanManager");
jest.mock("../hooks/useRoadmap");
jest.mock("../hooks/useInbox");
jest.mock("../hooks/useServerSync");
jest.mock("../hooks/useProjectManagement");

// Mock child components to isolate App-level logic
jest.mock("./NextTasksDrawer", () => (props: any) => <div data-testid="next-tasks-drawer" data-open={props.open} />);
jest.mock("./TaskDetailsDrawer", () => (props: any) => (
    <div data-testid="task-details-drawer" data-open={props.open} />
));
jest.mock("./Header", () => (props: any) => (
    <div data-testid="header">
        <span data-testid="existing-projects">{JSON.stringify(props.existingProjects)}</span>
        <span data-testid="selected-project">{props.selectedProject}</span>
        <button data-testid="save-btn" onClick={props.onSave}>
            Save
        </button>
        <button data-testid="restore-btn" onClick={props.onRestore}>
            Open
        </button>
    </div>
));
jest.mock("@xyflow/react", () => ({
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
}));
jest.mock("./RoadmapGraph", () => () => <div data-testid="roadmap-graph" />);
jest.mock("./InboxPanel", () => (props: any) => (
    <div data-testid="inbox-panel" data-idea-count={props.ideaList.length} />
));

describe("App", () => {
    let mockedAPIClient: jest.Mocked<APIClient>;
    let mockedPlanManager: jest.Mocked<PlanManager>;

    // Hook return value mocks
    let mockSync: ReturnType<typeof createMockServerSync>;
    let mockRoadmap: ReturnType<typeof createMockRoadmap>;
    let mockInbox: ReturnType<typeof createMockInbox>;
    let mockProject: ReturnType<typeof createMockProject>;

    function createMockServerSync() {
        return {
            applyState: jest.fn(),
            registerTargets: jest.fn(),
            setEditingPaused: jest.fn(),
        };
    }

    function createMockRoadmap() {
        return {
            presentlyShownRoadmap: { tasksList: [], dependenciesList: [], isSubplan: false },
            unblockedTasks: [],
            selectedTask: null as any,
            drawerOpen: false,
            detailsDrawerOpen: false,
            syncRoadmap: jest.fn(),
            setSelectedTask: jest.fn(),
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
            toggleNextTasksDrawer: jest.fn().mockReturnValue(jest.fn()),
            toggleDetailsDrawer: jest.fn().mockReturnValue(jest.fn()),
        };
    }

    function createMockInbox() {
        return {
            ideaList: [] as string[],
            setIdeaList: jest.fn(),
            addIdea: jest.fn(),
            deleteIdea: jest.fn(),
            changeIdea: jest.fn(),
            commitIdea: jest.fn(),
            addTaskToContextAndRemove: jest.fn(),
            addAllIdeasToPlan: jest.fn(),
        };
    }

    function createMockProject() {
        return {
            existingProjects: [] as string[],
            selectedProject: "",
            initializeApp: jest.fn(),
            onSave: jest.fn(),
            onRestore: jest.fn(),
            handleProjectChange: jest.fn(),
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();

        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        mockedPlanManager = new PlanManager() as jest.Mocked<PlanManager>;

        mockSync = createMockServerSync();
        mockRoadmap = createMockRoadmap();
        mockInbox = createMockInbox();
        mockProject = createMockProject();

        (useServerSyncModule.useServerSync as jest.Mock).mockReturnValue(mockSync);
        (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
        (useInboxModule.useInbox as jest.Mock).mockReturnValue(mockInbox);
        (useProjectManagementModule.useProjectManagement as jest.Mock).mockReturnValue(mockProject);
    });

    const renderApp = () => render(<App apiClient={mockedAPIClient} planManager={mockedPlanManager} />);

    describe("rendering", () => {
        it("renders Header, RoadmapGraph and InboxPanel", () => {
            renderApp();

            expect(screen.getByTestId("header")).toBeInTheDocument();
            expect(screen.getByTestId("roadmap-graph")).toBeInTheDocument();
            expect(screen.getByTestId("inbox-panel")).toBeInTheDocument();
        });

        it("passes roadmap drawer state to NextTasksDrawer", () => {
            mockRoadmap.drawerOpen = true;
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
            renderApp();

            expect(screen.getByTestId("next-tasks-drawer").getAttribute("data-open")).toBe("true");
        });

        it("passes details drawer state to TaskDetailsDrawer", () => {
            mockRoadmap.detailsDrawerOpen = true;
            (useRoadmapModule.useRoadmap as jest.Mock).mockReturnValue(mockRoadmap);
            renderApp();

            expect(screen.getByTestId("task-details-drawer").getAttribute("data-open")).toBe("true");
        });
    });

    describe("hook wiring", () => {
        it("passes apiClient and planManager to useServerSync", () => {
            renderApp();
            expect(useServerSyncModule.useServerSync).toHaveBeenCalledWith({
                apiClient: mockedAPIClient,
                planManager: mockedPlanManager,
            });
        });

        it("passes planManager, apiClient and applyState to useRoadmap", () => {
            renderApp();
            expect(useRoadmapModule.useRoadmap).toHaveBeenCalledWith(
                mockedPlanManager,
                mockedAPIClient,
                mockSync.applyState,
            );
        });

        it("passes correct deps to useInbox", () => {
            renderApp();
            expect(useInboxModule.useInbox).toHaveBeenCalledWith({
                apiClient: mockedAPIClient,
                planManager: mockedPlanManager,
                applyState: mockSync.applyState,
                setEditingPaused: mockSync.setEditingPaused,
            });
        });

        it("passes correct deps to useProjectManagement", () => {
            renderApp();
            expect(useProjectManagementModule.useProjectManagement).toHaveBeenCalledWith({
                apiClient: mockedAPIClient,
                applyState: mockSync.applyState,
                setSelectedTask: mockRoadmap.setSelectedTask,
            });
        });

        it("registers setIdeaList and syncRoadmap as sync targets on mount", () => {
            renderApp();
            expect(mockSync.registerTargets).toHaveBeenCalledWith({
                setIdeaList: mockInbox.setIdeaList,
                syncRoadmap: mockRoadmap.syncRoadmap,
            });
        });
    });

    describe("initialization", () => {
        it("calls initializeApp on mount", () => {
            renderApp();
            expect(mockProject.initializeApp).toHaveBeenCalled();
        });
    });

    describe("prop wiring to Header", () => {
        it("passes existingProjects to Header", () => {
            mockProject.existingProjects = ["Project A", "Project B"];
            (useProjectManagementModule.useProjectManagement as jest.Mock).mockReturnValue(mockProject);
            renderApp();

            expect(screen.getByTestId("existing-projects")).toHaveTextContent('["Project A","Project B"]');
        });

        it("passes selectedProject to Header", () => {
            mockProject.selectedProject = "My Project";
            (useProjectManagementModule.useProjectManagement as jest.Mock).mockReturnValue(mockProject);
            renderApp();

            expect(screen.getByTestId("selected-project")).toHaveTextContent("My Project");
        });

        it("passes onSave from useProjectManagement to Header", () => {
            renderApp();
            fireEvent.click(screen.getByTestId("save-btn"));

            expect(mockProject.onSave).toHaveBeenCalled();
        });

        it("passes onRestore from useProjectManagement to Header", () => {
            renderApp();
            fireEvent.click(screen.getByTestId("restore-btn"));

            expect(mockProject.onRestore).toHaveBeenCalled();
        });
    });
});
