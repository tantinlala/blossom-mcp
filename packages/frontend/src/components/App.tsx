import { APIClient } from "../utils/APIClient";
import { WorkspaceManager } from "../utils/WorkspaceManager";
import { RealtimeClient } from "../utils/RealtimeClient";
import { useCallback, useEffect, useMemo, useState } from "react";
import NextTasksDrawer from "./NextTasksDrawer";
import TaskDetailsDrawer from "./TaskDetailsDrawer";
import Header from "./Header";
import { ReactFlowProvider } from "@xyflow/react";
import RoadmapGraph from "./RoadmapGraph";
import InboxPanel from "./InboxPanel";
import { useRoadmap } from "../hooks/useRoadmap";
import { useInbox } from "../hooks/useInbox";
import { useServerSync } from "../hooks/useServerSync";
import { useBoardProjects } from "../hooks/useBoardProjects";
import { useSidePanel } from "../hooks/useSidePanel";
import { useTextPrompt } from "../hooks/useTextPrompt";
import { useConfirm } from "../hooks/useConfirm";
import { useNotices } from "../hooks/useNotices";
import { getAuthor } from "../utils/identity";
import TextPromptDialog from "./TextPromptDialog";
import ConfirmDialog from "./ConfirmDialog";
import NoticeSnackbar from "./NoticeSnackbar";

