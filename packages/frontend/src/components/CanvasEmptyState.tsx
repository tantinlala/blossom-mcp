import React from "react";
import { Box, Button, Typography } from "@mui/material";
import FlagIcon from "@mui/icons-material/Flag";

interface CanvasEmptyStateProps {
    onCreateGoal: () => void;
}

/**
 * Shown before a goal exists. A bare grid with a lone button in the corner gives
 * no clue what the app expects first, or that everything else hangs off the goal.
 */
const CanvasEmptyState: React.FC<CanvasEmptyStateProps> = ({ onCreateGoal }) => (
    <Box
        data-testid="canvas-empty-state"
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
        <FlagIcon sx={{ fontSize: 32, color: "text.disabled" }} />
        <Typography variant="h6">Start with a goal</Typography>
        <Typography variant="body2" color="text.secondary">
            Name what you are trying to achieve. Tasks are then added as steps feeding into it, each one connected to
            whatever has to happen first.
        </Typography>
        <Button
            variant="contained"
            onClick={onCreateGoal}
            sx={{ mt: 1, pointerEvents: "auto" }}
            data-testid="empty-state-create-goal"
        >
            Create your first goal
        </Button>
    </Box>
);

export default CanvasEmptyState;
