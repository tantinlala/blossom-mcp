import { Node, Edge } from "@xyflow/react";
import { TaskAndState } from "../types/extendedTasks";
import {
    NODE_TYPE,
    DEFAULT_NODE_BACKGROUND,
    SOURCE_HANDLE_POSITION,
    TARGET_HANDLE_POSITION,
    EDGE_TYPE,
    EDGE_ANIMATION,
    EDGE_UPDATABLE_HANDLE,
    EDGE_MARKER_TYPE,
} from "../components/TaskNode";

const createTaskNode = (
    task: TaskAndState,
    position: { x: number; y: number },
    onToggleComplete: (taskId: string) => void,
    hidden: boolean,
) => {
    return {
        id: task.task.id,
        data: {
            label: task.task.name,
            description: "",
            taskState: task.state,
            completionState: task.task.completionState,
            onToggleComplete,
            hasPlan: !!task.task.plan,
        },
        style: { background: DEFAULT_NODE_BACKGROUND },
        sourcePosition: SOURCE_HANDLE_POSITION,
        targetPosition: TARGET_HANDLE_POSITION,
        position: position,
        type: NODE_TYPE,
        hidden,
    } as Node;
};

const createTaskNodeFromExisting = (task: TaskAndState, existingNode: Node) => {
    return {
        ...existingNode,
        data: {
            label: task.task.name,
            description: "",
            taskState: task.state,
            completionState: task.task.completionState,
            onToggleComplete: existingNode.data.onToggleComplete,
            hasPlan: !!task.task.plan,
        },
    } as Node;
};

const createEdge = (source: string, target: string) => {
    const edgeId = `${source}-${target}`;

    return {
        id: edgeId,
        source: source,
        target: target,
        type: EDGE_TYPE,
        animated: EDGE_ANIMATION,
        updatable: EDGE_UPDATABLE_HANDLE,
        markerEnd: {
            type: EDGE_MARKER_TYPE,
        },
    } as Edge;
};

export { createTaskNode, createTaskNodeFromExisting, createEdge };
