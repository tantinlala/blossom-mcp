import React from "react";
import { Box, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

export const SIDE_PANEL_WIDTH = 340;

interface SidePanelProps {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    testId?: string;
}

/**
 * A panel docked to the right of the workspace. It takes up width alongside the
 * graph rather than covering it, so the plan stays visible and interactive while
 * the panel is open - both panels that use it are reference views you consult
 * *while* editing the plan.
 */
const SidePanel: React.FC<SidePanelProps> = ({ open, title, onClose, children, testId }) => {
    if (!open) {
        return null;
    }

    return (
        <Box
            component="aside"
            data-testid={testId}
            sx={{
                width: SIDE_PANEL_WIDTH,
                flexShrink: 0,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                borderLeft: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    pl: 2,
                    pr: 1,
                    py: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    flexShrink: 0,
                }}
            >
                <Typography variant="subtitle1">{title}</Typography>
                <IconButton size="small" onClick={onClose} aria-label={`Close ${title}`}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Box>
            <Box sx={{ flex: 1, overflowY: "auto" }}>{children}</Box>
        </Box>
    );
};

export default SidePanel;
