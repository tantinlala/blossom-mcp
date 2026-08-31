import { mock, MockProxy } from "jest-mock-extended";
import { GOAL_ID, Task } from "@blossom/common";
import {
    AmbiguousProjectError,
    NoAssistantProjectError,
    ProjectAlreadyOpenError,
    ProjectNotOpenError,
    Workspace,
} from "./workspace";
import { Project, ProjectNotFoundError } from "../models/project";

const goalNamed = (name: string): Task => ({ id: GOAL_ID, name, completionState: false, plan: null as any });

describe("Workspace", () => {
    let project: MockProxy<Project>;
    let workspace: Workspace;

    beforeEach(() => {
        project = mock<Project>();
        project.listExistingProjects.mockResolvedValue([]);
        project.projectExists.mockResolvedValue(false);
        workspace = new Workspace(project);
    });

    /** Makes `filename` readable from disk with the given goal. */
    const onDisk = (filename: string, goalName = filename) => {
        project.projectExists.mockImplementation(async (asked) => asked === filename);
        project.restoreProject.mockResolvedValue({ goal: goalNamed(goalName), inbox: [] });
    };

    describe("open", () => {
        it("reads a saved project from disk and keys it by its filename", async () => {
            onDisk("Trip", "Get to Lisbon");

            const store = await workspace.open("Trip");

            expect(store.key).toBe("Trip");
            expect(store.savedToDisk).toBe(true);
            expect(store.getState().goal.name).toBe("Get to Lisbon");
            expect(workspace.keys()).toEqual(["Trip"]);
        });

        it("hands back the project already open, so two sessions share one copy", async () => {
            onDisk("Trip");

            const first = await workspace.open("Trip");
            first.setGoal("Edited by the first session");
            const second = await workspace.open("Trip");

            expect(second).toBe(first);
            expect(second.getState().goal.name).toBe("Edited by the first session");
            expect(project.restoreProject).toHaveBeenCalledTimes(1);
        });

        it("reports a key naming no file", async () => {
            await expect(workspace.open("Missing")).rejects.toBeInstanceOf(ProjectNotFoundError);
            expect(workspace.keys()).toEqual([]);
        });
    });

    describe("openMany", () => {
        it("answers with the projects it opened, in the order named", async () => {
            project.projectExists.mockImplementation(async (name) => name === "Trip" || name === "House");
            project.restoreProject.mockImplementation(async (name) => ({ goal: goalNamed(name), inbox: [] }));

            expect(await workspace.openMany(["House", "Trip"])).toEqual(["House", "Trip"]);
        });

        it("leaves out a name with nothing behind it", async () => {
            onDisk("Trip");

            expect(await workspace.openMany(["Trip", "Gone"])).toEqual(["Trip"]);
        });
    });

    describe("createDraft", () => {
        it("opens an empty project under a minted key", async () => {
            const store = await workspace.createDraft();

            expect(store.key).toBe("Untitled");
            expect(store.savedToDisk).toBe(false);
            expect(store.getState().goal.name).toBe("");
        });

        it("numbers around the projects already open", async () => {
            await workspace.createDraft();
            await workspace.createDraft();

            expect(workspace.keys()).toEqual(["Untitled", "Untitled 2"]);
        });

        it("numbers around the filenames on disk, so saving it lands on a file of its own", async () => {
            project.listExistingProjects.mockResolvedValue(["Untitled", "Untitled 2"]);

            const store = await workspace.createDraft();

            expect(store.key).toBe("Untitled 3");
        });
    });

    describe("save", () => {
        it("writes the project and records that a file holds it", async () => {
            const draft = await workspace.createDraft();
            draft.setGoal("Redecorate");

            const saved = await workspace.save(draft.key, "House");

            expect(project.saveProject).toHaveBeenCalledWith(
                "House",
                expect.objectContaining({ name: "Redecorate" }),
                [],
            );
            expect(saved.savedToDisk).toBe(true);
        });

        it("puts the project under the filename it was written to", async () => {
            const draft = await workspace.createDraft();

            await workspace.save("Untitled", "House");

            expect(workspace.keys()).toEqual(["House"]);
            expect(workspace.get("House")).toBe(draft);
            expect(draft.key).toBe("House");
        });

        it("tells every listener the project answers to a new key", async () => {
            const renames: string[][] = [];
            workspace.onRename((from, to) => renames.push([from, to]));
            await workspace.createDraft();

            await workspace.save("Untitled", "House");

            expect(renames).toEqual([["Untitled", "House"]]);
        });

        it("keeps writing to the same file without renaming anything", async () => {
            onDisk("Trip");
            const renames: string[][] = [];
            workspace.onRename((from, to) => renames.push([from, to]));
            await workspace.open("Trip");

            await workspace.save("Trip", "Trip");

            expect(renames).toEqual([]);
            expect(workspace.keys()).toEqual(["Trip"]);
        });

        it("refuses a filename another open project already holds", async () => {
            onDisk("Trip");
            await workspace.open("Trip");
            await workspace.createDraft();

            await expect(workspace.save("Untitled", "Trip")).rejects.toBeInstanceOf(ProjectAlreadyOpenError);
            expect(project.saveProject).not.toHaveBeenCalled();
        });

        it("reports a key it does not hold", async () => {
            await expect(workspace.save("Nothing", "House")).rejects.toBeInstanceOf(ProjectNotOpenError);
        });
    });

    describe("reload", () => {
        it("re-reads the project from disk, discarding what it held", async () => {
            onDisk("Trip", "Get to Lisbon");
            const store = await workspace.open("Trip");
            store.setGoal("Something else");

            await workspace.reload("Trip");

            expect(store.getState().goal.name).toBe("Get to Lisbon");
            expect(workspace.keys()).toEqual(["Trip"]);
        });

        it("reports that nothing on disk holds a project whose file has gone", async () => {
            onDisk("Trip");
            const store = await workspace.open("Trip");
            project.projectExists.mockResolvedValue(false);

            await workspace.reload("Trip");

            expect(store.savedToDisk).toBe(false);
        });
    });

    describe("delete", () => {
        it("removes the file and leaves the work on screen with nothing behind it", async () => {
            onDisk("Trip");
            const store = await workspace.open("Trip");

            const affected = await workspace.delete("Trip");

            expect(project.deleteProject).toHaveBeenCalledWith("Trip");
            expect(affected).toBe(store);
            expect(store.savedToDisk).toBe(false);
            expect(workspace.keys()).toEqual(["Trip"]);
        });

        it("answers with nothing when no session has the project open", async () => {
            expect(await workspace.delete("Trip")).toBeNull();
        });
    });

    describe("viewState", () => {
        it("returns the projects named, in the order named", async () => {
            project.projectExists.mockResolvedValue(true);
            project.restoreProject.mockImplementation(async (name) => ({ goal: goalNamed(name), inbox: [] }));
            await workspace.open("Trip");
            await workspace.open("House");

            const view = workspace.viewState(["House", "Trip"]);

            expect(view.projects.map((entry) => entry.key)).toEqual(["House", "Trip"]);
            expect(view.assistantProject).toBeNull();
        });

        it("leaves out a key it does not hold, so a stale bookmark still renders", async () => {
            onDisk("Trip");
            await workspace.open("Trip");

            expect(workspace.viewState(["Trip", "Gone"]).projects.map((entry) => entry.key)).toEqual(["Trip"]);
        });
    });

    describe("change notification", () => {
        it("names the project that changed", async () => {
            const changed: string[] = [];
            workspace.onChange((key) => changed.push(key));
            const draft = await workspace.createDraft();

            draft.setGoal("Redecorate");

            expect(changed).toEqual(["Untitled"]);
        });

        it("reports a renamed project's changes under the key sessions now know it by", async () => {
            const changed: string[] = [];
            const draft = await workspace.createDraft();
            await workspace.save("Untitled", "House");
            workspace.onChange((key) => changed.push(key));

            draft.setGoal("Redecorate");

            expect(changed).toEqual(["House"]);
        });

        it("keeps a mutation from failing because a listener threw", async () => {
            jest.spyOn(console, "error").mockImplementation(() => {});
            workspace.onChange(() => {
                throw new Error("listener is broken");
            });
            const draft = await workspace.createDraft();

            expect(() => draft.setGoal("Redecorate")).not.toThrow();
        });
    });

    describe("the assistant's project", () => {
        it("starts unset", () => {
            expect(workspace.assistantProject).toBeNull();
        });

        it("is chosen from among the open projects, and told to listeners", async () => {
            const chosen: (string | null)[] = [];
            workspace.onAssistantTargetChange((key) => chosen.push(key));
            await workspace.createDraft();

            workspace.setAssistantProject("Untitled");

            expect(workspace.assistantProject).toBe("Untitled");
            expect(chosen).toEqual(["Untitled"]);
        });

        it("refuses a project nothing has open", () => {
            expect(() => workspace.setAssistantProject("Nothing")).toThrow(ProjectNotOpenError);
        });

        it("can be left unset", async () => {
            await workspace.createDraft();
            workspace.setAssistantProject("Untitled");

            workspace.setAssistantProject(null);

            expect(workspace.assistantProject).toBeNull();
        });

        it("says nothing when the choice does not move", async () => {
            await workspace.createDraft();
            workspace.setAssistantProject("Untitled");
            const chosen: (string | null)[] = [];
            workspace.onAssistantTargetChange((key) => chosen.push(key));

            workspace.setAssistantProject("Untitled");

            expect(chosen).toEqual([]);
        });

        it("follows the project when it is saved under another filename", async () => {
            await workspace.createDraft();
            workspace.setAssistantProject("Untitled");

            await workspace.save("Untitled", "House");

            expect(workspace.assistantProject).toBe("House");
        });

        it("resolves to the chosen project", async () => {
            const draft = await workspace.createDraft();
            await workspace.createDraft();
            workspace.setAssistantProject("Untitled");

            expect(workspace.assistantStore()).toBe(draft);
        });

        it("resolves to the only project open, since there is nothing else it could mean", async () => {
            const only = await workspace.createDraft();

            expect(workspace.assistantStore()).toBe(only);
        });

        it("asks for a choice when several projects are open and none has been made", async () => {
            await workspace.createDraft();
            await workspace.createDraft();

            expect(() => workspace.assistantStore()).toThrow(NoAssistantProjectError);
        });

        it("asks for a choice when nothing is open at all", () => {
            expect(() => workspace.assistantStore()).toThrow(NoAssistantProjectError);
        });
    });

    describe("finding the project a write belongs to", () => {
        it("finds the project whose tree holds a task", async () => {
            const trip = await workspace.createDraft();
            const house = await workspace.createDraft();
            trip.setGoal("Trip");
            house.setGoal("House");
            const task = house.addTask(GOAL_ID, "Choose paint");

            expect(workspace.findByTaskId(task.id)).toBe(house);
        });

        it("finds the project whose inbox holds an idea", async () => {
            await workspace.createDraft();
            const house = await workspace.createDraft();
            const idea = house.addIdea("Look at swatches");

            expect(workspace.findByIdeaId(idea.id)).toBe(house);
        });

        it("finds nothing for an id no open project holds", async () => {
            await workspace.createDraft();

            expect(workspace.findByTaskId("nobody-has-this")).toBeNull();
            expect(workspace.findByIdeaId("nobody-has-this")).toBeNull();
        });
    });

    it("is the seam an ambiguous write is reported against", () => {
        // AmbiguousProjectError is raised by command dispatch, and is defined
        // here because the workspace is what makes a write ambiguous.
        expect(new AmbiguousProjectError("undo did not say which project").name).toBe("AmbiguousProjectError");
    });
});
