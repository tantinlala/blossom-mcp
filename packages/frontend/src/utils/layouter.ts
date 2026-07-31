import dagre from "dagre";
import { Node, Edge } from "@xyflow/react";
import { SOURCE_HANDLE_POSITION, TARGET_HANDLE_POSITION } from "../components/TaskNode";

// Dagre's defaults pack ranks tightly enough that orthogonal edges have nowhere
// to route and end up overlapping each other.
const RANK_SEPARATION = 120;
const NODE_SEPARATION = 40;
const EDGE_SEPARATION = 20;

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
        rankdir: "LR",
        ranksep: RANK_SEPARATION,
        nodesep: NODE_SEPARATION,
        edgesep: EDGE_SEPARATION,
    });

    // Create a copy of nodes and edges to avoid mutating the input
    const nodesCopy = nodes.map((node) => ({ ...node }));
    const edgesCopy = edges.map((edge) => ({ ...edge }));

    nodesCopy.forEach((node) => {
        dagreGraph.setNode(node.id, { width: node.measured?.width ?? 0, height: node.measured?.height ?? 0 });
    });

    edgesCopy.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const goalNode = dagreGraph.node("Goal");

    // Create new node objects with updated positions
    const layoutedNodes = nodesCopy.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);

        // Skip nodes that don't exist in the dagre graph
        if (!nodeWithPosition) {
            return node;
        }

        // Create a new node object with updated properties
        return {
            ...node,
            targetPosition: TARGET_HANDLE_POSITION,
            sourcePosition: SOURCE_HANDLE_POSITION,
            position: {
                x: nodeWithPosition.x - (goalNode ? goalNode.x : 0),
                y: nodeWithPosition.y - (goalNode ? goalNode.y : 0),
            },
        };
    });

    return { nodes: layoutedNodes, edges: edgesCopy };
};

export { getLayoutedElements };
