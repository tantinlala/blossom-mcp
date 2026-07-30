import React from "react";
import { Paper, Button, Box, Select, MenuItem, FormControl, Typography } from "@material-ui/core";

interface HeaderProps {
    existingProjects: string[];
    selectedProject: string;
    handleProjectChange: (event: React.ChangeEvent<{ value: unknown }>) => void;
    onSave: () => void;
    onRestore: () => void;
}

const Header: React.FC<HeaderProps> = ({
    existingProjects,
    selectedProject,
    handleProjectChange,
    onSave,
    onRestore,
}) => {
    return (
        <Paper
            square
            style={{
                marginBottom: "1px",
                padding: "0 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
            }}
        >
            {/* Left column: app title */}
            <Box display="flex" alignItems="center" flexGrow={1}>
                <Typography variant="h6">Blossom</Typography>
            </Box>

            {/* Middle column: project selection, fixed width to maintain center position */}
            <Box display="flex" justifyContent="center" alignItems="center" flexGrow={1} style={{ padding: "8px 0" }}>
                <FormControl variant="outlined" size="small" style={{ minWidth: 150, marginRight: "8px" }}>
                    {/* Apply data-testid to the FormControl which is the parent of the dropdown */}
                    <div data-testid="project-select-container">
                        <Select value={selectedProject} onChange={handleProjectChange} displayEmpty>
                            <MenuItem value="" data-testid="new-project-option">
                                New Project
                            </MenuItem>
                            {existingProjects.map((key) => (
                                <MenuItem key={key} value={key} data-testid={`project-option-${key}`}>
                                    {key}
                                </MenuItem>
                            ))}
                        </Select>
                    </div>
                </FormControl>
                <Button variant="contained" onClick={onSave} style={{ marginRight: "8px" }}>
                    Save
                </Button>
                <Button variant="contained" onClick={onRestore}>
                    Open
                </Button>
            </Box>
        </Paper>
    );
};

export default Header;
