import { findCycle, hasCircularDependencies } from "./graphChecking";

describe("hasCircularDependencies", () => {
    it("should detect direct circular dependency", async () => {
        expect(
            hasCircularDependencies([
                { source: "0", target: "1" },
                { source: "1", target: "0" },
            ]),
        ).toBeTruthy();
    });

    it("should detect indirect circular dependency", async () => {
        expect(
            hasCircularDependencies([
                { source: "0", target: "1" },
                { source: "1", target: "2" },
                { source: "2", target: "0" },
            ]),
        ).toBeTruthy();
    });

    it("should not detect non-circular dependency", async () => {
        expect(
            hasCircularDependencies([
                { source: "0", target: "1" },
                { source: "1", target: "2" },
                { source: "2", target: "3" },
            ]),
        ).toBeFalsy();
    });

    it("should detect multiple circular dependencies", async () => {
        expect(
            hasCircularDependencies([
                { source: "0", target: "1" },
                { source: "2", target: "0" },
                { source: "1", target: "2" },
                { source: "0", target: "3" },
                { source: "4", target: "5" },
                { source: "5", target: "4" },
            ]),
        ).toBeTruthy();
    });

    it("should detect self-dependency", async () => {
        expect(hasCircularDependencies([{ source: "3", target: "3" }])).toBeTruthy();
    });
});

describe("findCycle", () => {
    it("should return null when the edges form a DAG", () => {
        expect(
            findCycle([
                { source: "0", target: "1" },
                { source: "1", target: "2" },
                { source: "0", target: "2" },
            ]),
        ).toBeNull();
    });

    it("should return the nodes that close a direct cycle, first and last the same", () => {
        expect(
            findCycle([
                { source: "0", target: "1" },
                { source: "1", target: "0" },
            ]),
        ).toEqual(["0", "1", "0"]);
    });

    it("should return the whole path around an indirect cycle", () => {
        expect(
            findCycle([
                { source: "0", target: "1" },
                { source: "1", target: "2" },
                { source: "2", target: "0" },
            ]),
        ).toEqual(["0", "1", "2", "0"]);
    });

    it("should return only the looping part, leaving out the run-up to it", () => {
        expect(
            findCycle([
                { source: "start", target: "0" },
                { source: "0", target: "1" },
                { source: "1", target: "0" },
            ]),
        ).toEqual(["0", "1", "0"]);
    });

    it("should return a self-dependency as a single node twice", () => {
        expect(findCycle([{ source: "3", target: "3" }])).toEqual(["3", "3"]);
    });
});
