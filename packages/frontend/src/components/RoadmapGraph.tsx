import { useCallback, useRef, useState, useEffect, useMemo, KeyboardEvent } from "react";
import {
    ReactFlow,
    Background,
    useNodesState,
    useEdgesState,
    Panel,
    useReactFlow,
    Edge,
    Node,
    useOnSelectionChange,
    useNodesInitialized,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import ContextMenu from "./ContextMenu";
import { getLayoutedElements } from "../utils/layouter";
import { createTaskNode, createTaskNodeFromExisting, createEdge } from "../utils/taskNodeUtils";
import { GOAL_ID, createGoalNode } from "../utils/goalNodeUtils";
import { TaskAndState } from "../types/extendedTasks";
import { Dependency, Task } from "@blossom/common";
import { Roadmap } from "../types/roadmap";
import TaskNode, { NODE_HALF_WIDTH, EDGE_TYPE, Position } from "./TaskNode";

// Menu position constants
const MENU_OFFSET_THRESHOLD = 200;

// Prompt strings
const TASK_NAME_PROMPT = "Task Name";
const NEW_TASK_DEFAULT = "New Task";
const GOAL_NAME_PROMPT = "Goal Name";
const NEW_GOAL_DEFAULT = "New Goal";

const NODE_TYPE_MAPPING = {
    customTaskNode: TaskNode,
};

interface RoadmapGraphProps {
    presentlyShownRoadmap: Roadmap;
    handleSetGoal: (goalName: string) => void;
    handleAddTask: (taskName: string) => Promise<Task | null>;
    handleRemoveTask: (taskId: string) => void;
    handleConnect: (source: string, target: string) => void;
    handleUpdateEdge: (oldSource: string, oldTarget: string, newSource: string, newTarget: string) => void;
    handleRemoveEdge: (source: string, target: string) => void;
    handleToggleComplete: (taskId: string) => void;
    handleChangeRoadmapContext: (taskId: string) => void;
    handleCreatePlanForTask: (taskId: string) => void;
    handleSelectTask: (taskId: string) => void;
    showTaskDetails: () => void;
    showNextTasks: () => void;
    handlePaste: (tasks: Task[], dependencies: Dependency[]) => void;
    handleUndo: () => void;
}

const RoadmapGraph: React.FC<RoadmapGraphProps> = ({
    presentlyShownRoadmap,
    handleSetGoal,
    handleAddTask,
    handleRemoveTask,
    handleConnect,
    handleUpdateEdge,
    handleRemoveEdge,
    handleToggleComplete,
    handleChangeRoadmapContext,
    handleCreatePlanForTask,
    handleSelectTask,
    showTaskDetails: toggleTaskDetails,
    showNextTasks: toggleNextTaskDrawer,
    handlePaste,
    handleUndo,
}) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNodes, setSelectedNodes] = useState([]);
    const [menu, setMenu] = useState(null as any);
    const ref = useRef(null);
    const { getNodes, getEdges, screenToFlowPosition } = useReactFlow();
    const nodesInitialized = useNodesInitialized();

    // Go through presently shown plan update the nodes and edges
    useEffect(() => {
        let newEdges: Edge[] = [];
        presentlyShownRoadmap.dependenciesList.forEach((dependency: Dependency) => {
            let newEdge = createEdge(dependency.source, dependency.target);
            newEdges.push(newEdge);
        });

        let newNodes: Node[] = [];
        let existingNodes: Node[] = getNodes();

        presentlyShownRoadmap.tasksList.forEach((task: TaskAndState) => {
            if (task.task.id === GOAL_ID && task.task.name) {
                let goalNode = createGoalNode(task.task.name);
                newNodes.push(goalNode);
                return;
            }

            const existingNode = existingNodes.find((node) => node.id === task.task.id);
            if (existingNode) {
                // Update existing node
                const updatedNode = createTaskNodeFromExisting(task, existingNode);
                newNodes.push(updatedNode);
            } else {
                let newTaskNode = createTaskNode(task, { x: 0, y: 0 }, handleToggleComplete, false);
                newNodes.push(newTaskNode);
            }
        });

        setNodes(newNodes);
        setEdges(newEdges);
    }, [presentlyShownRoadmap, getNodes, setNodes, setEdges, handleToggleComplete]);

    // When the user connects two nodes, call a callback to add the edge to the plan
    const onConnect = useCallback(
        (newConnection) => {
            handleConnect(newConnection.source, newConnection.target);
        },
        [handleConnect],
    );

    const onConnectEnd = useCallback(
        async (event, connectionState) => {
            // when a connection is dropped on the pane it's not valid
            if (connectionState.isValid) {
                return;
            }

            // Connection dropped on the pane
            const taskLabel = window.prompt(TASK_NAME_PROMPT, NEW_TASK_DEFAULT);
            if (!taskLabel) {
                return;
            }

            const newTask: Task | null = await handleAddTask(taskLabel);
            if (!newTask) {
                return;
            }

            // we need to remove the wrapper bounds, in order to get the correct position
            const { clientX, clientY } = "changedTouches" in event ? event.changedTouches[0] : event;

            // Calculate position for the new node
            const dropPosition = screenToFlowPosition({ x: clientX, y: clientY });

            // Adjust position based on where the connection is coming from
            let adjustedPosition = { ...dropPosition };
            if (connectionState.fromPosition === Position.Right) {
                // Connection from right handle, so adjust X to place the left handle at the drop point
                adjustedPosition.x += NODE_HALF_WIDTH;
            } else if (connectionState.fromPosition === Position.Left) {
                // Connection from left handle, so adjust X to place the right handle at the drop point
                adjustedPosition.x -= NODE_HALF_WIDTH;
            }

            if (connectionState.fromPosition === Position.Right) {
                const sourceId = connectionState.fromNode.id;
                const targetId = newTask.id;
                handleConnect(sourceId, targetId);
            } else if (connectionState.fromPosition === Position.Left) {
                const sourceId = newTask.id;
                const targetId = connectionState.fromNode.id;
                handleConnect(sourceId, targetId);
            }
        },
        [screenToFlowPosition, handleAddTask, handleConnect],
    );

    const showDetails = useCallback(
        (taskId: string) => {
            handleSelectTask(taskId);
            toggleTaskDetails();
        },
        [handleSelectTask, toggleTaskDetails],
    );

    const onNodeContextMenu = useCallback(
        (event, node: Node) => {
            // Prevent native context menu from showing
            event.preventDefault();

            let createPlanForTaskCallback = null;
            if (node.id !== GOAL_ID) {
                createPlanForTaskCallback = handleCreatePlanForTask;
            }

            let currentRef: any = ref.current;
            const pane = currentRef.getBoundingClientRect();
            // The menu is absolutely positioned inside the pane, so the click's
            // viewport coordinates have to be made pane-relative first.
            const x = event.clientX - pane.left;
            const y = event.clientY - pane.top;

            setMenu({
                createPlanForTaskCallback,
                showDetailsCallback: showDetails,
                id: node.id,
                top: y < pane.height - MENU_OFFSET_THRESHOLD ? y : undefined,
                left: x < pane.width - MENU_OFFSET_THRESHOLD ? x : undefined,
                right: x >= pane.width - MENU_OFFSET_THRESHOLD ? pane.width - x : undefined,
                bottom: y >= pane.height - MENU_OFFSET_THRESHOLD ? pane.height - y : undefined,
            });
        },
        [handleCreatePlanForTask, showDetails],
    );

    // Close the context menu if it's open whenever the window is clicked.
    const onPaneClick = useCallback(() => setMenu(null), [setMenu]);

    const onReconnect = useCallback(
        (oldConnection, newConnection) => {
            handleUpdateEdge(oldConnection.source, oldConnection.target, newConnection.source, newConnection.target);
        },
        [handleUpdateEdge],
    );

    const onLayout = useCallback(() => {
        // Make sure we're working with the latest nodes and edges
        const currentNodes = getNodes();
        const currentEdges = getEdges();

        // Get the layouted elements
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(currentNodes, currentEdges);

        // Force a re-render by setting completely new nodes and edges arrays
        setNodes([...layoutedNodes]);
        setEdges([...layoutedEdges]);
    }, [getNodes, getEdges, setNodes, setEdges]);

    useEffect(() => {
        // Only run this effect when nodes are initialized
        if (nodesInitialized) {
            onLayout();
        }
    }, [nodesInitialized, onLayout]);

    const onNodeClick = useCallback(
        (event, node: Node) => {
            if (node.id !== GOAL_ID) {
                handleSelectTask(node.id);
            }
        },
        [handleSelectTask],
    );

    const onNodeDoubleClick = useCallback(
        (event, node: Node) => {
            if (node.id !== GOAL_ID) {
                handleChangeRoadmapContext(node.id);
            }
        },
        [handleChangeRoadmapContext],
    );

    const onCreateTask = useCallback(async (): Promise<Task | null> => {
        const taskLabel = window.prompt(TASK_NAME_PROMPT, NEW_TASK_DEFAULT);
        if (!taskLabel) {
            return null;
        }
        return await handleAddTask(taskLabel);
    }, [handleAddTask]);

    const onCreateGoal = useCallback(() => {
        const goalLabel = window.prompt(GOAL_NAME_PROMPT, NEW_GOAL_DEFAULT);
        if (!goalLabel) {
            return;
        }
        handleSetGoal(goalLabel);
    }, [handleSetGoal]);

    const onBack = useCallback(() => {
        handleChangeRoadmapContext(GOAL_ID);
    }, [handleChangeRoadmapContext]);

    // Find connecting edge between two selected nodes
    const findConnectingEdge = useCallback(
        (sourceId: string, targetId: string): Edge | undefined => {
            return edges.find((edge) => edge.source === sourceId && edge.target === targetId);
        },
        [edges],
    );

    const handleCopy = useCallback(async () => {
        if (selectedNodes.length === 0) return;

        const tasksToCopy: Task[] = [];
        const dependenciesToCopy: Dependency[] = [];

        // 1. Identify selected tasks
        selectedNodes.forEach((nodeId) => {
            if (nodeId === GOAL_ID) return; // Don't copy the goal node

            // Find the task in the presently shown roadmap
            // Note: presentlyShownRoadmap.tasksList contains TaskAndState objects
            const taskAndState = presentlyShownRoadmap.tasksList.find((t) => t.task.id === nodeId);
            if (taskAndState) {
                tasksToCopy.push(taskAndState.task);
            }
        });

        if (tasksToCopy.length === 0) return;

        // 2. Identify dependencies between selected tasks
        presentlyShownRoadmap.dependenciesList.forEach((dep) => {
            if (selectedNodes.includes(dep.source) && selectedNodes.includes(dep.target)) {
                dependenciesToCopy.push(dep);
            }
        });

        // 3. Write to clipboard
        const clipboardData = {
            tasks: tasksToCopy,
            dependencies: dependenciesToCopy,
        };

        try {
            await navigator.clipboard.writeText(JSON.stringify(clipboardData));
        } catch (err) {
            console.error("Failed to copy to clipboard:", err);
            throw err; // Propagate error so handleCut can detect failure
        }
    }, [selectedNodes, presentlyShownRoadmap]);

    const handleCut = useCallback(async () => {
        try {
            await handleCopy();

            // Delete selected nodes only if copy succeeded
            selectedNodes.forEach((nodeId) => {
                if (nodeId !== GOAL_ID) {
                    handleRemoveTask(nodeId);
                }
            });
            // Also clear selection
            setSelectedNodes([]);
        } catch (err) {
            console.error("Cut operation failed:", err);
            // Don't delete nodes if copy failed
        }
    }, [handleCopy, handleRemoveTask, selectedNodes, setSelectedNodes]);

    const handlePasteAction = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;

            const data = JSON.parse(text);
            if (data && Array.isArray(data.tasks) && Array.isArray(data.dependencies)) {
                handlePaste(data.tasks, data.dependencies);
            } else {
                console.error("Clipboard data is invalid or malformed. Paste aborted.");
            }
        } catch (err) {
            console.error("Failed to paste from clipboard:", err);
        }
    }, [handlePaste]);

    // Handle keyboard events for copy/cut/paste and task creation
    const handleKeyDown = useCallback(
        async (event: KeyboardEvent<HTMLDivElement>) => {
            // Undo: Ctrl+Z or Cmd+Z
            if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
                event.preventDefault();
                handleUndo();
                return;
            }

            // Delete/Backspace: handle ourselves to avoid ReactFlow's internal delete racing with undo
            if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();

                // Delete selected edges
                const selectedEdgesList = edges.filter((edge) => edge.selected);
                selectedEdgesList.forEach((edge) => {
                    handleRemoveEdge(edge.source, edge.target);
                });

                // Delete selected nodes
                selectedNodes.forEach((nodeId) => {
                    if (nodeId !== GOAL_ID) {
                        handleRemoveTask(nodeId);
                    }
                });
                setSelectedNodes([]);

                // Refocus the ReactFlow pane so keyboard shortcuts (e.g. Ctrl+Z) still work
                ref.current?.focus();
                return;
            }

            // Copy: Ctrl+C or Cmd+C
            if ((event.ctrlKey || event.metaKey) && event.key === "c") {
                event.preventDefault();
                handleCopy();
                return;
            }

            // Cut: Ctrl+X or Cmd+X
            if ((event.ctrlKey || event.metaKey) && event.key === "x") {
                event.preventDefault();
                handleCut();
                return;
            }

            // Paste: Ctrl+V or Cmd+V
            if ((event.ctrlKey || event.metaKey) && event.key === "v") {
                event.preventDefault();
                handlePasteAction();
                return;
            }

            if (selectedNodes.length === 1) {
                const selectedNodeId = selectedNodes[0];
                const selectedNode = nodes.find((node) => node.id === selectedNodeId);

                if (!selectedNode) return;

                // Tab or Space key handling for creating a new task
                if (event.key === "Tab" || event.key === " ") {
                    event.preventDefault();

                    const newTask = await onCreateTask();
                    if (!newTask) return;

                    if (event.key === "Tab") {
                        handleConnect(newTask.id, selectedNodeId);
                    } else if (event.key === " ") {
                        handleConnect(selectedNodeId, newTask.id);
                    }
                }
            } else if (selectedNodes.length === 2 && (event.key === "Tab" || event.key === " ")) {
                event.preventDefault();

                const nodeId1 = selectedNodes[0];
                const nodeId2 = selectedNodes[1];

                const edge = findConnectingEdge(nodeId1, nodeId2) || findConnectingEdge(nodeId2, nodeId1);

                if (edge) {
                    const sourceId = edge.source;
                    const targetId = edge.target;
                    const sourceNode = nodes.find((node) => node.id === sourceId);
                    const targetNode = nodes.find((node) => node.id === targetId);

                    if (sourceNode && targetNode) {
                        const newTask = await onCreateTask();
                        if (!newTask) return;

                        handleRemoveEdge(sourceId, targetId);
                        handleConnect(sourceId, newTask.id);
                        handleConnect(newTask.id, targetId);
                    }
                }
            }
        },
        [
            selectedNodes,
            nodes,
            edges,
            onCreateTask,
            handleConnect,
            handleRemoveTask,
            handleRemoveEdge,
            findConnectingEdge,
            handleCopy,
            handleCut,
            handlePasteAction,
            handleUndo,
        ],
    );

    // the passed handler has to be memoized, otherwise the hook will not work correctly
    const onChange = useCallback(({ nodes, edges }) => {
        setSelectedNodes(nodes.map((node: Node) => node.id));
    }, []);

    useOnSelectionChange({
        onChange,
    });

    let goalNodeExists = useMemo(() => nodes.find((node) => node.id === GOAL_ID), [nodes]);

    return (
        <ReactFlow
            ref={ref}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onReconnect={onReconnect}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onPaneClick={onPaneClick}
            onNodeContextMenu={onNodeContextMenu}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            deleteKeyCode={null}
            connectionLineType={EDGE_TYPE}
            nodeTypes={NODE_TYPE_MAPPING}
            nodeOrigin={[0.5, 0.5]}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            fitView
        >
            <Background />
            <Panel position="top-left">
                {goalNodeExists ? (
                    <button onClick={onCreateTask}>Add Task</button>
                ) : (
                    <button onClick={onCreateGoal}>Add Goal</button>
                )}
                {goalNodeExists && <button onClick={() => onLayout()}>Autoformat</button>}
                {presentlyShownRoadmap.isSubplan && <button onClick={onBack}>Back To Top Level</button>}
            </Panel>
            <Panel position="top-right">
                <button onClick={toggleNextTaskDrawer}>Next Tasks List</button>
            </Panel>
            {menu && <ContextMenu onClick={onPaneClick} {...menu} />}
        </ReactFlow>
    );
};

export default RoadmapGraph;
