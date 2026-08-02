import { nextTaskInDirection, TaskPoint } from "./spatialNavigation";

describe("nextTaskInDirection", () => {
    // A column of three on the left feeding a column of two on the right.
    const points: TaskPoint[] = [
        { id: "top-left", x: 0, y: 0 },
        { id: "middle-left", x: 0, y: 100 },
        { id: "bottom-left", x: 0, y: 200 },
        { id: "top-right", x: 300, y: 0 },
        { id: "bottom-right", x: 300, y: 200 },
    ];

    it("moves along the row", () => {
        expect(nextTaskInDirection(points, "top-left", "right")).toBe("top-right");
        expect(nextTaskInDirection(points, "top-right", "left")).toBe("top-left");
    });

    it("moves down the column one task at a time", () => {
        expect(nextTaskInDirection(points, "top-left", "down")).toBe("middle-left");
        expect(nextTaskInDirection(points, "middle-left", "down")).toBe("bottom-left");
        expect(nextTaskInDirection(points, "bottom-left", "up")).toBe("middle-left");
    });

    it("stays put at the edge of the graph", () => {
        expect(nextTaskInDirection(points, "top-right", "right")).toBeNull();
        expect(nextTaskInDirection(points, "top-left", "up")).toBeNull();
    });

    it("prefers the task straight ahead to a nearer one off to the side", () => {
        const ahead: TaskPoint[] = [
            { id: "from", x: 0, y: 0 },
            { id: "straight-ahead", x: 300, y: 0 },
            { id: "off-to-the-side", x: 200, y: 400 },
        ];

        expect(nextTaskInDirection(ahead, "from", "right")).toBe("straight-ahead");
    });

    it("enters from the far side when nothing is highlighted yet", () => {
        expect(nextTaskInDirection(points, null, "right")).toBe("top-left");
        expect(nextTaskInDirection(points, null, "left")).toBe("top-right");
        expect(nextTaskInDirection(points, null, "down")).toBe("top-left");
        expect(nextTaskInDirection(points, null, "up")).toBe("bottom-left");
    });

    it("enters the graph when the highlighted task is no longer on the canvas", () => {
        expect(nextTaskInDirection(points, "deleted-task", "right")).toBe("top-left");
    });

    it("has nowhere to go on an empty canvas", () => {
        expect(nextTaskInDirection([], null, "right")).toBeNull();
        expect(nextTaskInDirection([], "anything", "down")).toBeNull();
    });
});
