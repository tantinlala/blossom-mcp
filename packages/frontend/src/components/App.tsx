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

const App = ({ apiClient, planManager }: { apiClient: APIClient; planManager: PlanManager }) => {
    const sync = useServerSync({ apiClient, planManager });
    const roadmap = useRoadmap(planManager, apiClient, sync.applyState);
    const inbox = useInbox({
        apiClient,
        planManager,
        applyState: sync.applyState,
        setEditingPaused: sync.setEditingPaused,
    });
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
                            showTaskDetails={roadmap.toggleDetailsDrawer(true)}
                            showNextTasks={roadmap.toggleNextTasksDrawer(true)}
                            handlePaste={roadmap.handlePaste}
                            handleUndo={roadmap.handleUndo}
                        />
                    </ReactFlowProvider>
                </div>

                {/* Docked beside the graph so it stays visible while these are open */}
                <NextTasksDrawer
                    open={roadmap.drawerOpen}
                    onClose={roadmap.toggleNextTasksDrawer(false)}
                    shownTasks={roadmap.unblockedTasks}
                    toggleCompletion={roadmap.toggleComplete}
                    changeContext={roadmap.changeContextToParent}
                />

                <TaskDetailsDrawer
                    open={roadmap.detailsDrawerOpen}
                    onClose={roadmap.toggleDetailsDrawer(false)}
                    selectedTask={roadmap.selectedTask}
                    updateTaskDetails={roadmap.updateTaskDetails}
                />

                <div style={{ flex: 1, maxWidth: "400px", height: "100%", overflow: "hidden" }}>
                    <InboxPanel
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
        </div>
    );
};

export default App;
