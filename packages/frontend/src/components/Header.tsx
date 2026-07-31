import React from "react";
import { Paper, Button, Box, Select, MenuItem, FormControl, Typography, Tooltip } from "@mui/material";
import { SelectChangeEvent } from "@mui/material/Select";
import SaveIcon from "@mui/icons-material/Save";
import RefreshIcon from "@mui/icons-material/Refresh";

interface HeaderProps {
    existingProjects: string[];
    selectedProject: string;
    handleProjectChange: (filename: string) => void;
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
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
                px: 2,
                py: 1,
                borderBottom: 1,
                borderColor: "divider",
            }}
        >
            {/* Three columns of equal weight so the project selector sits centred */}
            <Box sx={{ display: "flex", alignItems: "center", flex: 1 }}>
                <Typography variant="h6">Blossom</Typography>
            </Box>

            <Box sx={{ display: "flex", justifyContent: "center", flex: 1 }}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                    <div data-testid="project-select-container">
                        <Select
                            value={selectedProject}
                            onChange={(event: SelectChangeEvent<string>) => handleProjectChange(event.target.value)}
                            displayEmpty
                            size="small"
                            fullWidth
                            inputProps={{ "aria-label": "Project" }}
                        >
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
            </Box>

            <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 1, flex: 1 }}>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={onSave}>
                    Save
                </Button>
                {/* Selecting a project loads it; this re-reads it from disk, discarding edits */}
                <Tooltip title="Discard changes and reload this project from disk">
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRestore}>
                        Reload
                    </Button>
                </Tooltip>
            </Box>
        </Paper>
    );
};

export default Header;
