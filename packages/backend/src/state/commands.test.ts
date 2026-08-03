import { mock, MockProxy } from "jest-mock-extended";
import { Author, COMMAND_NAMES, GOAL_ID } from "@blossom/common";
import { ConfirmRequiredError, dispatchCommand, COMMANDS, InvalidCommandError, UnknownCommandError } from "./commands";
import { ProjectStore, VersionConflictError } from "./projectStore";
import { Project } from "../models/project";

describe("commands", () => {
    let store: ProjectStore;
    let project: MockProxy<Project>;

    const ana: Author = { id: "ana", kind: "person" };
    const ben: Author = { id: "ben", kind: "person" };

    const run = (name: string, payload: unknown = {}, author: Author | null = null, otherCount?: number) =>
        dispatchCommand(
            { store, project, otherPeerCount: otherCount === undefined ? undefined : () => otherCount },
            name,
            payload,
            author,
        );

    beforeEach(() => {
        store = new ProjectStore();
        project = mock<Project>();
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

    it("requires a filename to save", async () => {
        await expect(run("projects/save", {})).rejects.toThrow("Filename is required");
        expect(project.saveProject).not.toHaveBeenCalled();
    });

    it("saves through the project store and reports the resulting list", async () => {
        project.listExistingProjects.mockResolvedValue(["alpha", "beta"]);

        const result: any = await run("projects/save", { filename: "alpha" });

        expect(project.saveProject).toHaveBeenCalledWith("alpha", expect.anything(), []);
        expect(result).toEqual({ projects: ["alpha", "beta"] });
        expect(store.activeProject).toBe("alpha");
    });

    it("loads a restored project into the store", async () => {
        project.restoreProject.mockResolvedValue({
            goal: { name: "Restored", id: GOAL_ID, completionState: false, plan: null as any },
            inbox: [{ id: "idea-1", text: "an idea" }],
        });

        const result: any = await run("projects/restore", { filename: "alpha" });

        expect(result.goal.name).toBe("Restored");
        expect(result.inbox).toEqual([{ id: "idea-1", text: "an idea" }]);
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

    describe("switching project while others are connected", () => {
        it("refuses without confirmation, saying how many others are here", async () => {
            const error = await run("projects/new", {}, ana, 1).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ConfirmRequiredError);
            expect((error as ConfirmRequiredError).otherCount).toBe(1);
        });

        it("goes ahead once confirmed", async () => {
            await expect(run("projects/new", { confirmed: true }, ana, 1)).resolves.toBeDefined();
        });

        it("does not ask when nobody else is connected", async () => {
            await expect(run("projects/new", {}, ana, 0)).resolves.toBeDefined();
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
