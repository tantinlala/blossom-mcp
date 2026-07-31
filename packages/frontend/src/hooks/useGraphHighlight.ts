import { useMemo } from "react";
import { Edge } from "@xyflow/react";

export interface GraphHighlight {
    /** Ids of the focused node plus everything upstream and downstream of it. */
    nodeIds: Set<string>;
    /** Ids of the edges connecting those nodes to each other. */
    edgeIds: Set<string>;
}

const EMPTY_HIGHLIGHT: GraphHighlight = { nodeIds: new Set(), edgeIds: new Set() };

/**
 * Everything the focused task depends on, and everything that depends on it.
 *
 * Walks the edge list outwards from `focusedNodeId` in both directions at once.
 * The result is the dependency chain the task belongs to, which is what lets a
 * dense graph be read one chain at a time.
 */
export const findConnectedSubgraph = (edges: Edge[], focusedNodeId: string | null): GraphHighlight => {
    if (!focusedNodeId) {
        return EMPTY_HIGHLIGHT;
    }

    const nodeIds = new Set<string>([focusedNodeId]);
    const edgeIds = new Set<string>();

    // Walk upstream and downstream separately: a node reachable both ways is
    // still on the chain, but following edges in either direction from every
    // visited node would drag in unrelated siblings that merely share a blocker.
    const walk = (getNext: (edge: Edge, from: string) => string | null) => {
        const queue = [focusedNodeId];
        const visited = new Set<string>([focusedNodeId]);

        while (queue.length > 0) {
            const current = queue.shift() as string;
            edges.forEach((edge) => {
                const next = getNext(edge, current);
                if (next === null) {
                    return;
                }
                edgeIds.add(edge.id);
                nodeIds.add(next);
                if (!visited.has(next)) {
                    visited.add(next);
                    queue.push(next);
                }
            });
        }
    };

    walk((edge, from) => (edge.target === from ? edge.source : null));
    walk((edge, from) => (edge.source === from ? edge.target : null));

    return { nodeIds, edgeIds };
};

/** Memoised `findConnectedSubgraph` for use during render. */
export function useGraphHighlight(edges: Edge[], focusedNodeId: string | null): GraphHighlight {
    return useMemo(() => findConnectedSubgraph(edges, focusedNodeId), [edges, focusedNodeId]);
}
