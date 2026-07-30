import React, { useState, useEffect } from "react";
import { Drawer } from "@material-ui/core";
import { Task } from "@blossom/common";
import TaskDetailsForm from "./TaskDetailsForm";

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
        <Drawer
            anchor="right"
            open={open && selectedTask !== null}
            onClose={onClose}
            PaperProps={{ style: { width: "30%", padding: "16px" } }}
            data-testid="task-details-drawer"
        >
            <TaskDetailsForm
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
        </Drawer>
    );
};

export default TaskDetailsDrawer;
