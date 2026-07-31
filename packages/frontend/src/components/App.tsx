import { APIClient } from "../utils/APIClient";
import { PlanManager } from "../utils/PlanManager";
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

const App = ({ apiClient, planManager }: { apiClient: APIClient; planManager: PlanManager }) => {
    const sync = useServerSync({ apiClient, planManager });
    const roadmap = useRoadmap(planManager, apiClient, sync.applyState);
    const inbox = useInbox({
        apiClient,
        planManager,
        applyState: sync.applyState,
        setEditingPaused: sync.setEditingPaused,
    });
    const panel = useSidePanel();
    const project = useProjectManagement({
        apiClient,
        applyState: sync.applyState,
        setSelectedTask: roadmap.setSelectedTask,
    });

    // useServerSync is created before the hooks that own React state, so the
    // setters it fans state out to are registered here
    const { registerTargets } = sync;
    const { syncRoadmap } = roadmap;
    const { setIdeaList } = inbox;
    useEffect(() => {
        registerTargets({ setIdeaList, syncRoadmap });
    }, [registerTargets, setIdeaList, syncRoadmap]);

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
                onSave={project.onSave}
                onRestore={project.onRestore}
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
        </div>
    );
};

export default App;
