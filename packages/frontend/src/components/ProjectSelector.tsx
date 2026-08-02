import React, { useState } from "react";
import { Box, FormControl, IconButton, MenuItem, Select, Tooltip } from "@mui/material";
import { SelectChangeEvent } from "@mui/material/Select";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { palette } from "../theme/tokens";

const NEW_PROJECT_LABEL = "New Project";

interface ProjectSelectorProps {
    existingProjects: string[];
    selectedProject: string;
    onSelect: (filename: string) => void;
    onDelete: (filename: string) => void;
}

/**
 * Picks which project is open, and removes ones that are finished with. Each
 * saved project carries its own delete control, so a project can be cleared out
 * without being opened first.
 */
const ProjectSelector: React.FC<ProjectSelectorProps> = ({ existingProjects, selectedProject, onSelect, onDelete }) => {
    const [open, setOpen] = useState(false);

    // Deleting asks for confirmation, which belongs on top of a closed menu.
    const handleDelete = (event: React.MouseEvent, filename: string) => {
        event.stopPropagation();
        setOpen(false);
        onDelete(filename);
    };

    return (
        <FormControl size="small" sx={{ minWidth: 200 }}>
            <Select
                value={selectedProject}
                onChange={(event: SelectChangeEvent<string>) => onSelect(event.target.value)}
                open={open}
                onOpen={() => setOpen(true)}
                onClose={() => setOpen(false)}
                displayEmpty
                size="small"
                fullWidth
                inputProps={{ "aria-label": "Project" }}
                // Rows carry a delete control, which has no place in the closed
                // selector, so the value is rendered from the name alone.
                renderValue={(value) => (value === "" ? NEW_PROJECT_LABEL : value)}
                // A switcher, so the outline only appears once it is pointed at
                sx={{
                    bgcolor: palette.surfaceMuted,
                    fontWeight: 600,
                    transition: "background-color 120ms ease",
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "transparent" },
                    "& .MuiSelect-icon": { color: "text.secondary" },
                    "&:hover": { bgcolor: palette.border },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "transparent" },
                }}
            >
                <MenuItem value="" data-testid="new-project-option">
                    {NEW_PROJECT_LABEL}
                </MenuItem>
                {existingProjects.map((key) => (
                    <MenuItem
                        key={key}
                        value={key}
                        data-testid={`project-option-${key}`}
                        sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 2,
                            pr: 0.5,
                            "&:hover .project-delete, & .project-delete:focus-visible": { opacity: 1 },
                        }}
                    >
                        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {key}
                        </Box>
                        <Tooltip title={`Delete ${key}`}>
                            <IconButton
                                className="project-delete"
                                size="small"
                                aria-label={`Delete ${key}`}
                                data-testid={`delete-project-${key}`}
                                onClick={(event) => handleDelete(event, key)}
                                sx={{ opacity: 0, "&:hover": { color: "error.main" } }}
                            >
                                <DeleteOutlinedIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
};

export default ProjectSelector;
