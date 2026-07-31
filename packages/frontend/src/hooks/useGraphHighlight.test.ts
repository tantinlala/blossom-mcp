import { Edge } from "@xyflow/react";
import { findConnectedSubgraph } from "./useGraphHighlight";

const edge = (source: string, target: string): Edge => ({
    id: `${source}-${target}`,
    source,
    target,
});

//   a -> b -> c        (one chain)
//   x -> y             (a separate chain)
const TWO_CHAINS: Edge[] = [edge("a", "b"), edge("b", "c"), edge("x", "y")];

describe("findConnectedSubgraph", () => {
    it("returns nothing when no node is focused", () => {
        const { nodeIds, edgeIds } = findConnectedSubgraph(TWO_CHAINS, null);

        expect(nodeIds.size).toBe(0);
        expect(edgeIds.size).toBe(0);
    });

    it("includes the focused node itself even when it has no edges", () => {
        const { nodeIds, edgeIds } = findConnectedSubgraph([], "lonely");

        expect([...nodeIds]).toEqual(["lonely"]);
        expect(edgeIds.size).toBe(0);
    });

    it("walks upstream to everything the focused task depends on", () => {
        const { nodeIds } = findConnectedSubgraph(TWO_CHAINS, "c");

        expect([...nodeIds].sort()).toEqual(["a", "b", "c"]);
    });

    it("walks downstream to everything that depends on the focused task", () => {
        const { nodeIds } = findConnectedSubgraph(TWO_CHAINS, "a");

        expect([...nodeIds].sort()).toEqual(["a", "b", "c"]);
    });

    it("walks both directions from a task in the middle of a chain", () => {
        const { nodeIds, edgeIds } = findConnectedSubgraph(TWO_CHAINS, "b");

        expect([...nodeIds].sort()).toEqual(["a", "b", "c"]);
        expect([...edgeIds].sort()).toEqual(["a-b", "b-c"]);
    });

    it("excludes chains the focused task is not part of", () => {
        const { nodeIds, edgeIds } = findConnectedSubgraph(TWO_CHAINS, "b");

        expect(nodeIds.has("x")).toBe(false);
        expect(nodeIds.has("y")).toBe(false);
        expect(edgeIds.has("x-y")).toBe(false);
    });

    it("does not drag in siblings that merely share a blocker", () => {
        //   root -> left
        //   root -> right      focusing left must not pull in right
        const edges = [edge("root", "left"), edge("root", "right")];

        const { nodeIds } = findConnectedSubgraph(edges, "left");

        expect([...nodeIds].sort()).toEqual(["left", "root"]);
    });

    it("follows a diamond back together in both directions", () => {
        const edges = [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")];

        const { nodeIds, edgeIds } = findConnectedSubgraph(edges, "b");

        expect([...nodeIds].sort()).toEqual(["a", "b", "d"]);
        expect([...edgeIds].sort()).toEqual(["a-b", "b-d"]);
    });

    it("terminates on a cycle", () => {
        const edges = [edge("a", "b"), edge("b", "c"), edge("c", "a")];

        const { nodeIds } = findConnectedSubgraph(edges, "a");

        expect([...nodeIds].sort()).toEqual(["a", "b", "c"]);
    });
});
