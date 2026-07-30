import { Task, StoredProjectV2 } from "@blossom/common";
import { FileIO } from "../utils/fileIO";

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

    public saveProject = async (filename: string, goal: Task, inbox: string[]) => {
        const project: StoredProjectV2 = {
            formatVersion: 2,
            goal,
            inbox,
        };

        if (!(await this.fileIO.exists("./projects"))) {
            await this.fileIO.mkdir("./projects");
        }

        let filepath: string = `./projects/${filename}.txt`;
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

    public restoreProject = async (filename: string): Promise<{ goal: Task; inbox: string[] }> => {
        let filepath: string = `./projects/${filename}.txt`;

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

export { Project };
