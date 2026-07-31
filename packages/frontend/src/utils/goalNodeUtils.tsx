import { Position, Node } from "@xyflow/react";
import { GOAL_COLOR, GOAL_FONT_COLOR } from "./colors";
import { GOAL_ID } from "@blossom/common";
import { NODE_BORDER_RADIUS, NODE_FONT_SIZE, NODE_PADDING, NODE_WIDTH } from "../components/TaskNode";
import { shadows } from "../theme/tokens";

const createGoalNode = (goalString: string) => {
    return {
        id: GOAL_ID,
        data: { label: goalString, description: "" },
        // Matches the task node shell so the goal reads as the same family of thing
        style: {
            background: GOAL_COLOR,
            color: GOAL_FONT_COLOR,
            border: "none",
            borderRadius: NODE_BORDER_RADIUS,
            boxShadow: shadows.card,
            padding: NODE_PADDING,
            width: NODE_WIDTH,
            fontSize: NODE_FONT_SIZE,
            fontWeight: 600,
        },
        type: "output",
        targetPosition: Position.Left,
        position: { x: 0, y: 0 },
    } as Node;
};

export { createGoalNode, GOAL_ID };
