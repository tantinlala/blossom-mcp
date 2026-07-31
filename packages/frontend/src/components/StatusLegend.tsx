import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { TaskState } from "../types/extendedTasks";
import { appearanceForState } from "./TaskNode";
import { palette, radii } from "../theme/tokens";

const ENTRIES: { state: TaskState; label: string; hint: string }[] = [
    { state: TaskState.UNBLOCKED, label: "Ready", hint: "Nothing is blocking this - it can be started now" },
    { state: TaskState.BLOCKED, label: "Blocked", hint: "Waiting on something else to finish first" },
    { state: TaskState.COMPLETED, label: "Done", hint: "Finished" },
];

/** Spells out the node colour coding, which is otherwise guesswork. */
const StatusLegend: React.FC = () => (
    <Paper
        elevation={0}
        data-testid="status-legend"
        sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 1.25,
            py: 0.75,
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            bgcolor: "background.paper",
        }}
    >
        {ENTRIES.map(({ state, label, hint }) => {
            const { background } = appearanceForState(state);
            return (
                <Box key={label} title={hint} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <Box
                        sx={{
                            width: 10,
                            height: 10,
                            borderRadius: `${radii.sm}px`,
                            bgcolor: background,
                            border: `1px solid ${palette.border}`,
                        }}
                    />
                    <Typography variant="caption" color="text.secondary">
                        {label}
                    </Typography>
                </Box>
            );
        })}
    </Paper>
);

export default StatusLegend;
