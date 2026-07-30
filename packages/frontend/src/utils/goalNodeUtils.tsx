import { Position, Node } from "@xyflow/react";
import { GOAL_COLOR, GOAL_FONT_COLOR } from "./colors";
import { GOAL_ID } from "@blossom/common";

const createGoalNode = (goalString: string) => {
    return {
        id: GOAL_ID,
        data: { label: goalString, description: "" },
        style: { background: GOAL_COLOR, color: GOAL_FONT_COLOR },
        type: "output",
        targetPosition: Position.Left,
        position: { x: 0, y: 0 },
    } as Node;
};

export { createGoalNode, GOAL_ID };
