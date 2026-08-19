import React from "react";
import { Box, Typography } from "@mui/material";
import DashboardCustomizeIcon from "@mui/icons-material/DashboardCustomize";

/**
 * Shown while the board holds no projects. The projects menu in the header is
 * where they are chosen, so this says so: a bare grid gives no clue that the
 * canvas is waiting on a choice made somewhere else.
 */
const BoardEmptyState: React.FC = () => (
    <Box
        data-testid="board-empty-state"
        sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 1,
            maxWidth: 380,
            // The panel is centred on the canvas, so it must not swallow drag
            // and scroll gestures meant for the pane behind it
            pointerEvents: "none",
        }}
    >
        <DashboardCustomizeIcon sx={{ fontSize: 32, color: "text.disabled" }} />
        <Typography variant="h6">Choose what to look at</Typography>
        <Typography variant="body2" color="text.secondary">
            Pick projects from the menu at the top of the page. Choose several and each one gets its own lane across the
            board, so a whole set of plans reads at once.
        </Typography>
    </Box>
);

export default BoardEmptyState;
