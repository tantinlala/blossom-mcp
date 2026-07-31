import React from "react";
import { List, ListItem, ListItemText, Typography, Checkbox, IconButton } from "@material-ui/core";
import { Task } from "@blossom/common";
import ArrowForwardIcon from "@material-ui/icons/ArrowForward";
import SidePanel from "./SidePanel";

interface NextTaskDrawerProps {
    open: boolean;
    onClose: () => void;
    shownTasks: Task[];
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
            <List>
                {shownTasks.length === 0 && (
                    <Typography variant="body1" style={{ padding: "16px" }}>
                        No tasks to show!
                    </Typography>
                )}
                {shownTasks.map((task) => (
                    <ListItem key={task.id} style={{ whiteSpace: "normal" }} data-testid={`task-item-${task.id}`}>
                        <IconButton
                            onClick={() => changeContext(task.id)}
                            data-testid={`change-context-button-${task.id}`}
                        >
                            <ArrowForwardIcon />
                        </IconButton>
                        <Checkbox
                            checked={task.completionState}
                            onChange={() => toggleCompletion(task.id)}
                            data-testid={`task-checkbox-${task.id}`}
                        />
                        <ListItemText primary={task.name} />
                    </ListItem>
                ))}
            </List>
        </SidePanel>
    );
};

export default NextTasksDrawer;
