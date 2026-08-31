import express, { Express } from "express";
import request from "supertest";
import { mock, MockProxy } from "jest-mock-extended";
import { GOAL_ID, Task } from "@blossom/common";
import { createApiRouter } from "./api";
import { ProjectStore } from "../state/projectStore";
import { Workspace } from "../state/workspace";
import { InvalidProjectNameError, Project, ProjectNotFoundError } from "../models/project";

describe("api router", () => {
    let workspace: Workspace;
    let store: ProjectStore;
    let project: MockProxy<Project>;
    let app: Express;

    const buildApp = (): Express => {
        const built = express();
        built.use(express.json());
        built.use("/api", createApiRouter(workspace, project));
        return built;
    };

    beforeEach(async () => {
        project = mock<Project>();
        project.listExistingProjects.mockResolvedValue([]);
        project.projectExists.mockResolvedValue(false);
        workspace = new Workspace(project);
        // One project open, so a payload naming none is unambiguous - which is
        // exactly the shape a session looking at a single project sends.
        store = await workspace.createDraft();
        app = buildApp();
    });

    describe("GET /api/view", () => {
        it("should return the projects named, and which one the assistant works on", async () => {
            const res = await request(app).get(`/api/view?projects=${store.key}`);

            expect(res.status).toBe(200);
            expect(res.body.response.projects).toHaveLength(1);
            expect(res.body.response.projects[0].key).toBe(store.key);
            expect(res.body.response.projects[0].goal.id).toBe(GOAL_ID);
            expect(res.body.response.assistantProject).toBeNull();
        });

        it("should open a saved project the server does not hold yet", async () => {
            project.projectExists.mockResolvedValue(true);
            project.restoreProject.mockResolvedValue({
                goal: { id: GOAL_ID, name: "From disk", completionState: false, plan: null as any },
                inbox: [],
            });

            const res = await request(app).get("/api/view?projects=Trip");

            expect(res.body.response.projects.map((entry: any) => entry.key)).toEqual(["Trip"]);
        });

        it("should leave out a project name with nothing behind it", async () => {
            const res = await request(app).get(`/api/view?projects=${store.key},Gone`);

            expect(res.body.response.projects.map((entry: any) => entry.key)).toEqual([store.key]);
        });

        it("should return an empty board when no projects are named", async () => {
            const res = await request(app).get("/api/view");

            expect(res.body.response.projects).toEqual([]);
        });
    });

    describe("GET /api/view/versions", () => {
        it("should return each named project's version", async () => {
            store.setGoal("Goal");

            const res = await request(app).get(`/api/view/versions?projects=${store.key}`);

            expect(res.status).toBe(200);
            expect(res.body.response.versions).toEqual({ [store.key]: 2 });
        });

        it("should leave out a project the server does not hold", async () => {
            const res = await request(app).get("/api/view/versions?projects=Gone");

            expect(res.body.response.versions).toEqual({});
        });
    });

    describe("POST /api/goal", () => {
        it("should set the goal and return the full state", async () => {
            const res = await request(app).post("/api/goal").send({ name: "My Goal", description: "Desc" });

            expect(res.status).toBe(200);
            expect(res.body.response.goal.name).toBe("My Goal");
            expect(res.body.response.goal.description).toBe("Desc");
            expect(res.body.response.goal.plan).toEqual({ tasksList: [], dependenciesList: [] });
        });

        it("should return 400 when the name is missing", async () => {
            const res = await request(app).post("/api/goal").send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
            expect(store.getState().goal.plan).toBeNull();
        });
    });

    describe("POST /api/tasks/add", () => {
        beforeEach(() => {
            store.setGoal("Goal");
        });

        it("should add a task and return the created task plus the full state", async () => {
            const res = await request(app).post("/api/tasks/add").send({ parentId: GOAL_ID, name: "Task 1" });

            expect(res.status).toBe(200);
            expect(res.body.response.task.name).toBe("Task 1");
            expect(res.body.response.task.id).toBeDefined();
            expect(res.body.response.state.goal.plan.tasksList).toHaveLength(1);
            expect(res.body.response.state.goal.plan.tasksList[0].id).toBe(res.body.response.task.id);
        });

        it("should return 400 for an empty name", async () => {
            const res = await request(app).post("/api/tasks/add").send({ parentId: GOAL_ID, name: "" });

            expect(res.status).toBe(400);
            expect(store.getState().goal.plan!.tasksList).toHaveLength(0);
        });

        it("should return 404 for an unknown parent", async () => {
            const res = await request(app).post("/api/tasks/add").send({ parentId: "unknown", name: "Task 1" });

            expect(res.status).toBe(404);
        });
    });

    describe("POST /api/tasks/set-completion", () => {
        it("should set completion and return the full state", async () => {
            store.setGoal("Goal");
            const task = store.addTask(GOAL_ID, "Task 1");

            const res = await request(app).post("/api/tasks/set-completion").send({ taskId: task.id, completed: true });

            expect(res.status).toBe(200);
            expect(res.body.response.goal.plan.tasksList[0].completionState).toBe(true);
        });

        it("should return 404 for an unknown task", async () => {
            store.setGoal("Goal");

            const res = await request(app)
                .post("/api/tasks/set-completion")
                .send({ taskId: "unknown", completed: true });

            expect(res.status).toBe(404);
        });
    });

    describe("POST /api/tasks/remove", () => {
        it("should remove the task and return the full state", async () => {
            store.setGoal("Goal");
            const task = store.addTask(GOAL_ID, "Task 1");

            const res = await request(app).post("/api/tasks/remove").send({ taskId: task.id });

            expect(res.status).toBe(200);
            expect(res.body.response.goal.plan.tasksList).toHaveLength(0);
        });
    });

    describe("POST /api/dependencies/add", () => {
        it("should add a dependency and return the full state", async () => {
            store.setGoal("Goal");
            const task1 = store.addTask(GOAL_ID, "Task 1");
            const task2 = store.addTask(GOAL_ID, "Task 2");

            const res = await request(app)
                .post("/api/dependencies/add")
                .send({ sourceId: task1.id, targetId: task2.id });

            expect(res.status).toBe(200);
            expect(res.body.response.goal.plan.dependenciesList).toEqual([{ source: task1.id, target: task2.id }]);
        });

        it("should return 400 for a self-dependency", async () => {
            store.setGoal("Goal");
            const task = store.addTask(GOAL_ID, "Task 1");

            const res = await request(app).post("/api/dependencies/add").send({ sourceId: task.id, targetId: task.id });

            expect(res.status).toBe(400);
            expect(store.getState().goal.plan!.dependenciesList).toHaveLength(0);
        });
    });

    describe("inbox endpoints", () => {
        it("should add an idea", async () => {
            const res = await request(app).post("/api/inbox/add").send({ text: "idea 1" });

            expect(res.status).toBe(200);
            expect(res.body.response.inbox).toEqual([{ id: expect.any(String), text: "idea 1" }]);
        });

        it("should update an idea", async () => {
            store.addIdea("original");

            const res = await request(app).post("/api/inbox/update").send({ index: 0, text: "updated" });

            expect(res.status).toBe(200);
            expect(res.body.response.inbox).toEqual([{ id: expect.any(String), text: "updated" }]);
        });

        it("should remove an idea", async () => {
            store.addIdea("idea 1");

            const res = await request(app).post("/api/inbox/remove").send({ index: 0 });

            expect(res.status).toBe(200);
            expect(res.body.response.inbox).toEqual([]);
        });

        it("should promote an idea into a task", async () => {
            store.setGoal("Goal");
            store.addIdea("promote me");

            const res = await request(app).post("/api/inbox/promote").send({ index: 0 });

            expect(res.status).toBe(200);
            expect(res.body.response.inbox).toEqual([]);
            expect(res.body.response.goal.plan.tasksList).toHaveLength(1);
            expect(res.body.response.goal.plan.tasksList[0].name).toBe("promote me");
        });

        it("should return 400 for an invalid index", async () => {
            const res = await request(app).post("/api/inbox/remove").send({ index: 5 });

            expect(res.status).toBe(400);
        });
    });

    describe("POST /api/undo", () => {
        it("should undo the last mutation and return the full state", async () => {
            store.setGoal("Goal");
            store.addTask(GOAL_ID, "Task 1");

            const res = await request(app).post("/api/undo").send({});

            expect(res.status).toBe(200);
            expect(res.body.response.goal.plan.tasksList).toHaveLength(0);
        });

        it("should still return 200 with state when there is nothing to undo", async () => {
            const res = await request(app).post("/api/undo").send({});

            expect(res.status).toBe(200);
            expect(res.body.response.version).toBe(1);
        });
    });

    describe("GET /api/projects", () => {
        it("should list projects from the project model", async () => {
            project.listExistingProjects.mockResolvedValue(["project1", "project2"]);

            const res = await request(app).get("/api/projects");

            expect(res.status).toBe(200);
            expect(res.body.response).toEqual({
                projects: ["project1", "project2"],
                open: [store.key],
                assistantProject: null,
            });
        });

        it("should return 500 when listing fails", async () => {
            project.listExistingProjects.mockRejectedValue(new Error("disk error"));

            const res = await request(app).get("/api/projects");

            expect(res.status).toBe(500);
        });
    });

    describe("POST /api/projects/new", () => {
        it("should open an empty project alongside the one already open", async () => {
            store.setGoal("Goal");
            store.addIdea("idea");

            const res = await request(app).post("/api/projects/new").send({});

            expect(res.status).toBe(200);
            expect(res.body.response.key).toBe("Untitled 2");
            expect(res.body.response.savedToDisk).toBe(false);
            expect(res.body.response.goal.name).toBe("");
            expect(res.body.response.inbox).toEqual([]);
            // The project that was already open is untouched
            expect(store.getState().goal.name).toBe("Goal");
        });
    });

    describe("POST /api/projects/save", () => {
        it("should return 400 when the filename is missing", async () => {
            const res = await request(app).post("/api/projects/save").send({});

            expect(res.status).toBe(400);
            expect(project.saveProject).not.toHaveBeenCalled();
        });

        it("should save and put the project under the filename it was written to", async () => {
            store.setGoal("Goal");
            store.addIdea("idea");
            project.listExistingProjects.mockResolvedValue(["myProject"]);

            const res = await request(app).post("/api/projects/save").send({ filename: "myProject" });

            expect(res.status).toBe(200);
            expect(res.body.response.projects).toEqual(["myProject"]);
            expect(res.body.response.state.key).toBe("myProject");
            expect(res.body.response.state.savedToDisk).toBe(true);
            expect(project.saveProject).toHaveBeenCalledWith(
                "myProject",
                expect.objectContaining({ id: GOAL_ID, name: "Goal" }),
                [{ id: expect.any(String), text: "idea" }],
            );
            expect(workspace.keys()).toEqual(["myProject"]);
        });

        it("should return 500 when saving fails", async () => {
            project.saveProject.mockRejectedValue(new Error("disk error"));

            const res = await request(app).post("/api/projects/save").send({ filename: "myProject" });

            expect(res.status).toBe(500);
        });
    });

    describe("POST /api/projects/open", () => {
        const restoredGoal: Task = {
            id: "",
            name: "Restored Goal",
            completionState: false,
            plan: { tasksList: [], dependenciesList: [] },
        };

        beforeEach(() => {
            project.projectExists.mockResolvedValue(true);
            project.restoreProject.mockResolvedValue({
                goal: restoredGoal,
                inbox: [{ id: "idea-1", text: "saved idea" }],
            });
        });

        it("should read the project from disk and key it by its filename", async () => {
            const res = await request(app).post("/api/projects/open").send({ filename: "myProject" });

            expect(res.status).toBe(200);
            expect(project.restoreProject).toHaveBeenCalledWith("myProject");
            // Legacy empty root id is normalized to the goal sentinel
            expect(res.body.response.goal.id).toBe(GOAL_ID);
            expect(res.body.response.goal.name).toBe("Restored Goal");
            expect(res.body.response.inbox).toEqual([{ id: "idea-1", text: "saved idea" }]);
            expect(res.body.response.key).toBe("myProject");
            expect(res.body.response.savedToDisk).toBe(true);
        });

        it("should leave the project already open exactly as it was", async () => {
            store.setGoal("Mine");

            await request(app).post("/api/projects/open").send({ filename: "myProject" });

            expect(store.getState().goal.name).toBe("Mine");
        });

        it("should return 404 for a filename with nothing behind it", async () => {
            project.projectExists.mockResolvedValue(false);

            const res = await request(app).post("/api/projects/open").send({ filename: "gone" });

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("not-found");
        });
    });

    describe("POST /api/projects/reload", () => {
        it("should re-read the project from disk, discarding what is on screen", async () => {
            project.projectExists.mockResolvedValue(true);
            project.restoreProject.mockResolvedValue({
                goal: { id: GOAL_ID, name: "On disk", completionState: false, plan: null as any },
                inbox: [],
            });
            store.setGoal("Only in memory");

            const res = await request(app).post("/api/projects/reload").send({ projectKey: store.key });

            expect(res.status).toBe(200);
            expect(res.body.response.goal.name).toBe("On disk");
        });

        it("should return 404 for a project the server does not hold", async () => {
            const res = await request(app).post("/api/projects/reload").send({ projectKey: "Gone" });

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("not-found");
        });
    });

    describe("POST /api/projects/delete", () => {
        it("should return 400 when the filename is missing", async () => {
            const res = await request(app).post("/api/projects/delete").send({});

            expect(res.status).toBe(400);
            expect(project.deleteProject).not.toHaveBeenCalled();
        });

        it("should delete the file and return the projects that remain", async () => {
            project.listExistingProjects.mockResolvedValue(["keptProject"]);

            const res = await request(app).post("/api/projects/delete").send({ filename: "oldProject" });

            expect(res.status).toBe(200);
            expect(project.deleteProject).toHaveBeenCalledWith("oldProject");
            expect(res.body.response.projects).toEqual(["keptProject"]);
            // Nobody had that project open, so there is no state to report back
            expect(res.body.response.state).toBeUndefined();
        });

        it("should leave the open project on screen with no file behind it", async () => {
            store.setGoal("Ship it");
            await request(app).post("/api/projects/save").send({ filename: "myProject" });
            project.listExistingProjects.mockResolvedValue([]);

            const res = await request(app).post("/api/projects/delete").send({ filename: "myProject" });

            expect(res.status).toBe(200);
            expect(res.body.response.state.savedToDisk).toBe(false);
            expect(res.body.response.state.goal.name).toBe("Ship it");
        });

        it("should return 404 when the project has no file", async () => {
            project.deleteProject.mockRejectedValue(new ProjectNotFoundError("gone"));

            const res = await request(app).post("/api/projects/delete").send({ filename: "gone" });

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("not-found");
        });

        it("should return 400 for a name that addresses a file outside the projects folder", async () => {
            project.deleteProject.mockRejectedValue(new InvalidProjectNameError("../escape"));

            const res = await request(app).post("/api/projects/delete").send({ filename: "../escape" });

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("invalid");
        });
    });

    describe("POST /api/assistant/target", () => {
        it("should choose which project the assistant works on", async () => {
            const res = await request(app).post("/api/assistant/target").send({ projectKey: store.key });

            expect(res.status).toBe(200);
            expect(res.body.response).toEqual({ assistantProject: store.key });
        });

        it("should return 404 for a project the server does not hold", async () => {
            const res = await request(app).post("/api/assistant/target").send({ projectKey: "Gone" });

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("not-found");
        });

        it("should return 400 when the payload names neither a key nor null", async () => {
            const res = await request(app).post("/api/assistant/target").send({});

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("invalid");
        });
    });

    describe("writes that do not say which project they mean", () => {
        it("should return 400 naming the ambiguity when several projects are open", async () => {
            await workspace.createDraft();

            const res = await request(app).post("/api/undo").send({});

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("invalid");
            expect(res.body.error).toContain("projectKey");
        });
    });

    describe("error responses", () => {
        it("should carry the same machine-readable code the socket would send", async () => {
            store.setGoal("Ship it");
            const stale = store.getVersion();
            store.addIdea("meanwhile, somebody else changed something");

            const res = await request(app).post("/api/goal").send({ name: "Ship something else", baseVersion: stale });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("conflict");
            // The rejected caller is holding stale state, so it gets the real one.
            expect(res.body.response.version).toBe(store.getVersion());
        });

        it("should distinguish a blocked undo from an ordinary conflict", async () => {
            store.runAs({ id: "somebody-else", kind: "person" }, () => store.setGoal("Their goal"));

            const res = await request(app)
                .post("/api/undo")
                .set("X-Blossom-Author", JSON.stringify({ id: "me", kind: "person" }))
                .send({});

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("undo-blocked");
            expect(store.getState().goal.name).toBe("Their goal");
        });

        it("should code a missing task as not-found", async () => {
            const res = await request(app).post("/api/tasks/remove").send({ taskId: "nope" });

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("not-found");
        });

        it("should code a malformed payload as invalid", async () => {
            const res = await request(app).post("/api/goal").send({});

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("invalid");
        });
    });
});
