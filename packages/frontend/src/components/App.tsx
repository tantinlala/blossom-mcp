import { APIClient } from "../utils/APIClient";
import { PlanManager } from "../utils/PlanManager";
import { RealtimeClient } from "../utils/RealtimeClient";
import { useEffect } from "react";
import NextTasksDrawer from "./NextTasksDrawer";
import TaskDetailsDrawer from "./TaskDetailsDrawer";
import Header from "./Header";
import { ReactFlowProvider } from "@xyflow/react";
import RoadmapGraph from "./RoadmapGraph";
import InboxPanel from "./InboxPanel";
import { useRoadmap } from "../hooks/useRoadmap";
import { useInbox } from "../hooks/useInbox";
import { useServerSync } from "../hooks/useServerSync";
import { useProjectManagement } from "../hooks/useProjectManagement";
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
    planManager,
    realtime,
}: {
    apiClient: APIClient;
    planManager: PlanManager;
    realtime: RealtimeClient;
}) => {
    const { notice, notify, dismissNotice } = useNotices();
    const { promptForText, dialogProps } = useTextPrompt();
    const { askForConfirmation, dialogProps: confirmDialogProps } = useConfirm();

    const sync = useServerSync({ apiClient, planManager, realtime, notify });
    const roadmap = useRoadmap(planManager, apiClient, sync.applyState, notify);
    const inbox = useInbox({
        apiClient,
        planManager,
        applyState: sync.applyState,
        notify,
    });
    const panel = useSidePanel();
    const project = useProjectManagement({
        apiClient,
        applyState: sync.applyState,
        setSelectedTask: roadmap.setSelectedTask,
        promptForText,
        askForConfirmation,
        markSaved: sync.markSaved,
        markNeverSaved: sync.markNeverSaved,
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
    const { syncRoadmap } = roadmap;
    const { applyRemoteInbox } = inbox;
    const { applyActiveProject } = project;
    useEffect(() => {
        registerTargets({ applyRemoteInbox, applyActiveProject, syncRoadmap });
    }, [registerTargets, applyRemoteInbox, applyActiveProject, syncRoadmap]);

    // Opening or creating a project replaces what everyone connected is looking
    // at, so the server refuses to do it unattended and asks through here.
    useEffect(() => {
        apiClient.setConfirmHandler(async (otherCount: number) => {
            const others = otherCount === 1 ? "Somebody else is" : `${otherCount} other people are`;
            return await askForConfirmation({
                title: "Switch everyone's project?",
                message: `${others} working on this project right now. Opening another one changes what they see too.`,
                confirmLabel: "Switch anyway",
            });
        });
    }, [apiClient, askForConfirmation]);

    const { initializeApp } = project;
    useEffect(() => {
        initializeApp();
    }, [initializeApp]);

    return (
        <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}>
            <Header
                existingProjects={project.existingProjects}
                selectedProject={project.selectedProject}
                handleProjectChange={project.handleProjectChange}
                onDeleteProject={project.deleteProject}
                onSave={project.onSave}
                onRestore={project.onRestore}
                saveState={sync.saveState}
                connectionState={sync.connectionState}
            />

            <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
                {/* minWidth 0 lets the canvas give up width to the docked panels */}
                <div data-testid="roadmapGraph" style={{ flex: 3, minWidth: 0, height: "100%", overflow: "auto" }}>
                    <ReactFlowProvider>
                        <RoadmapGraph
                            presentlyShownRoadmap={roadmap.presentlyShownRoadmap}
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
                        />
                    </ReactFlowProvider>
                </div>

                {/* One slot, one panel: these are alternatives, never shown together */}
                <NextTasksDrawer
                    open={panel.activePanel === "nextTasks"}
                    onClose={panel.closeActivePanel}
                    shownTasks={roadmap.unblockedTasks}
                    toggleCompletion={roadmap.toggleComplete}
                    changeContext={roadmap.changeContextToParent}
                />

                <TaskDetailsDrawer
                    open={panel.activePanel === "details"}
                    onClose={panel.closeActivePanel}
                    selectedTask={roadmap.selectedTask}
                    updateTaskDetails={roadmap.updateTaskDetails}
                />

                <InboxPanel
                    open={panel.activePanel === "inbox"}
                    onClose={panel.closeActivePanel}
                    ideaList={inbox.ideaList}
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
