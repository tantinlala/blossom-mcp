import { InvalidProjectNameError, Project, ProjectNotFoundError } from "./project";
import { FileIO } from "../utils/fileIO";
import { Task, StoredProjectV2 } from "@blossom/common";

jest.mock("../utils/fileIO");

describe("Project", () => {
    let fileIO: jest.Mocked<FileIO>;
    let project: Project;

    const goal: Task = {
        name: "Test Goal",
        description: "Test Description",
        id: "123",
        completionState: false,
        plan: { tasksList: [], dependenciesList: [] },
    };

    beforeEach(() => {
        fileIO = new FileIO() as jest.Mocked<FileIO>;
        fileIO.writeFile = jest.fn();
        fileIO.readFile = jest.fn();
        fileIO.exists = jest.fn();
        fileIO.readdir = jest.fn();
        fileIO.mkdir = jest.fn();
        fileIO.unlink = jest.fn();
        project = new Project(fileIO);
    });

    it("should save a project in v2 format", async () => {
        fileIO.exists.mockResolvedValue(true);

        await project.saveProject("testProject", goal, ["idea 1", "idea 2"]);

        expect(fileIO.mkdir).not.toHaveBeenCalled();
        expect(fileIO.writeFile).toHaveBeenCalledWith(
            "./projects/testProject.txt",
            JSON.stringify({
                formatVersion: 2,
                goal,
                inbox: ["idea 1", "idea 2"],
            }),
        );
    });

    it("should create projects directory if it does not exist when saving", async () => {
        fileIO.exists.mockResolvedValue(false);

        await project.saveProject("testProject", goal, []);

        expect(fileIO.mkdir).toHaveBeenCalledWith("./projects");
        expect(fileIO.writeFile).toHaveBeenCalled();
    });

    it("should list existing projects", async () => {
        fileIO.exists.mockResolvedValue(true);
        fileIO.readdir.mockResolvedValue(["project1.txt", "project2.txt", "notAProject.doc"]);

        const projects = await project.listExistingProjects();

        expect(projects).toEqual(["project1", "project2"]);
    });

    it("should return an empty array if no projects exist", async () => {
        fileIO.exists.mockResolvedValue(true);
        fileIO.readdir.mockResolvedValue([]);

        const projects = await project.listExistingProjects();

        expect(projects).toEqual([]);
    });

    it("should return an empty array if the projects folder does not exist", async () => {
        fileIO.exists.mockResolvedValue(false);

        const projects = await project.listExistingProjects();

        expect(projects).toEqual([]);
        expect(fileIO.readdir).not.toHaveBeenCalled();
    });

    it("should restore a v2 project", async () => {
        const projectData: StoredProjectV2 = {
            formatVersion: 2,
            goal,
            inbox: ["idea 1"],
        };
        fileIO.exists.mockResolvedValue(true);
        fileIO.readFile.mockResolvedValue(JSON.stringify(projectData));

        const result = await project.restoreProject("testProject");

        expect(result).toEqual({ goal, inbox: ["idea 1"] });
    });

    it("should return an empty project for a non-v2 (legacy) file", async () => {
        const legacyData = {
            messages: [{ message: { sender: "user", message: "hello" }, userFacing: true }],
            goal,
            recommendedTasks: ["task a", "task b"],
        };
        fileIO.exists.mockResolvedValue(true);
        fileIO.readFile.mockResolvedValue(JSON.stringify(legacyData));

        const result = await project.restoreProject("legacyProject");

        expect(result).toEqual({ goal: project.emptyGoal, inbox: [] });
    });

    it("should return an empty project if the file does not exist", async () => {
        fileIO.exists.mockResolvedValue(false);

        const result = await project.restoreProject("nonExistentProject");

        expect(result).toEqual({ goal: project.emptyGoal, inbox: [] });
    });

    it("should return an empty project if the file content is not a string", async () => {
        fileIO.exists.mockResolvedValue(true);
        fileIO.readFile.mockResolvedValue(null); // Simulating non-string content

        const result = await project.restoreProject("invalidProject");

        expect(result).toEqual({ goal: project.emptyGoal, inbox: [] });
    });

    it("should delete a project's file", async () => {
        await project.deleteProject("testProject");

        expect(fileIO.unlink).toHaveBeenCalledWith("./projects/testProject.txt");
    });

    it("should report a project that has no file", async () => {
        const missing: NodeJS.ErrnoException = new Error("ENOENT: no such file or directory");
        missing.code = "ENOENT";
        fileIO.unlink.mockRejectedValue(missing);

        await expect(project.deleteProject("missingProject")).rejects.toThrow(ProjectNotFoundError);
    });

    it("should report a file that cannot be removed as itself", async () => {
        const denied: NodeJS.ErrnoException = new Error("EACCES: permission denied");
        denied.code = "EACCES";
        fileIO.unlink.mockRejectedValue(denied);

        // Only a missing file is a missing project; anything else is a real
        // failure and must not be dressed up as one.
        await expect(project.deleteProject("lockedProject")).rejects.toThrow("EACCES: permission denied");
    });

    it.each(["../secrets", "nested/project", "back\\slash", "..", ""])(
        "should refuse to delete the name %p, which addresses a file outside the projects folder",
        async (filename) => {
            await expect(project.deleteProject(filename)).rejects.toThrow(InvalidProjectNameError);
            expect(fileIO.unlink).not.toHaveBeenCalled();
        },
    );

    it("should refuse to save under a name that escapes the projects folder", async () => {
        await expect(project.saveProject("../escape", goal, [])).rejects.toThrow(InvalidProjectNameError);
        expect(fileIO.writeFile).not.toHaveBeenCalled();
    });

    it("should refuse to restore a name that escapes the projects folder", async () => {
        await expect(project.restoreProject("../escape")).rejects.toThrow(InvalidProjectNameError);
        expect(fileIO.readFile).not.toHaveBeenCalled();
    });
});
