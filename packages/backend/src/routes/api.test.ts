import express, { Express } from "express";
import request from "supertest";
import { mock, MockProxy } from "jest-mock-extended";
import { GOAL_ID, Task } from "@blossom/common";
import { createApiRouter } from "./api";
import { ProjectStore } from "../state/projectStore";
import { InvalidProjectNameError, Project, ProjectNotFoundError } from "../models/project";

describe("api router", () => {
    let store: ProjectStore;
    let project: MockProxy<Project>;
    let app: Express;

    const buildApp = (): Express => {
        const built = express();
        built.use(express.json());
        built.use("/api", createApiRouter(store, project));
        return built;
    };

    beforeEach(() => {
        store = new ProjectStore();
        project = mock<Project>();
        app = buildApp();
    });

    describe("GET /api/state", () => {
        it("should return the full project state", async () => {
            const res = await request(app).get("/api/state");

            expect(res.status).toBe(200);
            expect(res.body.response.version).toBe(1);
            expect(res.body.response.goal.id).toBe(GOAL_ID);
            expect(res.body.response.goal.plan).toBeNull();
            expect(res.body.response.inbox).toEqual([]);
        });
    });

    describe("GET /api/state/version", () => {
        it("should return only the version", async () => {
            store.setGoal("Goal");

            const res = await request(app).get("/api/state/version");

            expect(res.status).toBe(200);
            expect(res.body.response).toEqual({ version: 2 });
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
            expect(res.body.response.inbox).toEqual(["idea 1"]);
        });

        it("should update an idea", async () => {
            store.addIdea("original");

            const res = await request(app).post("/api/inbox/update").send({ index: 0, text: "updated" });

            expect(res.status).toBe(200);
            expect(res.body.response.inbox).toEqual(["updated"]);
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
            expect(res.body.response).toEqual({ projects: ["project1", "project2"] });
        });

        it("should return 500 when listing fails", async () => {
            project.listExistingProjects.mockRejectedValue(new Error("disk error"));

            const res = await request(app).get("/api/projects");

            expect(res.status).toBe(500);
        });
    });

    describe("POST /api/projects/new", () => {
        it("should reset the store and return the empty state", async () => {
            store.setGoal("Goal");
            store.addIdea("idea");

            const res = await request(app).post("/api/projects/new").send({});

            expect(res.status).toBe(200);
            expect(res.body.response.goal.name).toBe("");
            expect(res.body.response.goal.plan).toBeNull();
            expect(res.body.response.inbox).toEqual([]);
            expect(res.body.response.activeProject).toBeNull();
        });
    });

    describe("POST /api/projects/save", () => {
        it("should return 400 when the filename is missing", async () => {
            const res = await request(app).post("/api/projects/save").send({});

            expect(res.status).toBe(400);
            expect(project.saveProject).not.toHaveBeenCalled();
        });

        it("should save, set the active project and return the projects list", async () => {
            store.setGoal("Goal");
            store.addIdea("idea");
            project.listExistingProjects.mockResolvedValue(["myProject"]);

            const res = await request(app).post("/api/projects/save").send({ filename: "myProject" });

            expect(res.status).toBe(200);
            expect(res.body.response).toEqual({ projects: ["myProject"] });
            expect(project.saveProject).toHaveBeenCalledWith(
                "myProject",
                expect.objectContaining({ id: GOAL_ID, name: "Goal" }),
                ["idea"],
            );
            expect(store.activeProject).toBe("myProject");
        });

        it("should return 500 when saving fails", async () => {
            project.saveProject.mockRejectedValue(new Error("disk error"));

            const res = await request(app).post("/api/projects/save").send({ filename: "myProject" });

            expect(res.status).toBe(500);
        });
    });

    describe("POST /api/projects/restore", () => {
        it("should load the restored project into the store", async () => {
            const restoredGoal: Task = {
                id: "",
                name: "Restored Goal",
                completionState: false,
                plan: { tasksList: [], dependenciesList: [] },
            };
            project.restoreProject.mockResolvedValue({ goal: restoredGoal, inbox: ["saved idea"] });

            const res = await request(app).post("/api/projects/restore").send({ filename: "myProject" });

            expect(res.status).toBe(200);
            expect(project.restoreProject).toHaveBeenCalledWith("myProject");
            // Legacy empty root id is normalized to the goal sentinel
            expect(res.body.response.goal.id).toBe(GOAL_ID);
            expect(res.body.response.goal.name).toBe("Restored Goal");
            expect(res.body.response.inbox).toEqual(["saved idea"]);
            expect(res.body.response.activeProject).toBe("myProject");
        });
    });

    describe("POST /api/projects/delete", () => {
        it("should return 400 when the filename is missing", async () => {
            const res = await request(app).post("/api/projects/delete").send({});

            expect(res.status).toBe(400);
            expect(project.deleteProject).not.toHaveBeenCalled();
        });

        it("should delete the file and return the projects that remain", async () => {
            store.setActiveProject("keptProject");
            project.listExistingProjects.mockResolvedValue(["keptProject"]);

            const res = await request(app).post("/api/projects/delete").send({ filename: "oldProject" });

            expect(res.status).toBe(200);
            expect(project.deleteProject).toHaveBeenCalledWith("oldProject");
            expect(res.body.response.projects).toEqual(["keptProject"]);
            // Deleting some other project leaves the open one alone
            expect(res.body.response.state.activeProject).toBe("keptProject");
            expect(store.activeProject).toBe("keptProject");
        });

        it("should leave the open project on screen with no file behind it", async () => {
            store.setGoal("Ship it");
            store.setActiveProject("myProject");
            project.listExistingProjects.mockResolvedValue([]);

            const res = await request(app).post("/api/projects/delete").send({ filename: "myProject" });

            expect(res.status).toBe(200);
            expect(res.body.response.state.activeProject).toBeNull();
            expect(res.body.response.state.goal.name).toBe("Ship it");
            expect(store.activeProject).toBeNull();
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

    describe("GET /api/projects/active", () => {
        it("should return the active project name", async () => {
            store.setActiveProject("myProject");

            const res = await request(app).get("/api/projects/active");

            expect(res.status).toBe(200);
            expect(res.body.response).toEqual({ activeProject: "myProject" });
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
