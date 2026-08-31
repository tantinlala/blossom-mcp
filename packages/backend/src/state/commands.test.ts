import { mock, MockProxy } from "jest-mock-extended";
import { Author, COMMAND_NAMES, GOAL_ID } from "@blossom/common";
import { dispatchCommand, COMMANDS, InvalidCommandError, projectFor, UnknownCommandError } from "./commands";
import { ProjectStore, VersionConflictError } from "./projectStore";
import { AmbiguousProjectError, ProjectNotOpenError, Workspace } from "./workspace";
import { Project } from "../models/project";

describe("commands", () => {
    let project: MockProxy<Project>;
    let workspace: Workspace;
    let store: ProjectStore;

    const ana: Author = { id: "ana", kind: "person" };
    const ben: Author = { id: "ben", kind: "person" };

    const run = (name: string, payload: unknown = {}, author: Author | null = null) =>
        dispatchCommand({ workspace, project }, name, payload, author);

    beforeEach(async () => {
        project = mock<Project>();
        project.listExistingProjects.mockResolvedValue([]);
        project.projectExists.mockResolvedValue(false);
        workspace = new Workspace(project);
        store = await workspace.createDraft();
    });

    it("registers a handler for every command name in the shared protocol", () => {
        expect(Object.keys(COMMANDS).sort()).toEqual([...COMMAND_NAMES].sort());
    });

    it("rejects a name it does not know", async () => {
        await expect(run("tasks/detonate")).rejects.toBeInstanceOf(UnknownCommandError);
    });

    it("returns the full new state so the caller cannot drift", async () => {
        const result: any = await run("goal", { name: "Ship it" });

        expect(result.goal.name).toBe("Ship it");
        expect(result.version).toBe(store.getVersion());
        expect(result.key).toBe(store.key);
    });

    it("keeps the bespoke shape for adding a task", async () => {
        const result: any = await run("tasks/add", { parentId: GOAL_ID, name: "Do the thing" });

        expect(result.task.name).toBe("Do the thing");
        expect(result.state.version).toBe(store.getVersion());
    });

    it("requires a task name", async () => {
        await expect(run("tasks/add", { parentId: GOAL_ID, name: "" })).rejects.toThrow("Task name is required");
    });

    it("requires a goal name", async () => {
        await expect(run("goal", {})).rejects.toThrow("Goal name is required");
    });

    describe("which project a command acts on", () => {
        let house: ProjectStore;

        beforeEach(async () => {
            house = await workspace.createDraft();
            store.setGoal("Trip");
            house.setGoal("House");
        });

        it("writes to the project the payload names", async () => {
            await run("tasks/add", { projectKey: house.key, parentId: GOAL_ID, name: "Choose paint" });

            expect(house.getState().goal.plan.tasksList).toHaveLength(1);
            expect(store.getState().goal.plan.tasksList).toHaveLength(0);
        });

        it("reports a project key nothing has open", async () => {
            await expect(
                run("tasks/add", { projectKey: "Nothing", parentId: GOAL_ID, name: "Choose paint" }),
            ).rejects.toBeInstanceOf(ProjectNotOpenError);
        });

        it("works out the project from a task id, which belongs to exactly one", async () => {
            const task = house.addTask(GOAL_ID, "Choose paint");

            const result: any = await run("tasks/update", { taskId: task.id, name: "Choose a colour" });

            expect(result.key).toBe(house.key);
            expect(house.findTask(task.id)!.name).toBe("Choose a colour");
        });

        it("works out the project from an inbox idea id", async () => {
            const idea = house.addIdea("Look at swatches");

            const result: any = await run("inbox/remove", { ideaId: idea.id });

            expect(result.key).toBe(house.key);
            expect(house.getState().inbox).toEqual([]);
        });

        it("needs no saying when only one project is open", async () => {
            const alone = new Workspace(project);
            const only = await alone.createDraft();

            const result: any = await dispatchCommand({ workspace: alone, project }, "goal", { name: "Ship it" });

            expect(result.key).toBe(only.key);
        });

        it("reports the ambiguity when several are open and the payload names none", async () => {
            const error = await run("undo", {}).catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(AmbiguousProjectError);
            expect((error as Error).message).toContain("projectKey");
            expect((error as Error).message).toContain(house.key);
        });

        it("settles nothing from the goal sentinel, which every project answers to", async () => {
            await expect(run("tasks/add", { parentId: GOAL_ID, name: "Choose paint" })).rejects.toBeInstanceOf(
                AmbiguousProjectError,
            );
        });

        it("resolves the project a failed write was aimed at, for the reply that carries its state", () => {
            expect(projectFor({ workspace, project }, "goal", { projectKey: house.key })).toBe(house);
        });
    });

    describe("project housekeeping", () => {
        it("opens an empty project, which the caller puts on its own board", async () => {
            const result: any = await run("projects/new");

            expect(result.key).toBe("Untitled 2");
            expect(result.savedToDisk).toBe(false);
            expect(result.goal.name).toBe("");
        });

        it("requires a filename to save", async () => {
            await expect(run("projects/save", {})).rejects.toThrow("Filename is required");
            expect(project.saveProject).not.toHaveBeenCalled();
        });

        it("saves through the workspace and reports the resulting list", async () => {
            project.listExistingProjects.mockResolvedValue(["alpha", "beta"]);

            const result: any = await run("projects/save", { filename: "alpha" });

            expect(project.saveProject).toHaveBeenCalledWith("alpha", expect.anything(), []);
            expect(result.projects).toEqual(["alpha", "beta"]);
            expect(result.state.key).toBe("alpha");
            expect(result.state.savedToDisk).toBe(true);
        });

        it("opens a saved project", async () => {
            project.projectExists.mockResolvedValue(true);
            project.restoreProject.mockResolvedValue({
                goal: { name: "Restored", id: GOAL_ID, completionState: false, plan: null as any },
                inbox: [{ id: "idea-1", text: "an idea" }],
            });

            const result: any = await run("projects/open", { filename: "alpha" });

            expect(result.key).toBe("alpha");
            expect(result.goal.name).toBe("Restored");
            expect(result.inbox).toEqual([{ id: "idea-1", text: "an idea" }]);
        });

        it("re-reads an open project from disk, discarding what is on screen", async () => {
            project.projectExists.mockResolvedValue(true);
            project.restoreProject.mockResolvedValue({
                goal: { name: "On disk", id: GOAL_ID, completionState: false, plan: null as any },
                inbox: [],
            });
            await run("goal", { projectKey: store.key, name: "Only in memory" });

            const result: any = await run("projects/reload", { projectKey: store.key });

            expect(result.goal.name).toBe("On disk");
        });

        it("deletes a file and reports the project it left with nothing behind it", async () => {
            project.listExistingProjects.mockResolvedValue([]);
            await run("projects/save", { filename: "alpha" });

            const result: any = await run("projects/delete", { filename: "alpha" });

            expect(project.deleteProject).toHaveBeenCalledWith("alpha");
            expect(result.state.key).toBe("alpha");
            expect(result.state.savedToDisk).toBe(false);
        });

        it("omits the state when no session has the deleted project open", async () => {
            const result: any = await run("projects/delete", { filename: "never-opened" });

            expect(result.state).toBeUndefined();
            expect(result.projects).toEqual([]);
        });
    });

    describe("the assistant's project", () => {
        it("is chosen by key", async () => {
            const result: any = await run("assistant/target", { projectKey: store.key });

            expect(result).toEqual({ assistantProject: store.key });
            expect(workspace.assistantProject).toBe(store.key);
        });

        it("can be left unset", async () => {
            await run("assistant/target", { projectKey: store.key });

            const result: any = await run("assistant/target", { projectKey: null });

            expect(result).toEqual({ assistantProject: null });
        });

        it("needs a key or an outright null", async () => {
            await expect(run("assistant/target", {})).rejects.toBeInstanceOf(InvalidCommandError);
        });
    });

    describe("attribution", () => {
        it("records who made a change", async () => {
            await run("goal", { name: "Ship it" }, ana);

            expect(store.lastChangeAuthor).toEqual(ana);
        });

        it("leaves changes unattributed when there is no author", async () => {
            await run("goal", { name: "Ship it" });

            expect(store.lastChangeAuthor).toBeNull();
        });

        it("records the author against the project the command landed in", async () => {
            const house = await workspace.createDraft();

            await run("goal", { projectKey: house.key, name: "Redecorate" }, ana);

            expect(house.lastChangeAuthor).toEqual(ana);
            expect(store.lastChangeAuthor).toBeNull();
        });
    });

    describe("preconditions", () => {
        it("refuses a goal edit started before somebody else's change", async () => {
            await run("goal", { name: "Ship it" }, ana);
            const staleVersion = store.getVersion();
            await run("inbox/add", { text: "meanwhile" }, ben);

            await expect(
                run("goal", { name: "Ship something else", baseVersion: staleVersion }, ana),
            ).rejects.toBeInstanceOf(VersionConflictError);
        });

        it("allows an edit whose baseVersion is still current", async () => {
            await run("goal", { name: "Ship it" }, ana);

            await expect(
                run("goal", { name: "Ship it well", baseVersion: store.getVersion() }, ana),
            ).resolves.toBeDefined();
        });

        it("refuses an inbox edit whose row no longer holds what the caller saw", async () => {
            await run("inbox/add", { text: "theirs" }, ben);

            await expect(
                run("inbox/update", { index: 0, text: "mine", expectedText: "something else" }, ana),
            ).rejects.toBeInstanceOf(VersionConflictError);
        });

        it("refuses a delete aimed at a row that has shifted underneath", async () => {
            await run("inbox/add", { text: "second" }, ana);
            // Adding an idea unshifts, so index 0 is no longer what Ana was looking at.
            await run("inbox/add", { text: "first" }, ben);

            await expect(run("inbox/remove", { index: 0, expectedText: "second" }, ana)).rejects.toBeInstanceOf(
                VersionConflictError,
            );
        });
    });

    describe("naming an inbox idea", () => {
        it("addresses the idea by ideaId wherever it now sits", async () => {
            await run("inbox/add", { text: "mine" });
            const [idea] = store.getState().inbox;
            await run("inbox/add", { text: "added above it" });

            const result: any = await run("inbox/update", { ideaId: idea.id, text: "mine, edited" });

            expect(result.inbox.map((entry: any) => entry.text)).toEqual(["added above it", "mine, edited"]);
        });

        it("prefers ideaId over an index that points elsewhere", async () => {
            await run("inbox/add", { text: "mine" });
            const [idea] = store.getState().inbox;
            await run("inbox/add", { text: "added above it" });

            const result: any = await run("inbox/remove", { ideaId: idea.id, index: 0 });

            expect(result.inbox.map((entry: any) => entry.text)).toEqual(["added above it"]);
        });

        it("rejects a payload naming no idea at all", async () => {
            await run("inbox/add", { text: "mine" });

            await expect(run("inbox/remove", {})).rejects.toBeInstanceOf(InvalidCommandError);
            await expect(run("inbox/update", { text: "mine, edited" })).rejects.toBeInstanceOf(InvalidCommandError);
            await expect(run("inbox/promote", {})).rejects.toBeInstanceOf(InvalidCommandError);
            expect(store.getState().inbox).toHaveLength(1);
        });

        it("rejects an index that is not an integer position", async () => {
            await run("inbox/add", { text: "mine" });

            await expect(run("inbox/remove", { index: "0" })).rejects.toBeInstanceOf(InvalidCommandError);
            await expect(run("inbox/remove", { index: 1.5 })).rejects.toBeInstanceOf(InvalidCommandError);
            expect(store.getState().inbox).toHaveLength(1);
        });
    });

    it("promotes the whole inbox in one command", async () => {
        await run("inbox/add", { text: "a" });
        await run("inbox/add", { text: "b" });

        const result: any = await run("inbox/promote-all", { parentId: GOAL_ID });

        expect(result.inbox).toEqual([]);
        expect(result.goal.plan.tasksList).toHaveLength(2);
    });
});
