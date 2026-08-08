import React, { useState } from "react";
import { Typography, Box, TextField, Checkbox, FormControlLabel, Button } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import LinkifiedText from "./LinkifiedText";

/** Matches the height of the description field's six rows, so the block does not jump on edit. */
const DESCRIPTION_MIN_HEIGHT = 152;

const DESCRIPTION_PLACEHOLDER = "Add a description for this task...";

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
    const [editingDescription, setEditingDescription] = useState(false);

    /** Puts the caret after the existing text, so typing continues the description. */
    const handleDescriptionFocus = (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { value } = event.target;
        event.target.setSelectionRange(value.length, value.length);
    };

    const handleDescriptionKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Escape") {
            setEditingDescription(false);
        }
    };

    const handleDisplayKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" && event.target === event.currentTarget) {
            event.preventDefault();
            setEditingDescription(true);
        }
    };

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
                {editingDescription ? (
                    <TextField
                        fullWidth
                        multiline
                        rows={6}
                        autoFocus
                        value={description}
                        onChange={onDescriptionChange}
                        onFocus={handleDescriptionFocus}
                        onKeyDown={handleDescriptionKeyDown}
                        onBlur={() => setEditingDescription(false)}
                        margin="dense"
                        placeholder={DESCRIPTION_PLACEHOLDER}
                        data-testid="task-description-input"
                    />
                ) : (
                    <Box
                        tabIndex={0}
                        onClick={() => setEditingDescription(true)}
                        onKeyDown={handleDisplayKeyDown}
                        aria-label="Description, press Enter to edit"
                        data-testid="task-description-display"
                        sx={{
                            mt: 1,
                            mb: 0.5,
                            p: 1.75,
                            minHeight: DESCRIPTION_MIN_HEIGHT,
                            cursor: "text",
                            borderRadius: 1,
                            border: 1,
                            borderColor: "divider",
                            "&:hover": { borderColor: "text.primary" },
                            "&:focus-visible": { outline: "none", borderColor: "primary.main" },
                        }}
                    >
                        {description ? (
                            <LinkifiedText text={description} />
                        ) : (
                            <Typography variant="body2" color="text.disabled">
                                {DESCRIPTION_PLACEHOLDER}
                            </Typography>
                        )}
                    </Box>
                )}
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
