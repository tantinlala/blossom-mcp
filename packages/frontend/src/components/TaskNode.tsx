import { memo, useCallback } from "react";
import { Handle, Position, ConnectionLineType, HandleType, MarkerType } from "@xyflow/react";
import { TaskState } from "../types/extendedTasks";
import { TASK_COMPLETED_COLOR, TASK_BLOCKED_COLOR, TASK_UNBLOCKED_COLOR } from "../utils/colors";

// Node style constants - exported for use in other components
export const NODE_PADDING = 10;
export const NODE_BORDER_RADIUS = 5;
export const NODE_WIDTH = 160;
export const NODE_HALF_WIDTH = NODE_WIDTH / 2;
export const NODE_FONT_SIZE = 12;
export const CHECKBOX_MARGIN_RIGHT = 10;
export const DEFAULT_NODE_BACKGROUND = "white";

const NODE_BORDER_UNSELECTED = "1px solid black";
const NODE_BORDER_SELECTED = "2px solid black";

// Node type constants
export const NODE_TYPE = "customTaskNode";

// Position constants
export const SOURCE_HANDLE_POSITION = Position.Right;
export const TARGET_HANDLE_POSITION = Position.Left;

// Edge styling constants
export const EDGE_ANIMATION = false;
export const EDGE_TYPE = ConnectionLineType.Bezier;
export const EDGE_UPDATABLE_HANDLE = "target" as HandleType;
export const EDGE_MARKER_TYPE = MarkerType.ArrowClosed;

// Re-export Position for convenience
export { Position };

const TaskNode = ({ data, id, selected }) => {
    const onCheckboxClick = useCallback(() => {
        data.onToggleComplete(id);
    }, [data, id]);

    let selectedColor = TASK_BLOCKED_COLOR;
    if (data.taskState === TaskState.COMPLETED) {
        selectedColor = TASK_COMPLETED_COLOR;
    } else if (data.taskState === TaskState.BLOCKED) {
        selectedColor = TASK_BLOCKED_COLOR;
    } else if (data.taskState === TaskState.UNBLOCKED) {
        selectedColor = TASK_UNBLOCKED_COLOR;
    }

    return (
        <div
            style={{
                background: selectedColor,
                padding: NODE_PADDING,
                borderRadius: NODE_BORDER_RADIUS,
                position: "relative",
                width: NODE_WIDTH,
                border: selected ? NODE_BORDER_SELECTED : NODE_BORDER_UNSELECTED,
                display: "flex",
                alignItems: "center",
            }}
        >
            {!data.hasPlan && (
                <input
                    type="checkbox"
                    checked={data.completionState}
                    onChange={onCheckboxClick}
                    style={{ marginRight: CHECKBOX_MARGIN_RIGHT }}
                />
            )}
            <div style={{ fontSize: NODE_FONT_SIZE }}>
                <span>{data.label}</span>
            </div>
            <Handle type="target" position={TARGET_HANDLE_POSITION} />
            <Handle type="source" position={SOURCE_HANDLE_POSITION} />
        </div>
    );
};

export default memo(TaskNode);
