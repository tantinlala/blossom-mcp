import { Dependency } from "./types";

/**
 * Finds one cycle in the dependency graph and returns the nodes that close it,
 * starting and ending on the same node - `["a", "b", "a"]` for a -> b -> a.
 * Returns null when the edges form a DAG.
 *
 * The path is what a caller reports back: "this edge would close a -> b -> a"
 * tells somebody which of their edges to drop, where a bare "would create a
 * cycle" leaves them to work it out from the whole graph.
 */
const findCycle = (edges: Dependency[]): string[] | null => {
    const graph: Map<string, string[]> = new Map();
    for (const { source, target } of edges) {
        if (!graph.has(source)) {
            graph.set(source, []);
        }
        graph.get(source)?.push(target);
    }

    const visited: Set<string> = new Set();
    const stack: string[] = [];
    const onStack: Set<string> = new Set();

    const walk = (node: string): string[] | null => {
        if (onStack.has(node)) {
            return [...stack.slice(stack.indexOf(node)), node];
        }

        if (visited.has(node)) {
            return null;
        }

        visited.add(node);
        stack.push(node);
        onStack.add(node);

        const neighbors = graph.get(node) || [];
        for (const neighbor of neighbors) {
            const cycle = walk(neighbor);
            if (cycle) {
                return cycle;
            }
        }

        stack.pop();
        onStack.delete(node);
        return null;
    };

    for (const node of graph.keys()) {
        const cycle = walk(node);
        if (cycle) {
            return cycle;
        }
    }

    return null;
};

const hasCircularDependencies = (edges: Dependency[]): boolean => findCycle(edges) !== null;

export { hasCircularDependencies, findCycle };
