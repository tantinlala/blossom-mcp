import React, { useState } from "react";
import {
    Box,
    Button,
    Checkbox,
    Divider,
    IconButton,
    ListItemText,
    Menu,
    MenuItem,
    Tooltip,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { palette } from "../theme/tokens";

interface BoardSelectorProps {
    /** Every project with a file behind it. */
    savedProjects: string[];
    /** The projects on this board, in lane order. */
    openProjects: string[];
    /** Which project MCP tool calls act on. */
    assistantProject: string | null;
    onOpen: (filename: string) => void;
    onClose: (projectKey: string) => void;
    onNewProject: () => void;
    onDelete: (filename: string) => void;
    onChooseAssistantProject: (projectKey: string | null) => void;
}

/** What the button says the board is showing. */
const boardLabel = (openProjects: string[]): string => {
    if (openProjects.length === 0) {
        return "No projects";
    }
    if (openProjects.length === 1) {
        return openProjects[0];
    }
    return `${openProjects.length} projects`;
};

/**
 * Chooses what the board shows, and removes projects that are finished with.
 *
 * Several projects can be shown at once, each getting its own lane, so each row
 * carries its own checkbox: showing one project leaves the rest where they are.
 * A project open here but not saved anywhere appears among them: it is on this
 * board, which is what the list is about.
 *
 * Each row also carries the control that hands the project to the assistant.
 * That choice is shared - the assistant works on one project for everybody - so
 * it sits apart from the checkbox that only affects this board.
 */
const BoardSelector: React.FC<BoardSelectorProps> = ({
    savedProjects,
    openProjects,
    assistantProject,
    onOpen,
    onClose,
    onNewProject,
    onDelete,
    onChooseAssistantProject,
}) => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    // Projects open on this board but with no file behind them belong in the list
    // too, so everything on the board can be seen and taken off it.
    const unsavedOpen = openProjects.filter((key) => !savedProjects.includes(key));
    const rows = [...unsavedOpen, ...savedProjects];

    const closeMenu = () => setAnchorEl(null);

    const onToggle = (key: string) => {
        if (openProjects.includes(key)) {
            onClose(key);
        } else {
            onOpen(key);
        }
    };

    return (
        <>
            <Button
                onClick={(event) => setAnchorEl(event.currentTarget)}
                endIcon={<ArrowDropDownIcon />}
                data-testid="board-selector"
                aria-haspopup="true"
                aria-expanded={open}
                sx={{
                    color: "text.primary",
                    bgcolor: palette.surfaceMuted,
                    px: 1.5,
                    maxWidth: 320,
                    "& .MuiButton-endIcon": { ml: 0.5 },
                }}
            >
                <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                    {boardLabel(openProjects)}
                </Typography>
            </Button>

            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={closeMenu}
                slotProps={{ paper: { sx: { minWidth: 320, maxHeight: 420 } } }}
            >
                <MenuItem
                    onClick={() => {
                        closeMenu();
                        onNewProject();
                    }}
                    data-testid="new-project"
                >
                    <AddIcon fontSize="small" sx={{ mr: 1.5 }} />
                    <ListItemText primary="New project" />
                </MenuItem>

                <Divider />

                {rows.length === 0 && (
                    <Box sx={{ px: 2, py: 1.5, maxWidth: 300 }}>
                        <Typography variant="body2" color="text.secondary">
                            Nothing saved yet. Start a project, then save it to give it a name.
                        </Typography>
                    </Box>
                )}

                {rows.map((key) => {
                    const isOpen = openProjects.includes(key);
                    const isAssistantProject = assistantProject === key;
                    const isSaved = savedProjects.includes(key);
                    return (
                        <MenuItem
                            key={key}
                            onClick={() => onToggle(key)}
                            data-testid={`project-row-${key}`}
                            sx={{ pr: 1 }}
                        >
                            <Checkbox
                                edge="start"
                                size="small"
                                checked={isOpen}
                                tabIndex={-1}
                                disableRipple
                                slotProps={{ input: { "aria-label": `Show ${key} on the board` } }}
                                sx={{ mr: 0.5 }}
                            />
                            <ListItemText
                                primary={key}
                                secondary={isSaved ? null : "Not saved yet"}
                                slotProps={{
                                    primary: { variant: "body2", noWrap: true },
                                    secondary: { variant: "caption" },
                                }}
                            />
                            <Tooltip
                                title={
                                    isAssistantProject
                                        ? "The assistant works on this project. Click to leave it unset."
                                        : "Hand this project to the assistant"
                                }
                            >
                                <IconButton
                                    size="small"
                                    aria-label={
                                        isAssistantProject
                                            ? `Stop the assistant working on ${key}`
                                            : `Let the assistant work on ${key}`
                                    }
                                    data-testid={`assistant-target-${key}`}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onChooseAssistantProject(isAssistantProject ? null : key);
                                    }}
                                    sx={{ color: isAssistantProject ? "primary.main" : "text.disabled" }}
                                >
                                    {isAssistantProject ? (
                                        <SmartToyIcon fontSize="small" />
                                    ) : (
                                        <SmartToyOutlinedIcon fontSize="small" />
                                    )}
                                </IconButton>
                            </Tooltip>
                            {isSaved && (
                                <Tooltip title={`Delete ${key}`}>
                                    <IconButton
                                        size="small"
                                        aria-label={`Delete ${key}`}
                                        data-testid={`delete-project-${key}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            // Deleting asks for confirmation, which
                                            // the menu would sit on top of.
                                            closeMenu();
                                            onDelete(key);
                                        }}
                                        sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                                    >
                                        <DeleteOutlinedIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}
                        </MenuItem>
                    );
                })}
            </Menu>
        </>
    );
};

export default BoardSelector;
