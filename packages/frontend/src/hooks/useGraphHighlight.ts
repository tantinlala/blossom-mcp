import { useMemo } from "react";
import { Edge } from "@xyflow/react";

export interface GraphHighlight {
    /** Ids of the focused node plus everything upstream and downstream of it. */
    nodeIds: Set<string>;
    /** Ids of the edges connecting those nodes to each other. */
    edgeIds: Set<string>;
}

const EMPTY_HIGHLIGHT: GraphHighlight = { nodeIds: new Set(), edgeIds: new Set() };

/** Buckets the edges by one endpoint, so a walk can look up a node's edges directly. */
const indexEdgesBy = (edges: Edge[], endpoint: (edge: Edge) => string): Map<string, Edge[]> => {
    const index = new Map<string, Edge[]>();

    edges.forEach((edge) => {
        const key = endpoint(edge);
        const bucket = index.get(key);
        if (bucket) {
            bucket.push(edge);
        } else {
            index.set(key, [edge]);
        }
    });

    return index;
};

/**
 * Everything the focused task depends on, and everything that depends on it.
 *
 * Walks outwards from `focusedNodeId` in both directions at once. The result is
 * the dependency chain the task belongs to, which is what lets a dense graph be
 * read one chain at a time. Highlighting follows hover, so each walk visits a
 * node's edges through an index rather than rescanning the whole edge list.
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
    const walk = (index: Map<string, Edge[]>, otherEnd: (edge: Edge) => string) => {
        const queue = [focusedNodeId];
        const visited = new Set<string>([focusedNodeId]);

        // Read through the queue with a cursor: shifting would recopy the ids
        // still waiting on every step.
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
            index.get(queue[cursor])?.forEach((edge) => {
                const next = otherEnd(edge);
                edgeIds.add(edge.id);
                nodeIds.add(next);
                if (!visited.has(next)) {
                    visited.add(next);
                    queue.push(next);
                }
            });
        }
    };

    walk(
        indexEdgesBy(edges, (edge) => edge.target),
        (edge) => edge.source,
    );
    walk(
        indexEdgesBy(edges, (edge) => edge.source),
        (edge) => edge.target,
    );

    return { nodeIds, edgeIds };
};

/** Memoised `findConnectedSubgraph` for use during render. */
export function useGraphHighlight(edges: Edge[], focusedNodeId: string | null): GraphHighlight {
    return useMemo(() => findConnectedSubgraph(edges, focusedNodeId), [edges, focusedNodeId]);
}
