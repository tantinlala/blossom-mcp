import { Task, StoredProjectV2 } from "@blossom/common";
import { FileIO } from "../utils/fileIO";

/** The named project has no file behind it. */
class ProjectNotFoundError extends Error {
    constructor(filename: string) {
        super(`Project not found: ${filename}`);
        this.name = "ProjectNotFoundError";
    }
}

/** A filename that would address a file outside the projects folder. */
class InvalidProjectNameError extends Error {
    constructor(filename: string) {
        super(`Invalid project name: ${filename}`);
        this.name = "InvalidProjectNameError";
    }
}

class Project {
    private fileIO: FileIO;

    readonly emptyGoal: Task = {
        name: "",
        description: "",
        id: "",
        completionState: false,
        plan: {
            tasksList: [],
            dependenciesList: [],
        },
    };

    constructor(fileIO: FileIO) {
        this.fileIO = fileIO;
    }

    /**
     * Where a named project lives. Names arrive from callers and are pasted
     * into a path, so anything holding a separator or a parent reference would
     * address a file outside the projects folder; those are rejected here, at
     * the one point every path is built.
     */
    private filepath = (filename: string): string => {
        if (typeof filename !== "string" || filename === "") {
            throw new InvalidProjectNameError(String(filename));
        }
        if (/[/\\]/.test(filename) || filename === "." || filename === "..") {
            throw new InvalidProjectNameError(filename);
        }
        return `./projects/${filename}.txt`;
    };

    public saveProject = async (filename: string, goal: Task, inbox: string[]) => {
        const project: StoredProjectV2 = {
            formatVersion: 2,
            goal,
            inbox,
        };

        const filepath = this.filepath(filename);
        if (!(await this.fileIO.exists("./projects"))) {
            await this.fileIO.mkdir("./projects");
        }

        await this.fileIO.writeFile(filepath, JSON.stringify(project));
    };

    public listExistingProjects = async (): Promise<string[]> => {
        if (!(await this.fileIO.exists("./projects"))) {
            return [];
        }
        const files = await this.fileIO.readdir("./projects");
        const projects = files.filter((file) => file.endsWith(".txt"));

        // Strip the .txt extension from the filenames
        for (let i = 0; i < projects.length; i++) {
            projects[i] = projects[i].slice(0, -4);
        }
        return projects;
    };

    /**
     * Removes a project's file. The active project is a separate concern the
     * store owns, so deleting the file a project was loaded from leaves what is
     * on screen untouched.
     */
    public deleteProject = async (filename: string): Promise<void> => {
        const filepath = this.filepath(filename);
        if (!(await this.fileIO.exists(filepath))) {
            throw new ProjectNotFoundError(filename);
        }
        await this.fileIO.unlink(filepath);
    };

    public restoreProject = async (filename: string): Promise<{ goal: Task; inbox: string[] }> => {
        const filepath = this.filepath(filename);

        if (!(await this.fileIO.exists(filepath))) {
            return { goal: this.emptyGoal, inbox: [] };
        }
        const data = await this.fileIO.readFile(filepath, "utf8");
        if (typeof data !== "string") {
            return { goal: this.emptyGoal, inbox: [] };
        }

        const parsed = JSON.parse(data);

        // Only v2 files (written by this version) are supported; anything else
        // opens as an empty project.
        if (parsed.formatVersion !== 2) {
            return { goal: this.emptyGoal, inbox: [] };
        }

        const project = parsed as StoredProjectV2;
        return { goal: project.goal, inbox: project.inbox ?? [] };
    };
}

export { Project, ProjectNotFoundError, InvalidProjectNameError };
