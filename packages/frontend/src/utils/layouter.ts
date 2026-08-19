import dagre from "dagre";
import { Node, Edge } from "@xyflow/react";
import { SOURCE_HANDLE_POSITION, TARGET_HANDLE_POSITION } from "../components/TaskNode";

// Dagre's defaults pack ranks tightly enough that orthogonal edges have nowhere
// to route and end up overlapping each other.
const RANK_SEPARATION = 120;
const NODE_SEPARATION = 40;
const EDGE_SEPARATION = 20;

// The band of empty canvas between one project's lane and the next. Wide enough
// that the gap reads as a division between two projects.
const LANE_SEPARATION = 160;

/** Which project a node belongs to, so its lane can be told from its neighbours'. */
const laneOf = (node: Node): string => String(node.data?.projectKey ?? "");

/** Lays one project's plan out left to right, and reports the box it filled. */
const layoutLane = (
    nodes: Node[],
    edges: Edge[],
): { positions: Map<string, { x: number; y: number }>; height: number } => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
        rankdir: "LR",
        ranksep: RANK_SEPARATION,
        nodesep: NODE_SEPARATION,
        edgesep: EDGE_SEPARATION,
    });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: node.measured?.width ?? 0, height: node.measured?.height ?? 0 });
    });
    edges.forEach((edge) => {
        // An edge whose ends are not both in this lane has nothing to say about
        // where these nodes go.
        if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
            dagreGraph.setEdge(edge.source, edge.target);
        }
    });

    dagre.layout(dagreGraph);

    const positions = new Map<string, { x: number; y: number }>();
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    nodes.forEach((node) => {
        const placed = dagreGraph.node(node.id);
        if (!placed) {
            return;
        }
        positions.set(node.id, { x: placed.x, y: placed.y });
        top = Math.min(top, placed.y - placed.height / 2);
        bottom = Math.max(bottom, placed.y + placed.height / 2);
    });

    const height = Number.isFinite(top) ? bottom - top : 0;

    // Every lane is measured from its own top edge, so stacking them is a matter
    // of adding up the heights that came before.
    if (Number.isFinite(top)) {
        positions.forEach((position, id) => {
            positions.set(id, { x: position.x, y: position.y - top });
        });
    }

    return { positions, height };
};

/**
 * Places every node on the board.
 *
 * Each project is laid out on its own, from the dependencies inside it, and the
 * results are stacked down the canvas as bands - so a board holding several
 * projects reads as one lane per project, and the plan inside a lane is laid out
 * exactly as it would be on a board of its own.
 *
 * `laneOrder` fixes which band a project gets, so the lanes stay in the order the
 * session chose them however the graph changes underneath.
 */
const getLayoutedElements = (nodes: Node[], edges: Edge[], laneOrder: string[] = []) => {
    const nodesCopy = nodes.map((node) => ({ ...node }));
    const edgesCopy = edges.map((edge) => ({ ...edge }));

    const byLane = new Map<string, Node[]>();
    for (const node of nodesCopy) {
        const lane = laneOf(node);
        const existing = byLane.get(lane);
        if (existing) {
            existing.push(node);
        } else {
            byLane.set(lane, [node]);
        }
    }

    // Lanes the caller named come first, in that order; anything else follows in
    // the order it turned up, so no node is left unplaced.
    const lanes = [
        ...laneOrder.filter((lane) => byLane.has(lane)),
        ...[...byLane.keys()].filter((lane) => !laneOrder.includes(lane)),
    ];

    const positions = new Map<string, { x: number; y: number }>();
    let offsetY = 0;
    for (const lane of lanes) {
        const laneNodes = byLane.get(lane)!;
        const { positions: lanePositions, height } = layoutLane(laneNodes, edgesCopy);
        for (const [id, position] of lanePositions) {
            positions.set(id, { x: position.x, y: position.y + offsetY });
        }
        offsetY += height + LANE_SEPARATION;
    }

    const layoutedNodes = nodesCopy.map((node) => {
        const position = positions.get(node.id);
        if (!position) {
            return node;
        }
        return {
            ...node,
            targetPosition: TARGET_HANDLE_POSITION,
            sourcePosition: SOURCE_HANDLE_POSITION,
            position,
        };
    });

    return { nodes: layoutedNodes, edges: edgesCopy };
};

export { getLayoutedElements, LANE_SEPARATION };
