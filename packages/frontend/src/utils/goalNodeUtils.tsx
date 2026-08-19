import { Node } from "@xyflow/react";
import { GOAL_ID } from "@blossom/common";
import { GOAL_NODE_TYPE, TARGET_HANDLE_POSITION } from "../components/TaskNode";

/**
 * The canvas id of a project's goal node.
 *
 * Every project's plan names its own goal with the same sentinel, so a board
 * holding several needs the project in the id to keep the goals apart. Task ids
 * are unique across projects and are used as they are.
 */
const goalNodeId = (projectKey: string): string => `${GOAL_ID}@${projectKey}`;

/** Whether a canvas id names a goal node, and which project's if so. */
const parseGoalNodeId = (nodeId: string): string | null => {
    const separator = nodeId.indexOf("@");
    if (separator === -1 || nodeId.slice(0, separator) !== GOAL_ID) {
        return null;
    }
    return nodeId.slice(separator + 1);
};

/** The canvas id a task carries inside one project's lane. */
const laneNodeId = (projectKey: string, taskId: string): string =>
    taskId === GOAL_ID ? goalNodeId(projectKey) : taskId;

const createGoalNode = (projectKey: string, goalString: string): Node => {
    return {
        id: goalNodeId(projectKey),
        data: { label: goalString, description: "", projectKey },
        type: GOAL_NODE_TYPE,
        targetPosition: TARGET_HANDLE_POSITION,
        position: { x: 0, y: 0 },
    } as Node;
};

export { createGoalNode, goalNodeId, parseGoalNodeId, laneNodeId };
