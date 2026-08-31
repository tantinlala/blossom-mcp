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
import FlagIcon from "@mui/icons-material/Flag";
import InboxIcon from "@mui/icons-material/Inbox";

import ContextMenu from "./ContextMenu";
import StatusLegend from "./StatusLegend";
import CanvasEmptyState from "./CanvasEmptyState";
import BoardEmptyState from "./BoardEmptyState";
import { getLayoutedElements } from "../utils/layouter";
import { createTaskNode, createTaskNodeFromExisting, createEdge } from "../utils/taskNodeUtils";
import { createGoalNode, laneNodeId, parseGoalNodeId } from "../utils/goalNodeUtils";
import { TaskAndState, TaskState } from "../types/extendedTasks";
import { Dependency, GOAL_ID, Task } from "@blossom/common";
import { Board, BoardLane, TaskRef } from "../types/roadmap";
import TaskNode, {
    EDGE_TYPE,
    EDGE_WIDTH_HIGHLIGHTED,
    EDGE_WIDTH_SELECTED,
    DIMMED_OPACITY,
    GOAL_NODE_TYPE,
    Position,
} from "./TaskNode";
import GoalNode, { UNNAMED_GOAL_LABEL } from "./GoalNode";
import { useGraphHighlight } from "../hooks/useGraphHighlight";
import { Direction, nextTaskInDirection } from "../utils/spatialNavigation";
import { PromptForText } from "../hooks/useTextPrompt";
import { palette } from "../theme/tokens";

// Menu position constants
const MENU_OFFSET_THRESHOLD = 200;

// Leaves a margin around the graph when fitting it into the viewport
const FIT_VIEW_PADDING = 0.15;

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
    goalNode: GoalNode,
};

