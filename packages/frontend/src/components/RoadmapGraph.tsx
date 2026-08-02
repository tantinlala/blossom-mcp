import { useCallback, useRef, useState, useEffect, useMemo, KeyboardEvent } from "react";
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Panel,
    useReactFlow,
    Edge,
    Node,
    useOnSelectionChange,
    useNodesInitialized,
    useUpdateNodeInternals,
    useStoreApi,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Breadcrumbs, Button, Link, Paper, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeMosaicIcon from "@mui/icons-material/AutoAwesomeMosaic";
import ChecklistIcon from "@mui/icons-material/Checklist";
import InboxIcon from "@mui/icons-material/Inbox";

import ContextMenu from "./ContextMenu";
import StatusLegend from "./StatusLegend";
import CanvasEmptyState from "./CanvasEmptyState";
import { getLayoutedElements } from "../utils/layouter";
import { createTaskNode, createTaskNodeFromExisting, createEdge } from "../utils/taskNodeUtils";
import { GOAL_ID, createGoalNode } from "../utils/goalNodeUtils";
import { TaskAndState, TaskState } from "../types/extendedTasks";
import { Dependency, Task } from "@blossom/common";
import { Roadmap } from "../types/roadmap";
import TaskNode, { EDGE_TYPE, EDGE_WIDTH_HIGHLIGHTED, DIMMED_OPACITY, Position } from "./TaskNode";
import { useGraphHighlight } from "../hooks/useGraphHighlight";
import { Direction, nextTaskInDirection } from "../utils/spatialNavigation";
import { PromptForText } from "../hooks/useTextPrompt";
import { palette } from "../theme/tokens";

// Menu position constants
const MENU_OFFSET_THRESHOLD = 200;

// Leaves a margin around the graph when fitting it into the viewport
const FIT_VIEW_PADDING = 0.15;

const UNNAMED_GOAL_LABEL = "Goal";

// Toolbars float over the canvas, so they need their own surface to stay legible.
const CANVAS_TOOLBAR_SX = {
    display: "flex",
    width: "fit-content",
    alignItems: "center",
    gap: 0.5,
    p: 0.5,
    border: 1,
    borderColor: "divider",
    borderRadius: 2,
    bgcolor: "background.paper",
    boxShadow: "0 1px 2px rgba(16, 24, 40, 0.06)",
} as const;

// A small button inside the toolbar's padding and border. The breadcrumb between
// the two toolbars matches it, so all three sit on one line across the canvas.
const CANVAS_TOOLBAR_HEIGHT = 41;

const ARROW_DIRECTIONS: Record<string, Direction> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
};

// Prompt strings
const TASK_PROMPT = { title: "Add a task", label: "Task name", defaultValue: "New Task", confirmLabel: "Add task" };
const GOAL_PROMPT = { title: "Name your goal", label: "Goal", defaultValue: "New Goal", confirmLabel: "Create goal" };

const NODE_TYPE_MAPPING = {
    customTaskNode: TaskNode,
};

/** Mirrors the node fills so the minimap reads as a shrunken copy of the graph. */
const miniMapNodeColor = (node: Node): string => {
    if (node.id === GOAL_ID) {
        return palette.goal.fill;
    }
    if (node.data?.taskState === TaskState.COMPLETED) {
        return palette.task.completed;
    }
    if (node.data?.taskState === TaskState.UNBLOCKED) {
        return palette.task.unblocked;
    }
    return palette.task.blocked;
};

/** Dimming lives on the node while a chain is traced, and belongs to no plan. */
const isDimmed = (node: Node): boolean => !!node.style && "opacity" in node.style;

/**
 * Whether a node already shows this task as the plan now describes it. A node
 * that does is handed back untouched, which is what lets ReactFlow go on using
 * everything it has measured for it, handle positions included.
 */
const showsTask = (node: Node, task: TaskAndState): boolean =>
    !isDimmed(node) &&
    node.data.label === task.task.name &&
    node.data.taskState === task.state &&
    node.data.completionState === task.task.completionState &&
    node.data.hasPlan === !!task.task.plan;

