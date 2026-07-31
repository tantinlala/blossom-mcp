import React from "react";
import { IconButton, Typography } from "@material-ui/core";
import CloseIcon from "@material-ui/icons/Close";

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
        <aside
            data-testid={testId}
            style={{
                width: SIDE_PANEL_WIDTH,
                flexShrink: 0,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                borderLeft: "1px solid #e0e0e0",
                background: "white",
            }}
        >
            {/* Plain flexbox rather than MUI's Box: this project is on Material-UI
                v4, whose Box system props emit classes that resolve to nothing. */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 8px 8px 16px",
                    borderBottom: "1px solid #e0e0e0",
                    flexShrink: 0,
                }}
            >
                <Typography variant="subtitle1">{title}</Typography>
                <IconButton size="small" onClick={onClose} aria-label={`Close ${title}`}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
        </aside>
    );
};

export default SidePanel;