/** Mirrors the node fills so the minimap reads as a shrunken copy of the graph. */
const miniMapNodeColor = (node: Node): string => {
    if (node.type === GOAL_NODE_TYPE) {
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

/** The goal entry a plan always carries, which anchors that project's lane. */
const goalEntryOf = (lane: BoardLane): TaskAndState | undefined =>
    lane.roadmap.tasksList.find((entry) => entry.task.id === GOAL_ID);

interface RoadmapGraphProps {
    board: Board;
    handleSetGoal: (projectKey: string, goalName: string) => void;
    handleAddTask: (projectKey: string, taskName: string) => Promise<Task | null>;
    handleRemoveTask: (ref: TaskRef) => void;
    handleConnect: (projectKey: string, source: string, target: string) => Promise<void>;
    handleUpdateEdge: (
        projectKey: string,
        oldSource: string,
        oldTarget: string,
        newSource: string,
        newTarget: string,
    ) => void;
    handleRemoveEdge: (projectKey: string, source: string, target: string) => Promise<void>;
    handleToggleComplete: (ref: TaskRef) => void;
    handleChangeRoadmapContext: (ref: TaskRef) => void;
    handleCreatePlanForTask: (ref: TaskRef) => void;
    handleSelectTask: (ref: TaskRef) => void;
    showTaskDetails: () => void;
    showNextTasks: () => void;
    toggleInbox: () => void;
    handlePaste: (projectKey: string, tasks: Task[], dependencies: Dependency[]) => void;
    handleUndo: (projectKey: string) => void;
    promptForText: PromptForText;
    /**
     * Which project the toolbar and the keyboard act on. App resolves it, so the
     * canvas and the actions outside it always name the same project.
     */
    focusedProject: string | null;
    /** Says something worth knowing that is not an error. */
    notify?: (message: string) => void;
    /**
     * Which project the selection implies, or null while nothing is picked out.
     * App reads it to follow the person around the board.
     */
    onSelectionProjectChange?: (projectKey: string | null) => void;
}

const RoadmapGraph: React.FC<RoadmapGraphProps> = ({
    board,
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
    focusedProject,
    notify,
    onSelectionProjectChange,
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
    // A task to highlight as soon as the plan holding it is on the canvas.
    const highlightOnArrivalRef = useRef<string | null>(null);
    const { fitView } = useReactFlow();
    const updateNodeInternals = useUpdateNodeInternals();
    const storeApi = useStoreApi();
    const nodesInitialized = useNodesInitialized();

    /**
     * What each node on the canvas stands for: which project it belongs to and
     * which task inside it. Node ids are canvas ids - a task's own id, or a
     * project-qualified goal id - so this is what turns a click back into
     * something the server can be asked about.
     */
    const nodeIndex = useMemo(() => {
        const index = new Map<string, { ref: TaskRef; entry?: TaskAndState }>();
        for (const lane of board.lanes) {
            for (const entry of lane.roadmap.tasksList) {
                index.set(laneNodeId(lane.projectKey, entry.task.id), {
                    ref: { projectKey: lane.projectKey, taskId: entry.task.id },
                    entry,
                });
            }
        }
        return index;
    }, [board]);

    const refFor = useCallback((nodeId: string): TaskRef | null => nodeIndex.get(nodeId)?.ref ?? null, [nodeIndex]);

    const laneOrder = useMemo(() => board.lanes.map((lane) => lane.projectKey), [board]);

    const focusedLane = useMemo(
        () => board.lanes.find((lane) => lane.projectKey === focusedProject) ?? null,
        [board, focusedProject],
    );

    /** The project holding whatever is picked out, if anything is. */
    const selectionProject = useMemo(
        () => (selectedNodes.length > 0 ? (refFor(selectedNodes[0])?.projectKey ?? null) : null),
        [selectedNodes, refFor],
    );

    // Picking a task out is what says which project is being worked in, and only
    // the canvas knows what has been picked.
    useEffect(() => {
        onSelectionProjectChange?.(selectionProject);
    }, [selectionProject, onSelectionProjectChange]);

    /**
     * Rebuilds the graph from the board every time the server sends a project.
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
        const newEdges: Edge[] = board.lanes.flatMap((lane) =>
            lane.roadmap.dependenciesList.map((dependency: Dependency) =>
                createEdge(
                    laneNodeId(lane.projectKey, dependency.source),
                    laneNodeId(lane.projectKey, dependency.target),
                ),
            ),
        );

        setNodes((currentNodes: Node[]) => {
            const newNodes: Node[] = [];

            board.lanes.forEach((lane) => {
                lane.roadmap.tasksList.forEach((task: TaskAndState) => {
                    const nodeId = laneNodeId(lane.projectKey, task.task.id);
                    const existingNode = currentNodes.find((node) => node.id === nodeId);

                    // Every lane is anchored by its goal, named or not, so the
                    // project a band of the canvas belongs to is always readable.
                    if (task.task.id === GOAL_ID) {
                        if (existingNode && showsGoal(existingNode, task.task.name)) {
                            newNodes.push(existingNode);
                            return;
                        }
                        newNodes.push(
                            existingNode
                                ? {
                                      ...withoutDimming(existingNode),
                                      data: { ...existingNode.data, label: task.task.name },
                                  }
                                : createGoalNode(lane.projectKey, task.task.name),
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
                            : createTaskNode(
                                  task,
                                  lane.projectKey,
                                  { x: 0, y: 0 },
                                  () => handleToggleComplete({ projectKey: lane.projectKey, taskId: task.task.id }),
                                  false,
                              ),
                    );
                });
            });

            return newNodes;
        });
        setEdges(newEdges);
    }, [board, setNodes, setEdges, handleToggleComplete]);

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

    /**
     * Adds a dependency between two nodes on the canvas.
     *
     * A dependency orders two tasks inside one plan, so an edge drawn from one
     * project to another is refused here, where both ends are known, and the
     * person is told which two projects they joined.
     */
    const connectNodes = useCallback(
        async (sourceNodeId: string, targetNodeId: string) => {
            const source = refFor(sourceNodeId);
            const target = refFor(targetNodeId);
            if (!source || !target) {
                return;
            }
            if (source.projectKey !== target.projectKey) {
                notify?.(
                    `A dependency orders two tasks in one project. ${source.projectKey} and ${target.projectKey} are separate projects.`,
                );
                return;
            }
            await handleConnect(source.projectKey, source.taskId, target.taskId);
        },
        [refFor, handleConnect, notify],
    );

    // When the user connects two nodes, call a callback to add the edge to the
    // plan. Nothing here waits on the round trip: the edge arrives with the plan
    // the server sends back, and a refusal is reported from the APIClient.
    const onConnect = useCallback(
        (newConnection) => {
            void connectNodes(newConnection.source, newConnection.target);
        },
        [connectNodes],
    );

    const removeEdgeBetween = useCallback(
        async (sourceNodeId: string, targetNodeId: string) => {
            const source = refFor(sourceNodeId);
            const target = refFor(targetNodeId);
            if (!source || !target || source.projectKey !== target.projectKey) {
                return;
            }
            await handleRemoveEdge(source.projectKey, source.taskId, target.taskId);
        },
        [refFor, handleRemoveEdge],
    );

    const showDetails = useCallback(
        (nodeId: string) => {
            const taskRef = refFor(nodeId);
            if (!taskRef) {
                return;
            }
            handleSelectTask(taskRef);
            toggleTaskDetails();
        },
        [refFor, handleSelectTask, toggleTaskDetails],
    );

    // Hover and selection refer to the plan being left behind, and the ids in
    // them do not exist in the plan being entered.
    const changeContext = useCallback(
        (taskRef: TaskRef) => {
            setHoveredNodeId(null);
            setSelectedNodes([]);
            handleChangeRoadmapContext(taskRef);
        },
        [handleChangeRoadmapContext],
    );

    const changeContextTo = useCallback(
        (nodeId: string) => {
            const taskRef = refFor(nodeId);
            if (taskRef) {
                changeContext(taskRef);
            }
        },
        [refFor, changeContext],
    );

    const removeTaskAt = useCallback(
        (nodeId: string) => {
            const taskRef = refFor(nodeId);
            if (taskRef) {
                handleRemoveTask(taskRef);
            }
        },
        [refFor, handleRemoveTask],
    );

    const createPlanAt = useCallback(
        (nodeId: string) => {
            const taskRef = refFor(nodeId);
            if (taskRef) {
                handleCreatePlanForTask(taskRef);
            }
        },
        [refFor, handleCreatePlanForTask],
    );

    const onNodeContextMenu = useCallback(
        (event, node: Node) => {
            // Prevent native context menu from showing
            event.preventDefault();

            const indexed = nodeIndex.get(node.id);

            // The goal node is the plan itself - it can neither be nested nor removed
            let createPlanForTaskCallback = null;
            let openSubplanCallback = null;
            let deleteCallback = null;
            if (parseGoalNodeId(node.id) === null) {
                deleteCallback = removeTaskAt;
                // A task holds at most one subplan, so offering to add a second
                // would be an action the backend quietly ignores. Offer the way
                // into the existing one instead.
                if (indexed?.entry?.task.plan) {
                    openSubplanCallback = changeContextTo;
                } else {
                    createPlanForTaskCallback = createPlanAt;
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
                name: indexed?.entry?.task.name || UNNAMED_GOAL_LABEL,
                id: node.id,
                top: y < pane.height - MENU_OFFSET_THRESHOLD ? y : undefined,
                left: x < pane.width - MENU_OFFSET_THRESHOLD ? x : undefined,
                right: x >= pane.width - MENU_OFFSET_THRESHOLD ? pane.width - x : undefined,
                bottom: y >= pane.height - MENU_OFFSET_THRESHOLD ? pane.height - y : undefined,
            });
        },
        [nodeIndex, removeTaskAt, createPlanAt, changeContextTo, showDetails],
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
            const oldSource = refFor(oldConnection.source);
            const oldTarget = refFor(oldConnection.target);
            const newSource = refFor(newConnection.source);
            const newTarget = refFor(newConnection.target);
            if (!oldSource || !oldTarget || !newSource || !newTarget) {
                return;
            }
            const project = oldSource.projectKey;
            if (
                oldTarget.projectKey !== project ||
                newSource.projectKey !== project ||
                newTarget.projectKey !== project
            ) {
                notify?.("A dependency orders two tasks in one project, so it cannot be moved to another.");
                return;
            }
            handleUpdateEdge(project, oldSource.taskId, oldTarget.taskId, newSource.taskId, newTarget.taskId);
        },
        [refFor, handleUpdateEdge, notify],
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
            const { nodes: layoutedNodes } = getLayoutedElements(currentNodes, edgesRef.current, laneOrder);
            return layoutedNodes.map(withoutDimming);
        });

        // Laying out moves nodes out from under a stationary cursor without ever
        // firing mouse-leave, which would strand the highlight and leave the
        // graph dimmed until the user happened to move the mouse.
        setHoveredNodeId(null);
    }, [setNodes, laneOrder]);

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
        return `${nodeIds}|${edgeIds}|${laneOrder.join(",")}`;
    }, [nodes, edges, laneOrder]);

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
            const taskRef = refFor(node.id);
            if (taskRef && taskRef.taskId !== GOAL_ID) {
                handleSelectTask(taskRef);
            }
        },
        [refFor, handleSelectTask],
    );

    /**
     * Takes the selection off every dependency. One thing on the canvas is picked
     * out at a time, so whatever puts the selection on a task takes it off the
     * dependencies - and the delete key reads both, so a dependency left selected
     * would go with the task.
     */
    const deselectEdges = useCallback(() => {
        setEdges((currentEdges) =>
            currentEdges.some((edge) => edge.selected)
                ? currentEdges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge))
                : currentEdges,
        );
    }, [setEdges]);

    /** Drops the highlight, leaving the graph with nothing picked out. */
    const clearHighlight = useCallback(() => {
        setNodes((currentNodes) => currentNodes.map((node) => (node.selected ? { ...node, selected: false } : node)));
        deselectEdges();
        setSelectedNodes([]);
    }, [setNodes, deselectEdges]);

    /** Picks a task out, the way clicking it does. */
    const highlightTask = useCallback(
        (nodeId: string) => {
            setNodes((currentNodes) => currentNodes.map((node) => ({ ...node, selected: node.id === nodeId })));
            deselectEdges();
            // Arriving by keyboard says as much about which task is being worked
            // on as clicking it does, so the details panel follows either way.
            const taskRef = refFor(nodeId);
            if (taskRef && taskRef.taskId !== GOAL_ID) {
                handleSelectTask(taskRef);
            }
        },
        [setNodes, deselectEdges, refFor, handleSelectTask],
    );

    // A task asked for while its plan was still being swapped in gets the
    // highlight as soon as it is on the canvas - which is how stepping out of a
    // subplan lands on the task that holds it.
    useEffect(() => {
        const arriving = highlightOnArrivalRef.current;
        if (!arriving || !nodes.some((node) => node.id === arriving)) {
            return;
        }
        highlightOnArrivalRef.current = null;
        highlightTask(arriving);
    }, [nodes, highlightTask]);

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

            highlightTask(nextId);
        },
        [nodes, selectedNodes, highlightTask],
    );

    const onNodeDoubleClick = useCallback(
        (event, node: Node) => {
            const taskRef = refFor(node.id);
            if (taskRef && taskRef.taskId !== GOAL_ID) {
                changeContext(taskRef);
            }
        },
        [refFor, changeContext],
    );

    const onCreateTask = useCallback(async (): Promise<Task | null> => {
        if (!focusedProject) {
            return null;
        }
        const taskLabel = await promptForText(TASK_PROMPT);
        if (!taskLabel) {
            return null;
        }
        return await handleAddTask(focusedProject, taskLabel);
    }, [handleAddTask, promptForText, focusedProject]);

    const onCreateGoal = useCallback(async () => {
        if (!focusedProject) {
            return;
        }
        const goalLabel = await promptForText(GOAL_PROMPT);
        if (!goalLabel) {
            return;
        }
        handleSetGoal(focusedProject, goalLabel);
    }, [handleSetGoal, promptForText, focusedProject]);

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

            const draggedFrom = refFor(connectionState.fromNode.id);
            if (!draggedFrom) {
                return;
            }
            if (connectionState.fromPosition === Position.Right) {
                await createTaskWithEdges((newTask) =>
                    handleConnect(draggedFrom.projectKey, draggedFrom.taskId, newTask.id),
                );
            } else if (connectionState.fromPosition === Position.Left) {
                await createTaskWithEdges((newTask) =>
                    handleConnect(draggedFrom.projectKey, newTask.id, draggedFrom.taskId),
                );
            }
        },
        [createTaskWithEdges, handleConnect, refFor],
    );

    const onCrumbClick = useCallback(
        (taskId: string) => () => {
            if (focusedProject) {
                changeContext({ projectKey: focusedProject, taskId });
            }
        },
        [changeContext, focusedProject],
    );

    // Find connecting edge between two selected nodes
    const findConnectingEdge = useCallback(
        (sourceId: string, targetId: string): Edge | undefined => {
            return edges.find((edge) => edge.source === sourceId && edge.target === targetId);
        },
        [edges],
    );

    /**
     * Copies the picked-out tasks, along with the dependencies that run between
     * them inside one project. A dependency belongs to the plan it lives in, so a
     * pair of tasks selected across two lanes carries no edge between them.
     */
    const handleCopy = useCallback(async () => {
        if (selectedNodes.length === 0) return;

        const tasksToCopy: Task[] = [];
        const dependenciesToCopy: Dependency[] = [];

        selectedNodes.forEach((nodeId) => {
            const indexed = nodeIndex.get(nodeId);
            if (!indexed || indexed.ref.taskId === GOAL_ID) return;
            if (indexed.entry) {
                tasksToCopy.push(indexed.entry.task);
            }
        });

        if (tasksToCopy.length === 0) return;

        board.lanes.forEach((lane) => {
            lane.roadmap.dependenciesList.forEach((dependency) => {
                const source = laneNodeId(lane.projectKey, dependency.source);
                const target = laneNodeId(lane.projectKey, dependency.target);
                if (selectedNodes.includes(source) && selectedNodes.includes(target)) {
                    dependenciesToCopy.push(dependency);
                }
            });
        });

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
    }, [selectedNodes, nodeIndex, board]);

    const handleCut = useCallback(async () => {
        try {
            await handleCopy();

            // Delete selected nodes only if copy succeeded
            selectedNodes.forEach((nodeId) => {
                const taskRef = refFor(nodeId);
                if (taskRef && taskRef.taskId !== GOAL_ID) {
                    handleRemoveTask(taskRef);
                }
            });
            // Also clear selection
            setSelectedNodes([]);
        } catch (err) {
            console.error("Cut operation failed:", err);
            // Don't delete nodes if copy failed
        }
    }, [handleCopy, handleRemoveTask, refFor, selectedNodes, setSelectedNodes]);

    /** Pasted tasks are given fresh ids, so they land in whichever project is in focus. */
    const handlePasteAction = useCallback(async () => {
        if (!focusedProject) {
            return;
        }
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;

            const data = JSON.parse(text);
            if (data && Array.isArray(data.tasks) && Array.isArray(data.dependencies)) {
                handlePaste(focusedProject, data.tasks, data.dependencies);
            } else {
                console.error("Clipboard data is invalid or malformed. Paste aborted.");
            }
        } catch (err) {
            console.error("Failed to paste from clipboard:", err);
        }
    }, [handlePaste, focusedProject]);

    // Handle keyboard events for copy/cut/paste and task creation
    const handleKeyDown = useCallback(
        async (event: KeyboardEvent<HTMLDivElement>) => {
            // Undo: Ctrl+Z or Cmd+Z
            if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
                event.preventDefault();
                if (focusedProject) {
                    handleUndo(focusedProject);
                }
                return;
            }

            // Delete/Backspace: handle ourselves to avoid ReactFlow's internal delete racing with undo
            if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();

                // Delete selected edges
                const selectedEdgesList = edges.filter((edge) => edge.selected);
                selectedEdgesList.forEach((edge) => {
                    void removeEdgeBetween(edge.source, edge.target);
                });

                // Delete selected nodes
                selectedNodes.forEach((nodeId) => {
                    const taskRef = refFor(nodeId);
                    if (taskRef && taskRef.taskId !== GOAL_ID) {
                        handleRemoveTask(taskRef);
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

            // Shift+Enter: step out to the plan this one sits in. The ancestors
            // run from the goal down to the plan on screen, so the one before the
            // end is the plan being stepped out to, and the last is the task that
            // holds the plan being left - which is where the highlight lands, so
            // it is clear where you came out.
            if (event.key === "Enter" && event.shiftKey) {
                event.preventDefault();
                const ancestors = focusedLane?.roadmap.ancestors ?? [];
                if (focusedProject && ancestors.length > 1) {
                    const planLeft = ancestors[ancestors.length - 1].id;
                    changeContext({ projectKey: focusedProject, taskId: ancestors[ancestors.length - 2].id });
                    highlightOnArrivalRef.current = laneNodeId(focusedProject, planLeft);
                }
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
                const indexed = nodeIndex.get(selectedNodeId);

                if (!selectedNode) return;

                // Enter: open the highlighted task's subplan, or tick it off when
                // it holds no plan of its own. The goal is neither nested nor
                // something to complete, so it takes no part in either.
                if (event.key === "Enter") {
                    event.preventDefault();
                    if (!indexed || indexed.ref.taskId === GOAL_ID || !indexed.entry) {
                        return;
                    }
                    if (indexed.entry.task.plan) {
                        changeContext(indexed.ref);
                    } else {
                        handleToggleComplete(indexed.ref);
                    }
                    return;
                }

                // Tab or Space key handling for creating a new task
                if ((event.key === "Tab" || event.key === " ") && indexed) {
                    event.preventDefault();

                    const feedsIntoSelection = event.key === "Tab";
                    await createTaskWithEdges((newTask) =>
                        feedsIntoSelection
                            ? handleConnect(indexed.ref.projectKey, newTask.id, indexed.ref.taskId)
                            : handleConnect(indexed.ref.projectKey, indexed.ref.taskId, newTask.id),
                    );
                }
            } else if (selectedNodes.length === 2 && (event.key === "Tab" || event.key === " ")) {
                event.preventDefault();

                const nodeId1 = selectedNodes[0];
                const nodeId2 = selectedNodes[1];

                const edge = findConnectingEdge(nodeId1, nodeId2) || findConnectingEdge(nodeId2, nodeId1);

                if (edge) {
                    const source = refFor(edge.source);
                    const target = refFor(edge.target);

                    if (source && target && source.projectKey === target.projectKey) {
                        const project = source.projectKey;
                        await createTaskWithEdges(async (newTask) => {
                            await handleRemoveEdge(project, source.taskId, target.taskId);
                            await handleConnect(project, source.taskId, newTask.id);
                            await handleConnect(project, newTask.id, target.taskId);
                        });
                    }
                }
            }
        },
        [
            selectedNodes,
            nodes,
            edges,
            nodeIndex,
            refFor,
            focusedLane,
            focusedProject,
            createTaskWithEdges,
            selectNeighbour,
            clearHighlight,
            changeContext,
            handleToggleComplete,
            handleConnect,
            handleRemoveTask,
            handleRemoveEdge,
            removeEdgeBetween,
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

    const focusedGoalNamed = useMemo(() => !!(focusedLane && goalEntryOf(focusedLane)?.task.name), [focusedLane]);

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
        const traced = !isTracingChain
            ? edges
            : edges.map((edge) =>
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

        // A selected dependency is drawn last and at full opacity, so it stays the
        // line the eye lands on however the rest of the graph is being traced. The
        // delete key acts on it, so which line that is has to be visible before the
        // key is hit.
        return traced.map((edge) =>
            edge.selected
                ? {
                      ...edge,
                      style: {
                          ...edge.style,
                          stroke: palette.edge.selected,
                          strokeWidth: EDGE_WIDTH_SELECTED,
                          opacity: 1,
                      },
                      markerEnd: { ...(edge.markerEnd as object), color: palette.edge.selected },
                      zIndex: 2,
                  }
                : edge,
        );
    }, [edges, highlight, isTracingChain]);

    // A board holding one project needs no saying which; holding several, every
    // action says which lane it lands in.
    const focusLabel = board.lanes.length > 1 && focusedProject ? ` to ${focusedProject}` : "";

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
            {focusedLane && (
                <Panel position="top-left">
                    <Paper elevation={0} sx={CANVAS_TOOLBAR_SX}>
                        {focusedGoalNamed ? (
                            <Button size="small" startIcon={<AddIcon />} onClick={onCreateTask}>
                                {`Add Task${focusLabel}`}
                            </Button>
                        ) : (
                            <Button size="small" startIcon={<FlagIcon />} onClick={onCreateGoal}>
                                {`Name Goal${focusLabel}`}
                            </Button>
                        )}
                        <Button size="small" startIcon={<AutoAwesomeMosaicIcon />} onClick={() => onLayout()}>
                            Autoformat
                        </Button>
                    </Paper>
                </Panel>
            )}
            {/* The gap between the two toolbars, so the path is read as belonging to
                the canvas as a whole and grows in both directions from the centre */}
            {focusedLane && focusedLane.roadmap.ancestors.length > 0 && (
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
                        {focusedLane.roadmap.ancestors.map((crumb, index) => {
                            const label = crumb.name || focusedLane.projectKey;
                            const isCurrent = index === focusedLane.roadmap.ancestors.length - 1;
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
            {focusedGoalNamed && (
                <Panel position="bottom-center">
                    <StatusLegend />
                </Panel>
            )}
            {board.lanes.length === 0 && (
                <Panel position="top-center" style={{ top: "35%" }}>
                    <BoardEmptyState />
                </Panel>
            )}
            {board.lanes.length === 1 && !focusedGoalNamed && (
                <Panel position="top-center" style={{ top: "35%" }}>
                    <CanvasEmptyState onCreateGoal={onCreateGoal} />
                </Panel>
            )}
            {menu && <ContextMenu onClick={onPaneClick} {...menu} />}
        </ReactFlow>
    );
};

export default RoadmapGraph;
