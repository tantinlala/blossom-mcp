import React, { useState, useEffect } from "react";
import { Task } from "@blossom/common";
import TaskDetailsForm from "./TaskDetailsForm";
import SidePanel from "./SidePanel";

interface TaskDetailsDrawerProps {
    open: boolean;
    onClose: () => void;
    selectedTask: Task | null;
    updateTaskDetails: (taskId: string, name: string, description?: string, completionState?: boolean) => void;
}

const TaskDetailsDrawer: React.FC<TaskDetailsDrawerProps> = ({ open, onClose, selectedTask, updateTaskDetails }) => {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [completionState, setCompletionState] = useState(false);
    const [modified, setModified] = useState(false);

    useEffect(() => {
        if (selectedTask) {
            setName(selectedTask.name);
            setDescription(selectedTask.description || "");
            setCompletionState(selectedTask.completionState);
            setModified(false);
        }
    }, [selectedTask]);

    const handleSave = () => {
        if (selectedTask && modified) {
            updateTaskDetails(selectedTask.id, name, description, completionState);
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
    const hasSubplan = selectedTask.plan !== null;

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
                key={selectedTask.id}
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
