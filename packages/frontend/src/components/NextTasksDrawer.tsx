import React from "react";
import { Box, Checkbox, List, ListItem, ListItemButton, ListItemText, Tooltip, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { NextTask, TaskRef } from "../types/roadmap";
import SidePanel from "./SidePanel";

interface NextTaskDrawerProps {
    open: boolean;
    onClose: () => void;
    /** Every startable task across the board, project by project. */
    shownTasks: NextTask[];
    /** Whether a task needs saying which project it belongs to. */
    showProjectKeys: boolean;
    toggleCompletion: (ref: TaskRef) => void;
    changeContext: (ref: TaskRef) => void;
}

/**
 * The tasks that can be started now. A board can hold several projects, so each
 * task carries the plan it lives in and, when it matters, the project as well.
 */
const NextTasksDrawer: React.FC<NextTaskDrawerProps> = ({
    open,
    onClose,
    shownTasks,
    showProjectKeys,
    toggleCompletion,
    changeContext,
}) => {
    return (
        <SidePanel open={open} onClose={onClose} title={'"Next Task" List'} testId="task-drawer">
            <List disablePadding>
                {shownTasks.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                        No tasks to show!
                    </Typography>
                )}
                {shownTasks.map(({ task, path, projectKey }) => (
                    <ListItem
                        key={task.id}
                        disablePadding
                        data-testid={`task-item-${task.id}`}
                        secondaryAction={
                            <Tooltip title="Go to the plan this task lives in">
                                <ListItemButton
                                    onClick={() => changeContext({ projectKey, taskId: task.id })}
                                    data-testid={`change-context-button-${task.id}`}
                                    sx={{ minWidth: 0, borderRadius: 1, p: 1, flexGrow: 0 }}
                                >
                                    <ArrowForwardIcon fontSize="small" />
                                </ListItemButton>
                            </Tooltip>
                        }
                    >
                        <Box sx={{ display: "flex", alignItems: "flex-start", pl: 1, py: 0.5, pr: 5, width: "100%" }}>
                            <Checkbox
                                size="small"
                                checked={task.completionState}
                                onChange={() => toggleCompletion({ projectKey, taskId: task.id })}
                                slotProps={{ input: { "aria-label": `Mark ${task.name} complete` } }}
                                data-testid={`task-checkbox-${task.id}`}
                            />
                            <ListItemText
                                primary={task.name}
                                // Startable tasks are nested in subplans, so the name
                                // alone does not say where to find one
                                secondary={
                                    [...(showProjectKeys ? [projectKey] : []), ...path.map((crumb) => crumb.name)].join(
                                        " / ",
                                    ) || null
                                }
                                slotProps={{
                                    primary: { variant: "body2" },
                                    secondary: { variant: "caption", noWrap: true },
                                }}
                                sx={{ my: 0.5 }}
                            />
                        </Box>
                    </ListItem>
                ))}
            </List>
        </SidePanel>
    );
};

export default NextTasksDrawer;
