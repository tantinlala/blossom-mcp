import axios from "axios";
import { Dependency, ProjectState, Task } from "@blossom/common";

/**
 * HTTP client for the backend REST API. The backend owns all project state;
 * every mutation returns the full new ProjectState so the client can never
 * drift from the server.
 */
class APIClient {
    constructor() {
        // Use environment variable for API URL, with fallback for backward compatibility
        const baseURL = process.env.REACT_APP_API_URL || "http://localhost:3030/api";
        axios.defaults.baseURL = baseURL;
    }

    private async get(endpoint: string) {
        try {
            return (await axios.get(endpoint)).data?.response;
        } catch (error) {
            console.log(error);
        }
    }

    private async post(endpoint: string, data?) {
        try {
            return (await axios.post(endpoint, data)).data?.response;
        } catch (error) {
            console.log(error);
        }
    }

    public async getState(): Promise<ProjectState | undefined> {
        return await this.get("/state");
    }

    public async getStateVersion(): Promise<number | undefined> {
        return (await this.get("/state/version"))?.version;
    }

    public async setGoal(name: string, description?: string): Promise<ProjectState | undefined> {
        return await this.post("/goal", { name, description });
    }

    public async addTask(
        parentId: string,
        name: string,
        description?: string,
    ): Promise<{ task: Task; state: ProjectState } | undefined> {
        return await this.post("/tasks/add", { parentId, name, description });
    }

    public async updateTask(taskId: string, name?: string, description?: string): Promise<ProjectState | undefined> {
        return await this.post("/tasks/update", { taskId, name, description });
    }

    public async setTaskCompletion(taskId: string, completed: boolean): Promise<ProjectState | undefined> {
        return await this.post("/tasks/set-completion", { taskId, completed });
    }

    public async removeTask(taskId: string): Promise<ProjectState | undefined> {
        return await this.post("/tasks/remove", { taskId });
    }

    public async createSubplan(taskId: string): Promise<ProjectState | undefined> {
        return await this.post("/tasks/create-subplan", { taskId });
    }

    public async pasteTasks(
        parentId: string,
        tasks: Task[],
        dependencies: Dependency[],
    ): Promise<ProjectState | undefined> {
        return await this.post("/tasks/paste", { parentId, tasks, dependencies });
    }

    public async addDependency(sourceId: string, targetId: string): Promise<ProjectState | undefined> {
        return await this.post("/dependencies/add", { sourceId, targetId });
    }

    public async removeDependency(sourceId: string, targetId: string): Promise<ProjectState | undefined> {
        return await this.post("/dependencies/remove", { sourceId, targetId });
    }

    public async updateDependency(
        oldSource: string,
        oldTarget: string,
        newSource: string,
        newTarget: string,
    ): Promise<ProjectState | undefined> {
        return await this.post("/dependencies/update", { oldSource, oldTarget, newSource, newTarget });
    }

    public async addIdea(text: string): Promise<ProjectState | undefined> {
        return await this.post("/inbox/add", { text });
    }

    public async updateIdea(index: number, text: string): Promise<ProjectState | undefined> {
        return await this.post("/inbox/update", { index, text });
    }

    public async removeIdea(index: number): Promise<ProjectState | undefined> {
        return await this.post("/inbox/remove", { index });
    }

    public async promoteIdea(index: number, parentId?: string): Promise<ProjectState | undefined> {
        return await this.post("/inbox/promote", { index, parentId });
    }

    public async undo(): Promise<ProjectState | undefined> {
        return await this.post("/undo");
    }

    public async listExistingProjects(): Promise<string[] | undefined> {
        return (await this.get("/projects"))?.projects;
    }

    public async newProject(): Promise<ProjectState | undefined> {
        return await this.post("/projects/new");
    }

    public async saveProject(filename: string): Promise<string[] | undefined> {
        return (await this.post("/projects/save", { filename }))?.projects;
    }

    public async restoreProject(filename: string): Promise<ProjectState | undefined> {
        return await this.post("/projects/restore", { filename });
    }

    public async getActiveProject(): Promise<string | null | undefined> {
        return (await this.get("/projects/active"))?.activeProject;
    }
}

export { APIClient };
