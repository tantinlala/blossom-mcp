import React from "react";
import { Typography, Box, TextField, Checkbox, FormControlLabel, Button } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";

interface TaskDetailsFormProps {
    name: string;
    description: string;
    completionState: boolean;
    hasSubplan: boolean;
    modified: boolean;
    onNameChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onDescriptionChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onCompletionStateChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onSave: () => void;
}

const TaskDetailsForm: React.FC<TaskDetailsFormProps> = ({
    name,
    description,
    completionState,
    hasSubplan,
    modified,
    onNameChange,
    onDescriptionChange,
    onCompletionStateChange,
    onSave,
}) => {
    return (
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", height: "100%" }}>
            <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">
                    Name
                </Typography>
                <TextField
                    fullWidth
                    value={name}
                    onChange={onNameChange}
                    margin="dense"
                    data-testid="task-name-input"
                />
            </Box>

            <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary">
                    Description
                </Typography>
                <TextField
                    fullWidth
                    multiline
                    rows={6}
                    value={description}
                    onChange={onDescriptionChange}
                    margin="dense"
                    placeholder="Add a description for this task..."
                    data-testid="task-description-input"
                />
            </Box>

            {/* Only show completion checkbox for tasks without a subplan */}
            {!hasSubplan && (
                <Box sx={{ mb: 3 }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={completionState}
                                onChange={onCompletionStateChange}
                                color="primary"
                                data-testid="task-completion-checkbox"
                            />
                        }
                        label="Mark as completed"
                    />
                </Box>
            )}

            <Box sx={{ mt: "auto", display: "flex", justifyContent: "flex-end" }}>
                {/* Deliberately not "Save": this applies the edit to the task, while
                    Save in the header writes the whole project to disk. */}
                <Button
                    variant="contained"
                    startIcon={<CheckIcon />}
                    onClick={onSave}
                    disabled={!modified}
                    data-testid="update-task-button"
                >
                    Update task
                </Button>
            </Box>
        </Box>
    );
};

export default TaskDetailsForm;
