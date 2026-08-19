import axios from "axios";
import { Author, CommandErrorCode, CommandName, Dependency, ProjectState, Task, ViewState } from "@blossom/common";
import { CommandFailure, RealtimeClient } from "./RealtimeClient";

/** Why a request did not produce a result, in terms the UI can act on. */
export interface RequestFailure {
    code: CommandErrorCode | "network";
    message: string;
    /** The server's authoritative state at the point of failure, when it sent one. */
    state?: ProjectState;
}

/** Every saved project, which of them the server holds open, and MCP's target. */
export interface ProjectListing {
    projects: string[];
    open: string[];
    assistantProject: string | null;
}

const networkFailure = (error: unknown): RequestFailure => ({ code: "network", message: String(error) });

// Both transports report the same failures; this flattens them into one shape.
const toFailure = (error: unknown): RequestFailure => {
    if (error instanceof CommandFailure) {
        return {
            code: error.error.code,
            message: error.error.message,
            state: error.state,
        };
    }

    const response = (error as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
    if (!response) {
        return networkFailure(error);
    }

    const data = response.data ?? {};
    // The server sends the same code both transports use. Statuses are only a
    // fallback, and a lossy one: several distinct failures share a 409.
    let code: RequestFailure["code"] =
        typeof data.code === "string" ? (data.code as RequestFailure["code"]) : "internal";
    if (typeof data.code !== "string") {
        if (response.status === 404) {
            code = "not-found";
        } else if (response.status === 400) {
            code = "invalid";
        } else if (response.status === 409) {
            code = "conflict";
        }
    }

    return {
        code,
        message: typeof data.error === "string" ? data.error : String(error),
        state: data.response as ProjectState | undefined,
    };
};

/**
 * Talks to the backend. The server owns all project state, and every mutation
 * comes back as the full new ProjectState for the project it changed, so the
 * client can never drift.
 *
 * A board can hold several projects, so every write names the one it means with
 * `projectKey` - the person clicking knows which lane they clicked in, and the
 * server does not have to guess.
 *
 * Mutations prefer the realtime socket and fall back to HTTP when it is not
 * open. The transport is chosen once, before sending, and never switched
 * mid-flight: these mutations are not idempotent, so retrying one whose reply
 * went missing would duplicate the change rather than repeat it harmlessly.
 */
class APIClient {
    private readonly realtime?: RealtimeClient;
    private lastFailureRecord: RequestFailure | null = null;
    private readonly failureListeners = new Set<(failure: RequestFailure) => void>();

    constructor(realtime?: RealtimeClient) {
        const baseURL = process.env.REACT_APP_API_URL || "http://localhost:3030/api";
        axios.defaults.baseURL = baseURL;
        this.realtime = realtime;
    }

    /** Labels this browser's writes so changes can be attributed to a person. */
    public setAuthor(author: Author) {
        axios.defaults.headers.common["X-Blossom-Author"] = JSON.stringify(author);
        this.realtime?.identify(author);
    }

    /** Notified whenever a request fails, so the UI can explain rather than go quiet. */
    public onRequestFailure(listener: (failure: RequestFailure) => void): () => void {
        this.failureListeners.add(listener);
        return () => this.failureListeners.delete(listener) as unknown as void;
    }

    /** The most recent failure, for callers deciding what to tell the user. */
    public lastFailure(): RequestFailure | null {
        return this.lastFailureRecord;
    }

    private reportFailure(failure: RequestFailure) {
        this.lastFailureRecord = failure;
        for (const listener of [...this.failureListeners]) {
            listener(failure);
        }
    }

    private async get(endpoint: string) {
        try {
            return (await axios.get(endpoint)).data?.response;
        } catch (error) {
            this.reportFailure(toFailure(error));
        }
    }

    private async post(name: CommandName, data?: unknown): Promise<any> {
        try {
            const response = await this.dispatch(name, data);
            this.lastFailureRecord = null;
            return response;
        } catch (error) {
            this.reportFailure(toFailure(error));
            return undefined;
        }
    }

    private async dispatch(name: CommandName, data?: unknown): Promise<unknown> {
        if (this.realtime?.isOpen()) {
            return await this.realtime.send(name, data);
        }
        return (await axios.post(`/${name}`, data)).data?.response;
    }

    // -------------------------------------------------------------- the board

    /** The projects named, opening any the server does not hold yet. */
    public async getView(projectKeys: string[]): Promise<ViewState | undefined> {
        return await this.get(`/view?projects=${encodeURIComponent(projectKeys.join(","))}`);
    }

    /** Each named project's version counter, read by the poll that runs while the socket is down. */
    public async getViewVersions(projectKeys: string[]): Promise<Record<string, number> | undefined> {
        return (await this.get(`/view/versions?projects=${encodeURIComponent(projectKeys.join(","))}`))?.versions;
    }

    public async listProjects(): Promise<ProjectListing | undefined> {
        return await this.get("/projects");
    }

    // ------------------------------------------------------------ the project

    public async setGoal(
        projectKey: string,
        name: string,
        description?: string,
        baseVersion?: number,
    ): Promise<ProjectState | undefined> {
        return await this.post("goal", { projectKey, name, description, baseVersion });
    }

    public async addTask(
        projectKey: string,
        parentId: string,
        name: string,
        description?: string,
    ): Promise<{ task: Task; state: ProjectState } | undefined> {
        return await this.post("tasks/add", { projectKey, parentId, name, description });
    }

    public async updateTask(
        projectKey: string,
        taskId: string,
        name?: string,
        description?: string,
        baseVersion?: number,
    ): Promise<ProjectState | undefined> {
        return await this.post("tasks/update", { projectKey, taskId, name, description, baseVersion });
    }

    public async setTaskCompletion(
        projectKey: string,
        taskId: string,
        completed: boolean,
    ): Promise<ProjectState | undefined> {
        return await this.post("tasks/set-completion", { projectKey, taskId, completed });
    }

    public async removeTask(projectKey: string, taskId: string): Promise<ProjectState | undefined> {
        return await this.post("tasks/remove", { projectKey, taskId });
    }

    public async createSubplan(projectKey: string, taskId: string): Promise<ProjectState | undefined> {
        return await this.post("tasks/create-subplan", { projectKey, taskId });
    }

    public async pasteTasks(
        projectKey: string,
        parentId: string,
        tasks: Task[],
        dependencies: Dependency[],
    ): Promise<ProjectState | undefined> {
        return await this.post("tasks/paste", { projectKey, parentId, tasks, dependencies });
    }

    public async addDependency(
        projectKey: string,
        sourceId: string,
        targetId: string,
    ): Promise<ProjectState | undefined> {
        return await this.post("dependencies/add", { projectKey, sourceId, targetId });
    }

    public async removeDependency(
        projectKey: string,
        sourceId: string,
        targetId: string,
    ): Promise<ProjectState | undefined> {
        return await this.post("dependencies/remove", { projectKey, sourceId, targetId });
    }

    public async updateDependency(
        projectKey: string,
        oldSource: string,
        oldTarget: string,
        newSource: string,
        newTarget: string,
    ): Promise<ProjectState | undefined> {
        return await this.post("dependencies/update", { projectKey, oldSource, oldTarget, newSource, newTarget });
    }

    public async addIdea(projectKey: string, text: string): Promise<ProjectState | undefined> {
        return await this.post("inbox/add", { projectKey, text });
    }

    public async updateIdea(
        projectKey: string,
        ideaId: string,
        text: string,
        expectedText?: string,
    ): Promise<ProjectState | undefined> {
        return await this.post("inbox/update", { projectKey, ideaId, text, expectedText });
    }

    public async removeIdea(
        projectKey: string,
        ideaId: string,
        expectedText?: string,
    ): Promise<ProjectState | undefined> {
        return await this.post("inbox/remove", { projectKey, ideaId, expectedText });
    }

    public async promoteIdea(
        projectKey: string,
        ideaId: string,
        parentId?: string,
        expectedText?: string,
    ): Promise<ProjectState | undefined> {
        return await this.post("inbox/promote", { projectKey, ideaId, parentId, expectedText });
    }

    public async promoteAllIdeas(projectKey: string, parentId?: string): Promise<ProjectState | undefined> {
        return await this.post("inbox/promote-all", { projectKey, parentId });
    }

    public async undo(projectKey: string): Promise<ProjectState | undefined> {
        return await this.post("undo", { projectKey });
    }

    // -------------------------------------------------- project housekeeping

    /** Opens an empty project, for the caller to put on its own board. */
    public async newProject(): Promise<ProjectState | undefined> {
        return await this.post("projects/new");
    }

    /** Writes a project to disk. It answers to the filename it was written to. */
    public async saveProject(
        projectKey: string,
        filename: string,
    ): Promise<{ projects: string[]; state: ProjectState } | undefined> {
        return await this.post("projects/save", { projectKey, filename });
    }

    /** Opens a saved project, for the caller to put on its own board. */
    public async openProject(filename: string): Promise<ProjectState | undefined> {
        return await this.post("projects/open", { filename });
    }

    /** Re-reads a project from disk, discarding what is on screen. */
    public async reloadProject(projectKey: string): Promise<ProjectState | undefined> {
        return await this.post("projects/reload", { projectKey });
    }

    /** Resolves to the projects that remain, and the state the deletion left behind. */
    public async deleteProject(filename: string): Promise<{ projects: string[]; state?: ProjectState } | undefined> {
        return await this.post("projects/delete", { filename });
    }

    /** Chooses which project MCP tool calls act on. */
    public async setAssistantProject(projectKey: string | null): Promise<string | null | undefined> {
        return (await this.post("assistant/target", { projectKey }))?.assistantProject;
    }
}

export { APIClient };
