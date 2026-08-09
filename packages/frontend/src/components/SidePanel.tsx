import React from "react";
import { Box, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useSidePanelWidth } from "../hooks/useSidePanelWidth";

interface SidePanelProps {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    testId?: string;
}

/**
 * A panel docked to the right of the workspace. It takes up width alongside the
 * graph, so the plan stays visible and interactive while the panel is open -
 * both panels that use it are reference views you consult *while* editing the
 * plan.
 *
 * The left edge is a grab strip: dragging it moves the boundary between the
 * canvas and the panel, so whichever of the two needs the room can have it.
 */
const SidePanel: React.FC<SidePanelProps> = ({ open, title, onClose, children, testId }) => {
    const { width, dragging, handleProps } = useSidePanelWidth();

    if (!open) {
        return null;
    }

    return (
        <Box
            component="aside"
            data-testid={testId}
            sx={{
                position: "relative",
                width,
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
                {...handleProps}
                data-testid={testId ? `${testId}-resize-handle` : undefined}
                sx={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 6,
                    zIndex: 2,
                    cursor: "col-resize",
                    touchAction: "none",
                    bgcolor: dragging ? "primary.main" : "transparent",
                    transition: "background-color 120ms",
                    "&:hover": { bgcolor: "primary.main" },
                    "&:focus-visible": { outline: "none", bgcolor: "primary.main" },
                }}
            />
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
