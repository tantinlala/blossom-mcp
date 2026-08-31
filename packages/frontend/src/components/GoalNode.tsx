import { memo } from "react";
import { Handle } from "@xyflow/react";
import { GOAL_COLOR, GOAL_FONT_COLOR } from "../utils/colors";
import { NODE_BORDER_RADIUS, NODE_FONT_SIZE, NODE_PADDING, NODE_WIDTH, TARGET_HANDLE_POSITION } from "./TaskNode";
import { palette, shadows } from "../theme/tokens";

/** Shown for a project whose goal has yet to be named. */
export const UNNAMED_GOAL_LABEL = "Unnamed goal";

const handleStyle = {
    width: 8,
    height: 8,
    background: palette.surface,
    border: `1.5px solid ${palette.edge.marker}`,
};

/**
 * Where a project's plan converges. It carries the project's name above the goal,
 * so a board holding several projects says which lane belongs to which - and a
 * project whose goal is still unnamed is identifiable from the moment it opens.
 */
const GoalNode = ({ data, selected }) => {
    return (
        <div
            style={{
                background: GOAL_COLOR,
                color: GOAL_FONT_COLOR,
                padding: NODE_PADDING,
                borderRadius: NODE_BORDER_RADIUS,
                width: NODE_WIDTH,
                border: "none",
                boxShadow: selected ? `0 0 0 2px ${palette.accent}` : shadows.card,
            }}
        >
            <div
                title={data.projectKey}
                style={{
                    fontSize: NODE_FONT_SIZE - 2,
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    opacity: 0.8,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {data.projectKey}
            </div>
            <div
                title={data.label || UNNAMED_GOAL_LABEL}
                style={{
                    fontSize: NODE_FONT_SIZE,
                    fontWeight: 600,
                    lineHeight: 1.3,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    opacity: data.label ? 1 : 0.7,
                    fontStyle: data.label ? "normal" : "italic",
                }}
            >
                {data.label || UNNAMED_GOAL_LABEL}
            </div>
            <Handle type="target" position={TARGET_HANDLE_POSITION} style={handleStyle} />
        </div>
    );
};

export default memo(GoalNode);
