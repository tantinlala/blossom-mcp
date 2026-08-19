import React, { useState, useEffect } from "react";
import TaskDetailsForm from "./TaskDetailsForm";
import SidePanel from "./SidePanel";
import { SelectedTask } from "../hooks/useRoadmap";

interface TaskDetailsDrawerProps {
    open: boolean;
    onClose: () => void;
    selectedTask: SelectedTask | null;
    /** Applies the edit to whichever task is selected, in whichever project holds it. */
    updateTaskDetails: (name: string, description?: string, completionState?: boolean) => void;
    /** Named above the form when the board holds more than one project. */
    showProjectKey: boolean;
}

const TaskDetailsDrawer: React.FC<TaskDetailsDrawerProps> = ({
    open,
    onClose,
    selectedTask,
    updateTaskDetails,
    showProjectKey,
}) => {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [completionState, setCompletionState] = useState(false);
    const [modified, setModified] = useState(false);

    useEffect(() => {
        if (selectedTask) {
            setName(selectedTask.task.name);
            setDescription(selectedTask.task.description || "");
            setCompletionState(selectedTask.task.completionState);
            setModified(false);
        }
    }, [selectedTask]);

    const handleSave = () => {
        if (selectedTask && modified) {
            updateTaskDetails(name, description, completionState);
            setModified(false);
        }
    };

    const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setModified(true);
        setName(event.target.value);
    };

    const handleDescriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setModified(true);
        setDescription(event.target.value);
    };

    const handleCompletionStateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setModified(true);
        setCompletionState(event.target.checked);
    };

    if (!selectedTask) {
        return null;
    }

    // Check if the task has a subplan
    const hasSubplan = selectedTask.task.plan !== null;

    return (
        <SidePanel
            open={open && selectedTask !== null}
            onClose={onClose}
            title="Task Details"
            testId="task-details-drawer"
        >
            {/* Keying on the task id gives each task a fresh form, so the description
                opens in its reading view whenever a different task is selected. */}
            <TaskDetailsForm
                key={selectedTask.ref.taskId}
                projectKey={showProjectKey ? selectedTask.ref.projectKey : undefined}
                name={name}
                description={description}
                completionState={completionState}
                hasSubplan={hasSubplan}
                modified={modified}
                onNameChange={handleNameChange}
                onDescriptionChange={handleDescriptionChange}
                onCompletionStateChange={handleCompletionStateChange}
                onSave={handleSave}
            />
        </SidePanel>
    );
};

export default TaskDetailsDrawer;
