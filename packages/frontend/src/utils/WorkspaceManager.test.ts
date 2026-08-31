import { WorkspaceManager } from "./WorkspaceManager";
import { GOAL_ID, ProjectState, Task, ViewState } from "@blossom/common";

const leaf = (id: string, name = `Task ${id}`, completionState = false): Task => ({
    name,
    id,
    completionState,
    plan: null as any,
});

const goalWith = (tasks: Task[], name = "Ship product"): Task => ({
    name,
    id: GOAL_ID,
    completionState: false,
    plan: { tasksList: tasks, dependenciesList: [] },
});

const state = (key: string, options: { version?: number; savedToDisk?: boolean; goal?: Task } = {}): ProjectState => ({
    version: options.version ?? 1,
    key,
    savedToDisk: options.savedToDisk ?? true,
    goal: options.goal ?? goalWith([]),
    inbox: [],
});

const view = (projects: ProjectState[], assistantProject: string | null = null): ViewState => ({
    projects,
    assistantProject,
});

describe("WorkspaceManager", () => {
    let workspace: WorkspaceManager;

    beforeEach(() => {
        workspace = new WorkspaceManager();
    });

    it("starts with an empty board", () => {
        expect(workspace.keys).toEqual([]);
        expect(workspace.board()).toEqual({ lanes: [] });
        expect(workspace.assistantProject).toBeNull();
    });

    describe("applyView", () => {
        it("puts one lane on the board per project, in the order given", () => {
            workspace.applyView(view([state("Trip"), state("House")]));

            expect(workspace.keys).toEqual(["Trip", "House"]);
            expect(workspace.board().lanes.map((lane) => lane.projectKey)).toEqual(["Trip", "House"]);
        });

        it("drops a project the view no longer names", () => {
            workspace.applyView(view([state("Trip"), state("House")]));

            workspace.applyView(view([state("House")]));

            expect(workspace.keys).toEqual(["House"]);
        });

        it("keeps the level a project is drilled into across a view it still names", () => {
            const nested = goalWith([
                {
                    id: "sub",
                    name: "Prepare",
                    completionState: false,
                    plan: { tasksList: [leaf("inner")], dependenciesList: [] },
                },
            ]);
            workspace.applyView(view([state("Trip", { goal: nested })]));
            workspace.planManagerFor("Trip")!.changeContextToWithinTask("sub");

            workspace.applyView(view([state("Trip", { version: 2, goal: nested })]));

            expect(workspace.board().lanes[0].roadmap.ancestors.map((crumb) => crumb.id)).toEqual([GOAL_ID, "sub"]);
        });

        it("follows which project the assistant works on", () => {
            workspace.applyView(view([state("Trip")], "Trip"));

            expect(workspace.assistantProject).toBe("Trip");
        });
    });

    describe("applyProject", () => {
        it("applies a project already on the board", () => {
            workspace.applyView(view([state("Trip")]));

            const landed = workspace.applyProject(state("Trip", { version: 2, goal: goalWith([leaf("t1")]) }));

            expect(landed).toBe(true);
            expect(workspace.versions()).toEqual({ Trip: 2 });
            expect(workspace.board().lanes[0].roadmap.tasksList.map((entry) => entry.task.id)).toEqual(["t1", GOAL_ID]);
        });

        it("leaves a project the board does not hold alone, and says so", () => {
            workspace.applyView(view([state("Trip")]));

            const landed = workspace.applyProject(state("SomebodyElsesProject"));

            expect(landed).toBe(false);
            expect(workspace.keys).toEqual(["Trip"]);
        });

        it("records whether a file holds the project's work", () => {
            workspace.applyView(view([state("Trip", { savedToDisk: true })]));

            workspace.applyProject(state("Trip", { version: 2, savedToDisk: false }));

            expect(workspace.savedToDisk("Trip")).toBe(false);
        });
    });

    describe("addProject", () => {
        it("puts a project at the end of the board, leaving the rest in place", () => {
            workspace.applyView(view([state("Trip")]));

            workspace.addProject(state("House", { savedToDisk: false }));

            expect(workspace.keys).toEqual(["Trip", "House"]);
            expect(workspace.savedToDisk("House")).toBe(false);
        });

        it("applies a project the board already holds without moving it", () => {
            workspace.applyView(view([state("Trip"), state("House")]));

            workspace.addProject(state("Trip", { version: 4 }));

            expect(workspace.keys).toEqual(["Trip", "House"]);
            expect(workspace.versions().Trip).toBe(4);
        });
    });

    describe("removeProject", () => {
        it("takes a project and its plan off the board", () => {
            workspace.applyView(view([state("Trip"), state("House")]));

            workspace.removeProject("Trip");

            expect(workspace.keys).toEqual(["House"]);
            expect(workspace.planManagerFor("Trip")).toBeNull();
            expect(workspace.has("Trip")).toBe(false);
        });
    });

    describe("renameProject", () => {
        it("keeps the project's place on the board under its new key", () => {
            workspace.applyView(view([state("Trip"), state("Untitled"), state("House")]));

            workspace.renameProject("Untitled", "q3-roadmap");

            expect(workspace.keys).toEqual(["Trip", "q3-roadmap", "House"]);
        });

        it("keeps the plan and the level it is drilled into", () => {
            const nested = goalWith([
                {
                    id: "sub",
                    name: "Prepare",
                    completionState: false,
                    plan: { tasksList: [leaf("inner")], dependenciesList: [] },
                },
            ]);
            workspace.applyView(view([state("Untitled", { goal: nested })]));
            workspace.planManagerFor("Untitled")!.changeContextToWithinTask("sub");

            workspace.renameProject("Untitled", "q3-roadmap");

            const lane = workspace.board().lanes[0];
            expect(lane.projectKey).toBe("q3-roadmap");
            expect(lane.roadmap.ancestors.map((crumb) => crumb.id)).toEqual([GOAL_ID, "sub"]);
        });

        it("stamps startable tasks with the key the project now answers to", () => {
            workspace.applyView(view([state("Untitled", { goal: goalWith([leaf("t1")]) })]));

            workspace.renameProject("Untitled", "q3-roadmap");

            expect(workspace.allUnblockedTasks().map((next) => next.projectKey)).toEqual(["q3-roadmap"]);
        });

        it("does nothing for a project the board does not hold", () => {
            workspace.applyView(view([state("Trip")]));

            workspace.renameProject("Nothing", "Something");

            expect(workspace.keys).toEqual(["Trip"]);
        });
    });

    describe("the board it draws", () => {
        it("gives each lane the plan level its project is open at", () => {
            const nested = goalWith([
                {
                    id: "sub",
                    name: "Prepare",
                    completionState: false,
                    plan: { tasksList: [leaf("inner")], dependenciesList: [] },
                },
            ]);
            workspace.applyView(
                view([state("Trip", { goal: nested }), state("House", { goal: goalWith([leaf("h1")]) })]),
            );
            workspace.planManagerFor("Trip")!.changeContextToWithinTask("sub");

            const lanes = workspace.board().lanes;

            expect(lanes[0].roadmap.tasksList.map((entry) => entry.task.id)).toEqual(["inner", GOAL_ID]);
            expect(lanes[1].roadmap.tasksList.map((entry) => entry.task.id)).toEqual(["h1", GOAL_ID]);
        });

        it("anchors a project holding nothing yet with its own goal, so its lane is visible", () => {
            const nothingYet: Task = { name: "", id: GOAL_ID, completionState: false, plan: null as any };
            workspace.applyView(
                view([state("Trip", { goal: goalWith([leaf("t1")]) }), state("Untitled", { goal: nothingYet })]),
            );

            const lanes = workspace.board().lanes;

            expect(lanes.map((lane) => lane.projectKey)).toEqual(["Trip", "Untitled"]);
            expect(lanes[1].roadmap.tasksList.map((entry) => entry.task.id)).toEqual([GOAL_ID]);
        });

        it("carries the goal's name onto the anchor, so a named goal reads on its node", () => {
            const named: Task = { name: "Redecorate", id: GOAL_ID, completionState: false, plan: null as any };
            workspace.applyView(view([state("House", { goal: named })]));

            expect(workspace.board().lanes[0].roadmap.tasksList[0].task.name).toBe("Redecorate");
        });

        it("leaves the goal a plan already carries exactly as the plan describes it", () => {
            workspace.applyView(view([state("Trip", { goal: goalWith([leaf("t1")], "Get to Lisbon") })]));

            const goalEntries = workspace
                .board()
                .lanes[0].roadmap.tasksList.filter((entry) => entry.task.id === GOAL_ID);
            expect(goalEntries).toHaveLength(1);
            expect(goalEntries[0].task.name).toBe("Get to Lisbon");
        });

        it("says whether a file holds each lane's project", () => {
            workspace.applyView(
                view([state("Trip", { savedToDisk: true }), state("Untitled", { savedToDisk: false })]),
            );

            expect(workspace.board().lanes.map((lane) => lane.savedToDisk)).toEqual([true, false]);
        });
    });

    describe("startable tasks", () => {
        it("collects them across every project, project by project", () => {
            workspace.applyView(
                view([
                    state("Trip", { goal: goalWith([leaf("t1")]) }),
                    state("House", { goal: goalWith([leaf("h1")]) }),
                ]),
            );

            expect(workspace.allUnblockedTasks().map((next) => [next.projectKey, next.task.id])).toEqual([
                ["Trip", "t1"],
                ["House", "h1"],
            ]);
        });
    });

    describe("finding a task", () => {
        beforeEach(() => {
            workspace.applyView(
                view([
                    state("Trip", { goal: goalWith([leaf("t1", "Pack")]) }),
                    state("House", { goal: goalWith([leaf("h1", "Choose paint")]) }),
                ]),
            );
        });

        it("names the project holding it, since task ids are unique across projects", () => {
            expect(workspace.findTask("h1")).toEqual({
                ref: { projectKey: "House", taskId: "h1" },
                task: expect.objectContaining({ name: "Choose paint" }),
            });
        });

        it("finds nothing for a task no project on the board holds", () => {
            expect(workspace.findTask("nobody-has-this")).toBeNull();
        });

        it("reads a task at the level its own project is open at", () => {
            expect(workspace.findTaskInContext({ projectKey: "Trip", taskId: "t1" })!.name).toBe("Pack");
        });

        it("reads nothing for a project the board does not hold", () => {
            expect(workspace.findTaskInContext({ projectKey: "Nothing", taskId: "t1" })).toBeNull();
        });
    });

    describe("the assistant's project", () => {
        it("follows the choice the server reports", () => {
            workspace.applyAssistantProject("House");

            expect(workspace.assistantProject).toBe("House");
        });

        it("can be left unset", () => {
            workspace.applyAssistantProject("House");

            workspace.applyAssistantProject(null);

            expect(workspace.assistantProject).toBeNull();
        });
    });

    describe("versions", () => {
        it("reports each project's version, for the poll that runs while the socket is down", () => {
            workspace.applyView(view([state("Trip", { version: 5 }), state("House", { version: 2 })]));

            expect(workspace.versions()).toEqual({ Trip: 5, House: 2 });
        });
    });
});