const App = ({
    apiClient,
    workspace,
    realtime,
}: {
    apiClient: APIClient;
    workspace: WorkspaceManager;
    realtime: RealtimeClient;
}) => {
    const { notice, notify, dismissNotice } = useNotices();
    const { promptForText, dialogProps } = useTextPrompt();
    const { askForConfirmation, dialogProps: confirmDialogProps } = useConfirm();

    // Which project is being worked in, as far as anything outside the canvas has
    // been told: the one holding whatever was last picked out, or the one a person
    // has just started. It gives way to the first lane when it names no project
    // the board holds, so a board that changes underneath never strands it.
    const [claimedProject, setClaimedProject] = useState<string | null>(null);

    const sync = useServerSync({ apiClient, workspace, realtime, notify });
    const roadmap = useRoadmap(workspace, apiClient, sync.applyProject, notify);
    const inbox = useInbox({
        apiClient,
        workspace,
        applyProject: sync.applyProject,
        notify,
    });
    const panel = useSidePanel();
    const projects = useBoardProjects({
        apiClient,
        realtime,
        workspace,
        addProject: sync.addProject,
        removeProject: sync.removeProject,
        applyProject: sync.applyProject,
        markSaved: sync.markSaved,
        promptForText,
        askForConfirmation,
        notify,
    });

    // Labels this browser's writes. Nobody is asked for anything: the id only
    // exists so undo cannot revert somebody else's work.
    useEffect(() => {
        apiClient.setAuthor(getAuthor());
    }, [apiClient]);

    // useServerSync is created before the hooks that own React state, so the
    // setters it fans state out to are registered here
    const { registerTargets } = sync;
    const { syncBoard } = roadmap;
    const { applyRemoteInbox, applyInboxView } = inbox;
    const { applyAssistantProject } = projects;
    useEffect(() => {
        registerTargets({ applyRemoteInbox, applyInboxView, syncBoard, applyAssistantProject });
    }, [registerTargets, applyRemoteInbox, applyInboxView, syncBoard, applyAssistantProject]);

    const { initializeApp } = projects;
    useEffect(() => {
        initializeApp();
    }, [initializeApp]);

    /**
     * The one project every action names. Resolving it here, rather than in each
     * place that acts, is what keeps the canvas toolbar and the header from
     * naming different projects.
     */
    const focusedProject = useMemo(() => {
        const lanes = roadmap.board.lanes.map((lane) => lane.projectKey);
        if (claimedProject && lanes.includes(claimedProject)) {
            return claimedProject;
        }
        return lanes[0] ?? null;
    }, [claimedProject, roadmap.board]);

    const onSave = useCallback(() => projects.onSave(focusedProject), [projects, focusedProject]);
    const onReload = useCallback(() => projects.onReload(focusedProject), [projects, focusedProject]);

    // Picking a task out says which project is being worked in; putting the
    // selection down leaves it where it was, so the toolbar does not jump.
    const onSelectionProjectChange = useCallback((projectKey: string | null) => {
        if (projectKey) {
            setClaimedProject(projectKey);
        }
    }, []);

    /** Starting a project puts a lane on the board with nothing in it yet. */
    const onNewProject = useCallback(async () => {
        const key = await projects.startNewProject();
        if (key) {
            setClaimedProject(key);
        }
    }, [projects]);

    const multiProject = roadmap.board.lanes.length > 1;

    return (
        <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}>
            <Header
                savedProjects={projects.savedProjects}
                openProjects={projects.openProjects}
                assistantProject={projects.assistantProject}
                focusedProject={focusedProject}
                onOpenProject={projects.openProject}
                onCloseProject={projects.closeProject}
                onNewProject={onNewProject}
                onDeleteProject={projects.deleteProject}
                onChooseAssistantProject={projects.chooseAssistantProject}
                onSave={onSave}
                onReload={onReload}
                saveState={sync.saveStateOf(focusedProject)}
                connectionState={sync.connectionState}
            />

            <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
                {/* minWidth 0 lets the canvas give up width to the docked panels */}
                <div data-testid="roadmapGraph" style={{ flex: 3, minWidth: 0, height: "100%", overflow: "auto" }}>
                    <ReactFlowProvider>
                        <RoadmapGraph
                            board={roadmap.board}
                            handleSetGoal={roadmap.setGoal}
                            handleAddTask={roadmap.addTask}
                            handleRemoveTask={roadmap.removeTask}
                            handleConnect={roadmap.connect}
                            handleRemoveEdge={roadmap.removeEdge}
                            handleUpdateEdge={roadmap.updateEdge}
                            handleToggleComplete={roadmap.toggleComplete}
                            handleChangeRoadmapContext={roadmap.changeContextToWithinTask}
                            handleCreatePlanForTask={roadmap.createPlanForTask}
                            handleSelectTask={roadmap.selectTask}
                            showTaskDetails={panel.showDetails}
                            showNextTasks={panel.toggleNextTasks}
                            toggleInbox={panel.toggleInbox}
                            handlePaste={roadmap.handlePaste}
                            handleUndo={roadmap.handleUndo}
                            promptForText={promptForText}
                            focusedProject={focusedProject}
                            notify={notify}
                            onSelectionProjectChange={onSelectionProjectChange}
                        />
                    </ReactFlowProvider>
                </div>

                {/* One slot, one panel: these are alternatives, never shown together */}
                <NextTasksDrawer
                    open={panel.activePanel === "nextTasks"}
                    onClose={panel.closeActivePanel}
                    shownTasks={roadmap.unblockedTasks}
                    showProjectKeys={multiProject}
                    toggleCompletion={roadmap.toggleComplete}
                    changeContext={roadmap.changeContextToParent}
                />

                <TaskDetailsDrawer
                    open={panel.activePanel === "details"}
                    onClose={panel.closeActivePanel}
                    selectedTask={roadmap.selectedTask}
                    updateTaskDetails={roadmap.updateTaskDetails}
                    showProjectKey={multiProject}
                />

                <InboxPanel
                    open={panel.activePanel === "inbox"}
                    onClose={panel.closeActivePanel}
                    groups={inbox.ideaGroups}
                    addIdea={inbox.addIdea}
                    addAllIdeasToPlan={inbox.addAllIdeasToPlan}
                    changeIdea={inbox.changeIdea}
                    commitIdea={inbox.commitIdea}
                    deleteIdea={inbox.deleteIdea}
                    addTaskToContextAndRemove={inbox.addTaskToContextAndRemove}
                />
            </div>

            <TextPromptDialog {...dialogProps} />
            <ConfirmDialog {...confirmDialogProps} />
            <NoticeSnackbar message={notice} onDismiss={dismissNotice} />
        </div>
    );
};

export default App;
