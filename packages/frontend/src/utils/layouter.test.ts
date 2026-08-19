import { Edge, Node } from "@xyflow/react";
import { getLayoutedElements, LANE_SEPARATION } from "./layouter";

const NODE_HEIGHT = 40;
const NODE_WIDTH = 180;

const node = (id: string, projectKey: string): Node =>
    ({
        id,
        data: { projectKey },
        position: { x: 0, y: 0 },
        measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
    }) as unknown as Node;

const edge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

/** The vertical extent a lane's nodes occupy after being laid out. */
const bandOf = (nodes: Node[], projectKey: string) => {
    const ys = nodes.filter((entry) => entry.data.projectKey === projectKey).map((entry) => entry.position.y);
    return { top: Math.min(...ys), bottom: Math.max(...ys) };
};

const byId = (nodes: Node[]) => new Map(nodes.map((entry) => [entry.id, entry]));

describe("getLayoutedElements", () => {
    it("lays a single project out left to right along its dependencies", () => {
        const nodes = [node("a", "Trip"), node("b", "Trip")];
        const edges = [edge("a", "b")];

        const placed = byId(getLayoutedElements(nodes, edges, ["Trip"]).nodes);

        expect(placed.get("b")!.position.x).toBeGreaterThan(placed.get("a")!.position.x);
        expect(placed.get("a")!.position.y).toBe(placed.get("b")!.position.y);
    });

    it("hands back the edges it was given", () => {
        const edges = [edge("a", "b")];

        const result = getLayoutedElements([node("a", "Trip"), node("b", "Trip")], edges, ["Trip"]);

        expect(result.edges).toEqual(edges);
    });

    it("leaves the nodes it was handed untouched", () => {
        const nodes = [node("a", "Trip"), node("b", "Trip")];

        getLayoutedElements(nodes, [edge("a", "b")], ["Trip"]);

        expect(nodes.every((entry) => entry.position.x === 0 && entry.position.y === 0)).toBe(true);
    });

    describe("with several projects", () => {
        const twoProjects = () => [node("t1", "Trip"), node("t2", "Trip"), node("h1", "House"), node("h2", "House")];

        it("gives each project its own band down the canvas", () => {
            const placed = getLayoutedElements(
                twoProjects(),
                [edge("t1", "t2"), edge("h1", "h2")],
                ["Trip", "House"],
            ).nodes;

            const trip = bandOf(placed, "Trip");
            const house = bandOf(placed, "House");
            expect(house.top).toBeGreaterThan(trip.bottom);
        });

        it("leaves a clear gap between one band and the next", () => {
            const placed = getLayoutedElements(twoProjects(), [], ["Trip", "House"]).nodes;

            const trip = bandOf(placed, "Trip");
            const house = bandOf(placed, "House");
            expect(house.top - trip.bottom).toBeGreaterThanOrEqual(LANE_SEPARATION);
        });

        it("puts the bands in the order the session chose the projects", () => {
            const placed = getLayoutedElements(twoProjects(), [], ["House", "Trip"]).nodes;

            expect(bandOf(placed, "Trip").top).toBeGreaterThan(bandOf(placed, "House").bottom);
        });

        it("lays out a project's plan from the dependencies inside it alone", () => {
            const withCrossEdge = getLayoutedElements(
                twoProjects(),
                [edge("t1", "t2"), edge("h1", "h2"), edge("t1", "h1")],
                ["Trip", "House"],
            ).nodes;
            const withoutCrossEdge = getLayoutedElements(
                twoProjects(),
                [edge("t1", "t2"), edge("h1", "h2")],
                ["Trip", "House"],
            ).nodes;

            expect(byId(withCrossEdge).get("h1")!.position).toEqual(byId(withoutCrossEdge).get("h1")!.position);
        });

        it("places a project the caller did not name, after the ones it did", () => {
            const placed = getLayoutedElements(twoProjects(), [], ["House"]).nodes;

            expect(bandOf(placed, "Trip").top).toBeGreaterThan(bandOf(placed, "House").bottom);
        });
    });

    it("hands back a node it has nowhere to place, so nothing is lost", () => {
        const unmeasured = { id: "ghost", data: { projectKey: "Trip" }, position: { x: 7, y: 9 } } as unknown as Node;

        const placed = byId(getLayoutedElements([unmeasured], [], ["Trip"]).nodes);

        expect(placed.get("ghost")).toBeDefined();
    });

    it("lays out an empty board without complaint", () => {
        expect(getLayoutedElements([], [], [])).toEqual({ nodes: [], edges: [] });
    });
});
