import { TaskState, TaskAndStateAndBlockers } from "./extendedTasks";

export const updateTaskStates = (currentNodeID: string, allNodes: TaskAndStateAndBlockers[]): TaskState => {
    // Find task in tasks that matches id
    let currentNode = allNodes.find((node) => node.task.id === currentNodeID);
    if (!currentNode) {
        return TaskState.COMPLETED;
    }

    let allAncestorsCompleted = true;
    currentNode.blockerIDs.forEach((blockerID) => {
        const blockingNode = allNodes.find((node) => node.task.id === blockerID);

        // If predecessor task doesn't exist, treat it as completed
        let blockingNodeState = TaskState.COMPLETED;

        // Only process the predecessor if it exists
        if (blockingNode) {
            blockingNodeState = blockingNode.state;
            if (blockingNodeState === TaskState.UNDETERMINED) {
                blockingNodeState = updateTaskStates(blockerID, allNodes);
            }
        }

        allAncestorsCompleted = blockingNodeState === TaskState.COMPLETED && allAncestorsCompleted;
    });

    if (allAncestorsCompleted) {
        if (currentNode.task.completionState === false) {
            currentNode.state = TaskState.UNBLOCKED;
        } else {
            currentNode.state = TaskState.COMPLETED;
        }
    } else {
        currentNode.state = TaskState.BLOCKED;
    }

    return currentNode.state;
};
