import React from "react";
import { Box, Checkbox, List, ListItem, ListItemButton, ListItemText, Tooltip, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { NextTask } from "../types/roadmap";
import SidePanel from "./SidePanel";

interface NextTaskDrawerProps {
    open: boolean;
    onClose: () => void;
    shownTasks: NextTask[];
    toggleCompletion: (taskId: string) => void;
    changeContext: (taskId: string) => void;
}

const NextTasksDrawer: React.FC<NextTaskDrawerProps> = ({
    open,
    onClose,
    shownTasks,
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
                {shownTasks.map(({ task, path }) => (
                    <ListItem
                        key={task.id}
                        disablePadding
                        data-testid={`task-item-${task.id}`}
                        secondaryAction={
                            <Tooltip title="Go to the plan this task lives in">
                                <ListItemButton
                                    onClick={() => changeContext(task.id)}
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
                                onChange={() => toggleCompletion(task.id)}
                                slotProps={{ input: { "aria-label": `Mark ${task.name} complete` } }}
                                data-testid={`task-checkbox-${task.id}`}
                            />
                            <ListItemText
                                primary={task.name}
                                // Startable tasks are nested in subplans, so the name
                                // alone does not say where to find one
                                secondary={path.length > 0 ? path.map((crumb) => crumb.name).join(" / ") : null}
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
