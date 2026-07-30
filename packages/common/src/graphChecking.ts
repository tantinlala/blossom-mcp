import { Dependency } from "./types";

const hasCircularDependencies = (edges: Dependency[]): boolean => {
    const graph: Map<string, string[]> = new Map();
    for (const { source, target } of edges) {
        if (!graph.has(source)) {
            graph.set(source, []);
        }
        graph.get(source)?.push(target);
    }

    const visited: Set<string> = new Set();
    const recursionStack: Set<string> = new Set();

    const isCyclic = (node: string): boolean => {
        if (recursionStack.has(node)) {
            return true;
        }

        if (visited.has(node)) {
            return false;
        }

        visited.add(node);
        recursionStack.add(node);

        const neighbors = graph.get(node) || [];
        for (const neighbor of neighbors) {
            if (isCyclic(neighbor)) {
                return true;
            }
        }

        recursionStack.delete(node);
        return false;
    };

    for (const node of graph.keys()) {
        if (isCyclic(node)) {
            return true;
        }
    }

    return false;
};

export { hasCircularDependencies };
