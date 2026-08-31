import React from "react";
import { Paper, Button, Box, Typography, Tooltip, Divider } from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import RefreshIcon from "@mui/icons-material/Refresh";
import { SaveState } from "../hooks/useServerSync";
import { ConnectionState } from "../utils/RealtimeClient";
import { palette, shadows } from "../theme/tokens";
import ConnectionIndicator from "./ConnectionIndicator";
import BoardSelector from "./BoardSelector";
import BrandMark from "./BrandMark";

const SAVE_STATE_LABEL: Record<SaveState, string> = {
    neverSaved: "Not saved yet",
    saved: "Saved",
    unsaved: "Unsaved changes",
};

/** Only work that could be lost is worth colouring; a saved project stays quiet. */
const SAVE_STATE_COLOR: Record<SaveState, string> = {
    neverSaved: "text.secondary",
    saved: "text.secondary",
    unsaved: "warning.dark",
};

interface HeaderProps {
    savedProjects: string[];
    openProjects: string[];
    assistantProject: string | null;
    /**
     * The project Save and Reload act on: the one holding whatever is picked out
     * on the board, and the only project there when nothing is.
     */
    focusedProject: string | null;
    onOpenProject: (filename: string) => void;
    onCloseProject: (projectKey: string) => void;
    onNewProject: () => void;
    onDeleteProject: (filename: string) => void;
    onChooseAssistantProject: (projectKey: string | null) => void;
    onSave: () => void;
    onReload: () => void;
    saveState: SaveState;
    connectionState: ConnectionState;
}

const Header: React.FC<HeaderProps> = ({
    savedProjects,
    openProjects,
    assistantProject,
    focusedProject,
    onOpenProject,
    onCloseProject,
    onNewProject,
    onDeleteProject,
    onChooseAssistantProject,
    onSave,
    onReload,
    saveState,
    connectionState,
}) => {
    // A board of one needs no saying which project Save writes to. Holding
    // several, the buttons say which lane they land in.
    const focusSuffix = openProjects.length > 1 && focusedProject ? ` ${focusedProject}` : "";

    return (
        <Paper
            square
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
                px: 2.5,
                height: 56,
                borderBottom: 1,
                borderColor: "divider",
                boxShadow: shadows.card,
                zIndex: 1,
            }}
        >
            {/* Three columns of equal weight so the board selector sits centred */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
                <BrandMark />
                <Typography variant="h6" sx={{ letterSpacing: "-0.015em" }}>
                    Blossom
                </Typography>
            </Box>

            <Box sx={{ display: "flex", justifyContent: "center", flex: 1 }}>
                <BoardSelector
                    savedProjects={savedProjects}
                    openProjects={openProjects}
                    assistantProject={assistantProject}
                    onOpen={onOpenProject}
                    onClose={onCloseProject}
                    onNewProject={onNewProject}
                    onDelete={onDeleteProject}
                    onChooseAssistantProject={onChooseAssistantProject}
                />
            </Box>

            <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 2, flex: 1 }}>
                {/* Status reads as one object so it groups apart from the actions */}
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        px: 1.25,
                        py: 0.5,
                        borderRadius: 99,
                        bgcolor: palette.surfaceMuted,
                    }}
                >
                    <ConnectionIndicator connectionState={connectionState} />
                    <Divider orientation="vertical" flexItem sx={{ my: 0.25 }} />
                    <Typography variant="caption" color={SAVE_STATE_COLOR[saveState]} data-testid="save-state">
                        {SAVE_STATE_LABEL[saveState]}
                    </Typography>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={onSave}
                        disabled={focusedProject === null}
                    >
                        {`Save${focusSuffix}`}
                    </Button>
                    {/* Opening a project loads it; this re-reads it from disk, discarding edits */}
                    <Tooltip title="Discard changes and reload this project from disk">
                        <Button
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            onClick={onReload}
                            disabled={focusedProject === null}
                            // Neutral, so blue stays the mark of the primary action
                            sx={{
                                color: "text.secondary",
                                borderColor: "divider",
                                "&:hover": { borderColor: "text.secondary", bgcolor: palette.surfaceMuted },
                            }}
                        >
                            Reload
                        </Button>
                    </Tooltip>
                </Box>
            </Box>
        </Paper>
    );
};

export default Header;
