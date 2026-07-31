import { memo, useCallback } from "react";
import { Handle, Position, ConnectionLineType, HandleType, MarkerType } from "@xyflow/react";
import LayersIcon from "@mui/icons-material/Layers";
import { TaskState } from "../types/extendedTasks";
import { palette, radii, shadows } from "../theme/tokens";

// Node style constants - exported for use in other components
export const NODE_PADDING = 10;
export const NODE_BORDER_RADIUS = radii.md;
export const NODE_WIDTH = 180;
export const NODE_HALF_WIDTH = NODE_WIDTH / 2;
export const NODE_FONT_SIZE = 13;
export const CHECKBOX_MARGIN_RIGHT = 8;
export const DEFAULT_NODE_BACKGROUND = "white";

/** Labels wrap to this many lines before being truncated; the full text is in a tooltip. */
const LABEL_MAX_LINES = 2;
const BADGE_ICON_SIZE = 14;

// Node type constants
export const NODE_TYPE = "customTaskNode";

// Position constants
export const SOURCE_HANDLE_POSITION = Position.Right;
export const TARGET_HANDLE_POSITION = Position.Left;

// Edge styling constants.
// Smoothstep over bezier: in a left-to-right DAG, crossing bezier curves are the
// main source of visual noise, while orthogonal routes read as distinct channels.
export const EDGE_ANIMATION = false;
export const EDGE_TYPE = ConnectionLineType.SmoothStep;
export const EDGE_UPDATABLE_HANDLE = "target" as HandleType;
export const EDGE_MARKER_TYPE = MarkerType.ArrowClosed;
export const EDGE_WIDTH = 1.5;
export const EDGE_WIDTH_HIGHLIGHTED = 2;
export const EDGE_MARKER_SIZE = 14;
/** How far out-of-focus nodes and edges fade when a chain is being traced. */
export const DIMMED_OPACITY = 0.15;

// Re-export Position for convenience
export { Position };

interface TaskAppearance {
    background: string;
    color: string;
}

/**
 * Colour alone cannot carry the state - the completed and blocked fills are close
 * in value, and neither is distinguishable to everyone - so each state also gets
 * its own text treatment and the legend spells the mapping out.
 */
export const appearanceForState = (taskState: TaskState): TaskAppearance => {
    if (taskState === TaskState.COMPLETED) {
        return { background: palette.task.completed, color: palette.task.completedText };
    }
    if (taskState === TaskState.UNBLOCKED) {
        return { background: palette.task.unblocked, color: palette.task.unblockedText };
    }
    return { background: palette.task.blocked, color: palette.task.blockedText };
};

const handleStyle = {
    width: 8,
    height: 8,
    background: palette.surface,
    border: `1.5px solid ${palette.edge.marker}`,
};

const TaskNode = ({ data, id, selected }) => {
    const onCheckboxClick = useCallback(() => {
        data.onToggleComplete(id);
    }, [data, id]);

    const { background, color } = appearanceForState(data.taskState);
    const isCompleted = data.taskState === TaskState.COMPLETED;

    return (
        <div
            style={{
                background,
                color,
                padding: NODE_PADDING,
                borderRadius: NODE_BORDER_RADIUS,
                position: "relative",
                width: NODE_WIDTH,
                border: `1px solid ${palette.border}`,
                // A ring rather than a thicker border, so selecting a node does
                // not shift its size and nudge everything around it
                boxShadow: selected ? `0 0 0 2px ${palette.accent}` : shadows.card,
                display: "flex",
                alignItems: "center",
                gap: 6,
            }}
        >
            {!data.hasPlan && (
                <input
                    type="checkbox"
                    checked={data.completionState}
                    onChange={onCheckboxClick}
                    aria-label={`Mark ${data.label} complete`}
                    style={{ marginRight: CHECKBOX_MARGIN_RIGHT - 6, cursor: "pointer" }}
                />
            )}
            <div
                title={data.label}
                style={{
                    fontSize: NODE_FONT_SIZE,
                    lineHeight: 1.3,
                    flex: 1,
                    minWidth: 0,
                    display: "-webkit-box",
                    WebkitLineClamp: LABEL_MAX_LINES,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    // State is not carried by fill colour alone
                    textDecoration: isCompleted ? "line-through" : "none",
                    opacity: isCompleted ? 0.75 : 1,
                }}
            >
                {data.label}
            </div>
            {data.hasPlan && (
                <LayersIcon
                    titleAccess="Has a subplan - double-click to open"
                    style={{ fontSize: BADGE_ICON_SIZE, opacity: 0.65 }}
                />
            )}
            <Handle type="target" position={TARGET_HANDLE_POSITION} style={handleStyle} />
            <Handle type="source" position={SOURCE_HANDLE_POSITION} style={handleStyle} />
        </div>
    );
};

export default memo(TaskNode);
