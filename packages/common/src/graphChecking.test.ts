import { hasCircularDependencies } from "./graphChecking";

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
