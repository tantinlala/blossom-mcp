import React from "react";
import { Typography, Box, TextField, Checkbox, FormControlLabel, Button } from "@material-ui/core";
import SaveIcon from "@material-ui/icons/Save";

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
        <Box p={2} display="flex" flexDirection="column" height="100%">
            <Box mt={2} mb={3}>
                <Typography variant="subtitle2" color="textSecondary">
                    Name
                </Typography>
                <TextField
                    fullWidth
                    value={name}
                    onChange={onNameChange}
                    variant="outlined"
                    margin="dense"
                    data-testid="task-name-input"
                />
            </Box>

            <Box mb={3}>
                <Typography variant="subtitle2" color="textSecondary">
                    Description
                </Typography>
                <TextField
                    fullWidth
                    multiline
                    rows={4}
                    value={description}
                    onChange={onDescriptionChange}
                    variant="outlined"
                    margin="dense"
                    placeholder="Add a description for this task..."
                    data-testid="task-description-input"
                />
            </Box>

            {/* Only show completion checkbox for tasks without a subplan */}
            {!hasSubplan && (
                <Box mb={3}>
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

            <Box mt="auto" display="flex" justifyContent="center">
                <Button
                    variant="contained"
                    color="primary"
                    startIcon={<SaveIcon />}
                    onClick={onSave}
                    disabled={!modified}
                    data-testid="save-task-button"
                >
                    Save Changes
                </Button>
            </Box>
        </Box>
    );
};

export default TaskDetailsForm;