/** The goal node carries the plan's name and nothing else that can change. */
const showsGoal = (node: Node, goalName: string): boolean => !isDimmed(node) && node.data.label === goalName;

/**
 * ReactFlow's store holds whatever is on screen, dimming included. That is
 * presentation only, so it has to be stripped before anything is written back
 * as real state or the graph stays faded once the chain loses focus.
 */
const withoutDimming = (node: Node): Node => {
    if (!node.style || !("opacity" in node.style)) {
        return node;
    }
    const { opacity, ...style } = node.style;
    return { ...node, style };
};

interface RoadmapGraphProps {
    presentlyShownRoadmap: Roadmap;
    handleSetGoal: (goalName: string) => void;
    handleAddTask: (taskName: string) => Promise<Task | null>;
    handleRemoveTask: (taskId: string) => void;
    handleConnect: (source: string, target: string) => Promise<void>;
    handleUpdateEdge: (oldSource: string, oldTarget: string, newSource: string, newTarget: string) => void;
    handleRemoveEdge: (source: string, target: string) => Promise<void>;
    handleToggleComplete: (taskId: string) => void;
    handleChangeRoadmapContext: (taskId: string) => void;
    handleCreatePlanForTask: (taskId: string) => void;
    handleSelectTask: (taskId: string) => void;
    showTaskDetails: () => void;
    showNextTasks: () => void;
    toggleInbox: () => void;
    handlePaste: (tasks: Task[], dependencies: Dependency[]) => void;
    handleUndo: () => void;
    promptForText: PromptForText;
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
    toggleInbox,
    handlePaste,
    handleUndo,
    promptForText,
}) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNodes, setSelectedNodes] = useState([]);
    // The layouter needs the edges as they stand, from inside a node update that
    // cannot read them. A later set of edges brings a later layout with it.
    const edgesRef = useRef<Edge[]>(edges);
    edgesRef.current = edges;
    const nodesRef = useRef<Node[]>(nodes);
    nodesRef.current = nodes;
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [menu, setMenu] = useState(null as any);
    const ref = useRef(null);
    const pendingFitRef = useRef(false);
    // Set while a task is being added and wired up. See createTaskWithEdges.
    const layoutHeldRef = useRef(false);
    // Whether the graph is waiting on a layout, and a counter that asks whether it
    // can be done at a moment nothing else would have prompted the question.
    const layoutOwedRef = useRef(true);
    const [layoutRecheck, setLayoutRecheck] = useState(0);
    const { fitView } = useReactFlow();
    const updateNodeInternals = useUpdateNodeInternals();
    const storeApi = useStoreApi();
    const nodesInitialized = useNodesInitialized();

    /**
     * Rebuilds the graph from the plan every time the server sends one.
     *
     * A task already on the canvas keeps its own node object, which is what
     * carries its position and the size ReactFlow measured for it. A node handed
     * back without that size is treated as unmeasured and stays hidden, and
     * nothing re-measures it while its box on screen is unchanged - so the update
     * reads the nodes it is replacing, rather than a snapshot that a mutation
     * still in flight may already have moved past. Dimming is stripped on the way
     * through: it belongs to whatever chain is being traced right now, and baking
     * it into a node would leave it faded once the tracing stops.
     */
    useEffect(() => {
        const newEdges: Edge[] = presentlyShownRoadmap.dependenciesList.map((dependency: Dependency) =>
            createEdge(dependency.source, dependency.target),
        );

        setNodes((currentNodes: Node[]) => {
            const newNodes: Node[] = [];

            presentlyShownRoadmap.tasksList.forEach((task: TaskAndState) => {
                const existingNode = currentNodes.find((node) => node.id === task.task.id);

                if (task.task.id === GOAL_ID) {
                    if (!task.task.name) {
                        return;
                    }
                    if (existingNode && showsGoal(existingNode, task.task.name)) {
                        newNodes.push(existingNode);
                        return;
                    }
                    newNodes.push(
                        existingNode
                            ? { ...withoutDimming(existingNode), data: { ...existingNode.data, label: task.task.name } }
                            : createGoalNode(task.task.name),
                    );
                    return;
                }

                if (existingNode && showsTask(existingNode, task)) {
                    newNodes.push(existingNode);
                    return;
                }
                newNodes.push(
                    existingNode
                        ? createTaskNodeFromExisting(task, withoutDimming(existingNode))
                        : createTaskNode(task, { x: 0, y: 0 }, handleToggleComplete, false),
                );
            });

            return newNodes;
        });
        setEdges(newEdges);
    }, [presentlyShownRoadmap, setNodes, setEdges, handleToggleComplete]);

    /**
     * Keeps every task on the canvas measured.
     *
     * An edge is drawn from the handle positions ReactFlow took when it measured
     * the two tasks it runs between, so a task it has sized but never taken
     * handles for leaves its dependencies undrawn - and the layouter, reading the
     * same measurements, piles the graph into one corner. A task can land in that
     * state whenever the node objects are replaced faster than ReactFlow measures
     * them, which is what swapping plans does. Anything found without handle
     * positions goes back up for measurement.
     */
    useEffect(() => {
        const unmeasured: string[] = [];
        storeApi.getState().nodeLookup.forEach((node, id) => {
            if (!node.internals.handleBounds) {
                unmeasured.push(id);
            }
        });

        if (unmeasured.length > 0) {
            updateNodeInternals(unmeasured);
        }
    }, [nodes, edges, storeApi, updateNodeInternals]);

    /**
     * A tab the browser is not drawing gets no measurements, so a plan that
     * arrives while the tab is in the background leaves ReactFlow holding nodes
     * whose size and handle positions it never took. Edges have nowhere to
     * attach and the layouter has no boxes to place, which is what a graph piled
     * up in one corner with nothing joining it means. Coming back to the tab
     * puts every node up for measurement again, and the sizes that land bring a
     * fresh layout with them.
     */
    useEffect(() => {
        const remeasureWhenVisible = () => {
            if (document.visibilityState !== "visible") {
                return;
            }
            updateNodeInternals(nodesRef.current.map((node) => node.id));
        };

        document.addEventListener("visibilitychange", remeasureWhenVisible);
        return () => document.removeEventListener("visibilitychange", remeasureWhenVisible);
    }, [updateNodeInternals]);

    // When the user connects two nodes, call a callback to add the edge to the
    // plan. Nothing here waits on the round trip: the edge arrives with the plan
    // the server sends back, and a refusal is reported from the APIClient.
    const onConnect = useCallback(
        (newConnection) => {
            void handleConnect(newConnection.source, newConnection.target);
        },
        [handleConnect],
    );

    const showDetails = useCallback(
        (taskId: string) => {
            handleSelectTask(taskId);
            toggleTaskDetails();
        },
        [handleSelectTask, toggleTaskDetails],
    );

    // Hover and selection refer to the plan being left behind, and the ids in
    // them do not exist in the plan being entered.
    const changeContext = useCallback(
        (taskId: string) => {
            setHoveredNodeId(null);
            setSelectedNodes([]);
            handleChangeRoadmapContext(taskId);
        },
        [handleChangeRoadmapContext],
    );

    const onNodeContextMenu = useCallback(
        (event, node: Node) => {
            // Prevent native context menu from showing
            event.preventDefault();

            const taskEntry = presentlyShownRoadmap.tasksList.find((entry) => entry.task.id === node.id);

            // The goal node is the plan itself - it can neither be nested nor removed
            let createPlanForTaskCallback = null;
            let openSubplanCallback = null;
            let deleteCallback = null;
            if (node.id !== GOAL_ID) {
                deleteCallback = handleRemoveTask;
                // A task holds at most one subplan, so offering to add a second
                // would be an action the backend quietly ignores. Offer the way
                // into the existing one instead.
                if (taskEntry?.task.plan) {
                    openSubplanCallback = changeContext;
                } else {
                    createPlanForTaskCallback = handleCreatePlanForTask;
                }
            }

            let currentRef: any = ref.current;
            const pane = currentRef.getBoundingClientRect();
            // The menu is absolutely positioned inside the pane, so the click's
            // viewport coordinates have to be made pane-relative first.
            const x = event.clientX - pane.left;
            const y = event.clientY - pane.top;

            setMenu({
                createPlanForTaskCallback,
                openSubplanCallback,
                deleteCallback,
                showDetailsCallback: showDetails,
                name: taskEntry?.task.name ?? UNNAMED_GOAL_LABEL,
                id: node.id,
                top: y < pane.height - MENU_OFFSET_THRESHOLD ? y : undefined,
                left: x < pane.width - MENU_OFFSET_THRESHOLD ? x : undefined,
                right: x >= pane.width - MENU_OFFSET_THRESHOLD ? pane.width - x : undefined,
                bottom: y >= pane.height - MENU_OFFSET_THRESHOLD ? pane.height - y : undefined,
            });
        },
        [handleCreatePlanForTask, handleRemoveTask, presentlyShownRoadmap, showDetails, changeContext],
    );

    // Close the context menu if it's open whenever the window is clicked.
    const onPaneClick = useCallback(() => setMenu(null), [setMenu]);

    // The menu is anchored to a node, so leaving it up while a panel opens over
    // the canvas strands it on screen.
    const onToggleNextTasks = useCallback(() => {
        setMenu(null);
        toggleNextTaskDrawer();
    }, [toggleNextTaskDrawer]);

    const onReconnect = useCallback(
        (oldConnection, newConnection) => {
            handleUpdateEdge(oldConnection.source, oldConnection.target, newConnection.source, newConnection.target);
        },
        [handleUpdateEdge],
    );

    /**
     * Moves every node to where the layouter puts it.
     *
     * Positions are all it changes. It works from the nodes it is handed rather
     * than a copy taken earlier, so a plan arriving in the same pass - a task
     * that has just become blocked, say - keeps the state it brought with it and
     * only picks up new coordinates. Only the edges settle a task's place, so a
     * later edge produces a later layout, which lands on top of this one.
     */
    const onLayout = useCallback(() => {
        setNodes((currentNodes) => {
            const { nodes: layoutedNodes } = getLayoutedElements(currentNodes, edgesRef.current);
            return layoutedNodes.map(withoutDimming);
        });

        // Laying out moves nodes out from under a stationary cursor without ever
        // firing mouse-leave, which would strand the highlight and leave the
        // graph dimmed until the user happened to move the mouse.
        setHoveredNodeId(null);
    }, [setNodes]);

    // What the layouter actually reads: which tasks are on the canvas, how big
    // each one turned out to be, and what joins them. Positions are left out, so
    // a layout run - which only moves nodes - never asks for another.
    const graphShape = useMemo(() => {
        const nodeIds = nodes
            .map((node) => `${node.id}@${node.measured?.width ?? 0}x${node.measured?.height ?? 0}`)
            .sort()
            .join(",");
        const edgeIds = edges
            .map((edge) => `${edge.source}>${edge.target}`)
            .sort()
            .join(",");
        return `${nodeIds}|${edgeIds}`;
    }, [nodes, edges]);

    // Every shape the graph takes owes itself a layout, because where a task sits
    // is decided by what it connects to: a task and its dependencies arrive in
    // separate round trips, so the edge that settles its position can land a beat
    // after the task itself.
    useEffect(() => {
        layoutOwedRef.current = true;
    }, [graphShape]);

    /**
     * Lays the graph out once whatever is owed can actually be done.
     *
     * A layout waits on the tasks having been measured, and on nothing holding it
     * off. Both pass in their own time, so what is owed is remembered until it
     * can be paid rather than being dropped - and paying it clears the debt, so a
     * shape that has been laid out is not laid out again while a task is dragged
     * or picked out.
     */
    useEffect(() => {
        if (!nodesInitialized || layoutHeldRef.current || !layoutOwedRef.current) {
            return;
        }
        layoutOwedRef.current = false;
        onLayout();
        pendingFitRef.current = true;
    }, [nodesInitialized, graphShape, layoutRecheck, onLayout]);

    // Laying out moves every node, so the viewport has to be refitted or the graph
    // ends up parked off-screen. This has to wait for the laid-out positions to
    // reach ReactFlow's store, which happens in its effects - and those run before
    // ours, so reading `nodes` here means the store is already in sync.
    useEffect(() => {
        if (!pendingFitRef.current || nodes.length === 0) {
            return;
        }
        pendingFitRef.current = false;
        fitView({ padding: FIT_VIEW_PADDING });
    }, [nodes, fitView]);

    const onNodeClick = useCallback(
        (event, node: Node) => {
            if (node.id !== GOAL_ID) {
                handleSelectTask(node.id);
            }
        },
        [handleSelectTask],
    );

    /** Drops the highlight, leaving the graph with nothing picked out. */
    const clearHighlight = useCallback(() => {
        setNodes((currentNodes) => currentNodes.map((node) => (node.selected ? { ...node, selected: false } : node)));
        setSelectedNodes([]);
    }, [setNodes]);

    /**
     * Moves the highlight to the task lying that way across the canvas, leaving
     * it where it is when there is nothing that way. Node positions are centres
     * here, since the graph places nodes by their middle.
     */
    const selectNeighbour = useCallback(
        (direction: Direction) => {
            const points = nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }));
            const nextId = nextTaskInDirection(points, selectedNodes.length === 1 ? selectedNodes[0] : null, direction);
            if (!nextId) {
                return;
            }

            setNodes((currentNodes) => currentNodes.map((node) => ({ ...node, selected: node.id === nextId })));
            // Arriving by keyboard says as much about which task is being worked
            // on as clicking it does, so the details panel follows either way.
            if (nextId !== GOAL_ID) {
                handleSelectTask(nextId);
            }
        },
        [nodes, selectedNodes, setNodes, handleSelectTask],
    );

    const onNodeDoubleClick = useCallback(
        (event, node: Node) => {
            if (node.id !== GOAL_ID) {
                changeContext(node.id);
            }
        },
        [changeContext],
    );

    const onCreateTask = useCallback(async (): Promise<Task | null> => {
        const taskLabel = await promptForText(TASK_PROMPT);
        if (!taskLabel) {
            return null;
        }
        return await handleAddTask(taskLabel);
    }, [handleAddTask, promptForText]);

    const onCreateGoal = useCallback(async () => {
        const goalLabel = await promptForText(GOAL_PROMPT);
        if (!goalLabel) {
            return;
        }
        handleSetGoal(goalLabel);
    }, [handleSetGoal, promptForText]);

    /**
     * Adds a task and wires it into the plan.
     *
     * The task and each of its dependencies are separate round trips, so in
     * between them the task is on the canvas with nothing attached to it. Laying
     * out is held off until `wireUp` has finished, so the task is placed once,
     * from where its edges say it belongs. Whatever shape the graph reached in
     * the meantime is put back up for a layout as the hold ends.
     */
    const createTaskWithEdges = useCallback(
        async (wireUp: (task: Task) => Promise<void>) => {
            layoutHeldRef.current = true;
            try {
                const newTask = await onCreateTask();
                if (!newTask) {
                    return;
                }
                await wireUp(newTask);
            } finally {
                layoutHeldRef.current = false;
                setLayoutRecheck((count) => count + 1);
            }
        },
        [onCreateTask],
    );

    // Dragging out of a handle and letting go over empty canvas makes a task and
    // joins it to the one it was dragged from, the way round the handle implies.
    const onConnectEnd = useCallback(
        async (event, connectionState) => {
            // when a connection is dropped on the pane it's not valid
            if (connectionState.isValid) {
                return;
            }

            const draggedFromId = connectionState.fromNode.id;
            if (connectionState.fromPosition === Position.Right) {
                await createTaskWithEdges((newTask) => handleConnect(draggedFromId, newTask.id));
            } else if (connectionState.fromPosition === Position.Left) {
                await createTaskWithEdges((newTask) => handleConnect(newTask.id, draggedFromId));
            }
        },
        [createTaskWithEdges, handleConnect],
    );

    const onCrumbClick = useCallback(
        (taskId: string) => () => {
            changeContext(taskId);
        },
        [changeContext],
    );

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
                    void handleRemoveEdge(edge.source, edge.target);
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

            // Escape: put the highlight down
            if (event.key === "Escape") {
                event.preventDefault();
                clearHighlight();
                return;
            }

            // Arrow keys: move the highlight to the task that way across the canvas
            const direction = ARROW_DIRECTIONS[event.key];
            if (direction) {
                event.preventDefault();
                selectNeighbour(direction);
                return;
            }

            if (selectedNodes.length === 1) {
                const selectedNodeId = selectedNodes[0];
                const selectedNode = nodes.find((node) => node.id === selectedNodeId);

                if (!selectedNode) return;

                // Enter: open the highlighted task's subplan, or tick it off when
                // it holds no plan of its own. The goal is neither nested nor
                // something to complete, so it takes no part in either.
                if (event.key === "Enter") {
                    event.preventDefault();
                    const taskEntry = presentlyShownRoadmap.tasksList.find((entry) => entry.task.id === selectedNodeId);
                    if (selectedNodeId === GOAL_ID || !taskEntry) {
                        return;
                    }
                    if (taskEntry.task.plan) {
                        changeContext(selectedNodeId);
                    } else {
                        handleToggleComplete(selectedNodeId);
                    }
                    return;
                }

                // Tab or Space key handling for creating a new task
                if (event.key === "Tab" || event.key === " ") {
                    event.preventDefault();

                    const feedsIntoSelection = event.key === "Tab";
                    await createTaskWithEdges((newTask) =>
                        feedsIntoSelection
                            ? handleConnect(newTask.id, selectedNodeId)
                            : handleConnect(selectedNodeId, newTask.id),
                    );
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
                        await createTaskWithEdges(async (newTask) => {
                            await handleRemoveEdge(sourceId, targetId);
                            await handleConnect(sourceId, newTask.id);
                            await handleConnect(newTask.id, targetId);
                        });
                    }
                }
            }
        },
        [
            selectedNodes,
            nodes,
            edges,
            presentlyShownRoadmap,
            createTaskWithEdges,
            selectNeighbour,
            clearHighlight,
            changeContext,
            handleToggleComplete,
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

    const onNodeMouseEnter = useCallback((event, node: Node) => setHoveredNodeId(node.id), []);
    const onNodeMouseLeave = useCallback(() => setHoveredNodeId(null), []);

    // Hovering is the quick, throwaway way to trace a chain; selecting keeps it
    // traced while you work. Selecting several nodes traces nothing.
    const focusedNodeId = useMemo(() => {
        const candidate = hoveredNodeId ?? (selectedNodes.length === 1 ? selectedNodes[0] : null);
        if (!candidate) {
            return null;
        }
        // A focus on a task that is no longer on screen - deleted, or left
        // behind by a drill-down - would match nothing and dim the whole graph.
        return nodes.some((node) => node.id === candidate) ? candidate : null;
    }, [hoveredNodeId, selectedNodes, nodes]);

    const highlight = useGraphHighlight(edges, focusedNodeId);

    // An unconnected task has no chain to pick out, so dimming would just blank
    // the graph and tell the user nothing.
    const isTracingChain = focusedNodeId !== null && highlight.edgeIds.size > 0;

    // Dimming is applied to copies so it never becomes part of the real state
    const displayNodes = useMemo(() => {
        if (!isTracingChain) {
            return nodes;
        }
        return nodes.map((node) =>
            highlight.nodeIds.has(node.id) ? node : { ...node, style: { ...node.style, opacity: DIMMED_OPACITY } },
        );
    }, [nodes, highlight, isTracingChain]);

    const displayEdges = useMemo(() => {
        if (!isTracingChain) {
            return edges;
        }
        return edges.map((edge) =>
            highlight.edgeIds.has(edge.id)
                ? {
                      ...edge,
                      style: {
                          ...edge.style,
                          stroke: palette.edge.highlighted,
                          strokeWidth: EDGE_WIDTH_HIGHLIGHTED,
                      },
                      markerEnd: { ...(edge.markerEnd as object), color: palette.edge.highlighted },
                      zIndex: 1,
                  }
                : { ...edge, style: { ...edge.style, opacity: DIMMED_OPACITY } },
        );
    }, [edges, highlight, isTracingChain]);

    return (
        <ReactFlow
            ref={ref}
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onReconnect={onReconnect}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onPaneClick={onPaneClick}
            onNodeContextMenu={onNodeContextMenu}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            // Keyboard work is driven from the pane, which owns the shortcuts and
            // reads the selection. Leaving nodes out of the focus order keeps them
            // from taking focus off a dialog opened by one of those shortcuts.
            nodesFocusable={false}
            edgesFocusable={false}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            deleteKeyCode={null}
            // Double-click is the drill-into-subplan gesture, so the default
            // double-click-to-zoom would fire at the same time and fight it
            zoomOnDoubleClick={false}
            connectionLineType={EDGE_TYPE}
            nodeTypes={NODE_TYPE_MAPPING}
            nodeOrigin={[0.5, 0.5]}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            fitView
        >
            <Background />
            <Controls />
            <MiniMap pannable zoomable nodeColor={miniMapNodeColor} nodeStrokeWidth={0} />
            <Panel position="top-left">
                <Paper elevation={0} sx={CANVAS_TOOLBAR_SX}>
                    {goalNodeExists ? (
                        <Button size="small" startIcon={<AddIcon />} onClick={onCreateTask}>
                            Add Task
                        </Button>
                    ) : (
                        <Button size="small" startIcon={<AddIcon />} onClick={onCreateGoal}>
                            Add Goal
                        </Button>
                    )}
                    {goalNodeExists && (
                        <Button size="small" startIcon={<AutoAwesomeMosaicIcon />} onClick={() => onLayout()}>
                            Autoformat
                        </Button>
                    )}
                </Paper>
            </Panel>
            {/* The gap between the two toolbars, so the path is read as belonging to
                the canvas as a whole and grows in both directions from the centre */}
            {presentlyShownRoadmap.ancestors.length > 0 && (
                <Panel position="top-center">
                    <Breadcrumbs
                        aria-label="plan location"
                        data-testid="plan-breadcrumbs"
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            minHeight: CANVAS_TOOLBAR_HEIGHT,
                            fontSize: 13,
                            color: "text.secondary",
                        }}
                    >
                        {presentlyShownRoadmap.ancestors.map((crumb, index) => {
                            const label = crumb.name || UNNAMED_GOAL_LABEL;
                            const isCurrent = index === presentlyShownRoadmap.ancestors.length - 1;
                            return isCurrent ? (
                                <Typography key={crumb.id} color="text.primary" sx={{ fontSize: "inherit" }}>
                                    {label}
                                </Typography>
                            ) : (
                                <Link
                                    key={crumb.id}
                                    component="button"
                                    underline="hover"
                                    color="inherit"
                                    onClick={onCrumbClick(crumb.id)}
                                    sx={{ fontSize: "inherit", fontFamily: "inherit" }}
                                >
                                    {label}
                                </Link>
                            );
                        })}
                    </Breadcrumbs>
                </Panel>
            )}
            {/* Both toggle the single panel slot beside the canvas */}
            <Panel position="top-right">
                <Paper elevation={0} sx={CANVAS_TOOLBAR_SX}>
                    <Button size="small" startIcon={<ChecklistIcon />} onClick={onToggleNextTasks}>
                        Next Tasks List
                    </Button>
                    <Button size="small" startIcon={<InboxIcon />} onClick={toggleInbox}>
                        Inbox
                    </Button>
                </Paper>
            </Panel>
            {/* Bottom-centre keeps it clear of the zoom controls and the minimap */}
            {goalNodeExists && (
                <Panel position="bottom-center">
                    <StatusLegend />
                </Panel>
            )}
            {!goalNodeExists && (
                <Panel position="top-center" style={{ top: "35%" }}>
                    <CanvasEmptyState onCreateGoal={onCreateGoal} />
                </Panel>
            )}
            {menu && <ContextMenu onClick={onPaneClick} {...menu} />}
        </ReactFlow>
    );
};

export default RoadmapGraph;
