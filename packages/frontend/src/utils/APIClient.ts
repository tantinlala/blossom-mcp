import axios from "axios";
import { Author, CommandErrorCode, CommandName, Dependency, ProjectState, Task } from "@blossom/common";
import { CommandFailure, RealtimeClient } from "./RealtimeClient";

/** Why a request did not produce a result, in terms the UI can act on. */
export interface RequestFailure {
    /** `cancelled` means the person declined a confirmation - not a problem. */
    code: CommandErrorCode | "network" | "cancelled";
    message: string;
    /** The server's authoritative state at the point of failure, when it sent one. */
    state?: ProjectState;
    /** Set on `confirm-required`: how many other browsers are connected. */
    otherCount?: number;
}

/** Asks the person whether to go ahead with something that affects everyone. */
export type ConfirmHandler = (otherCount: number) => Promise<boolean>;

const networkFailure = (error: unknown): RequestFailure => ({ code: "network", message: String(error) });

// Both transports report the same failures; this flattens them into one shape.
const toFailure = (error: unknown): RequestFailure => {
    if (error instanceof CommandFailure) {
        return {
            code: error.error.code,
            message: error.error.message,
            state: error.state,
            otherCount: error.error.otherCount,
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
            code = typeof data.otherCount === "number" ? "confirm-required" : "conflict";
        }
    }

    return {
        code,
        message: typeof data.error === "string" ? data.error : String(error),
        state: data.response as ProjectState | undefined,
        otherCount: data.otherCount as number | undefined,
    };
};

/**
 * Talks to the backend. The server owns all project state, and every mutation
 * comes back as the full new ProjectState, so the client can never drift.
 *
 * Mutations prefer the realtime socket and fall back to HTTP when it is not
 * open. The transport is chosen once, before sending, and never switched
 * mid-flight: these mutations are not idempotent, so retrying one whose reply
 * went missing would duplicate the change rather than repeat it harmlessly.
 */
class APIClient {
    private readonly realtime?: RealtimeClient;
    private confirmHandler?: ConfirmHandler;
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

    /**
     * Registers how to ask about commands the server refuses to run unattended
     * because they would change what everyone else is looking at.
     */
    public setConfirmHandler(handler: ConfirmHandler) {
        this.confirmHandler = handler;
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
            const failure = toFailure(error);

            // The server declined to act rather than acting - so asking and
            // resending is safe; nothing was changed the first time round.
            if (failure.code === "confirm-required" && this.confirmHandler) {
                const confirmed = await this.confirmHandler(failure.otherCount ?? 1);
                if (confirmed) {
                    // Commands with no payload spread to {}, which is what the
                    // resend needs; there is nothing to preserve.
                    return await this.post(name, { ...(data as object | undefined), confirmed: true });
                }
                this.reportFailure({ ...failure, code: "cancelled", message: "Cancelled" });
                return undefined;
            }

            this.reportFailure(failure);
            return undefined;
        }
    }

    private async dispatch(name: CommandName, data?: unknown): Promise<unknown> {
        if (this.realtime?.isOpen()) {
            return await this.realtime.send(name, data);
        }
        return (await axios.post(`/${name}`, data)).data?.response;
    }

    public async getState(): Promise<ProjectState | undefined> {
        return await this.get("/state");
    }

    public async getStateVersion(): Promise<number | undefined> {
        return (await this.get("/state/version"))?.version;
    }

    public async setGoal(name: string, description?: string, baseVersion?: number): Promise<ProjectState | undefined> {
        return await this.post("goal", { name, description, baseVersion });
    }

    public async addTask(
        parentId: string,
        name: string,
        description?: string,
    ): Promise<{ task: Task; state: ProjectState } | undefined> {
        return await this.post("tasks/add", { parentId, name, description });
    }

    public async updateTask(
        taskId: string,
        name?: string,
        description?: string,
        baseVersion?: number,
    ): Promise<ProjectState | undefined> {
        return await this.post("tasks/update", { taskId, name, description, baseVersion });
    }

    public async setTaskCompletion(taskId: string, completed: boolean): Promise<ProjectState | undefined> {
        return await this.post("tasks/set-completion", { taskId, completed });
    }

    public async removeTask(taskId: string): Promise<ProjectState | undefined> {
        return await this.post("tasks/remove", { taskId });
    }

    public async createSubplan(taskId: string): Promise<ProjectState | undefined> {
        return await this.post("tasks/create-subplan", { taskId });
    }

    public async pasteTasks(
        parentId: string,
        tasks: Task[],
        dependencies: Dependency[],
    ): Promise<ProjectState | undefined> {
        return await this.post("tasks/paste", { parentId, tasks, dependencies });
    }

    public async addDependency(sourceId: string, targetId: string): Promise<ProjectState | undefined> {
        return await this.post("dependencies/add", { sourceId, targetId });
    }

    public async removeDependency(sourceId: string, targetId: string): Promise<ProjectState | undefined> {
        return await this.post("dependencies/remove", { sourceId, targetId });
    }

    public async updateDependency(
        oldSource: string,
        oldTarget: string,
        newSource: string,
        newTarget: string,
    ): Promise<ProjectState | undefined> {
        return await this.post("dependencies/update", { oldSource, oldTarget, newSource, newTarget });
    }

    public async addIdea(text: string): Promise<ProjectState | undefined> {
        return await this.post("inbox/add", { text });
    }

    public async updateIdea(ideaId: string, text: string, expectedText?: string): Promise<ProjectState | undefined> {
        return await this.post("inbox/update", { ideaId, text, expectedText });
    }

    public async removeIdea(ideaId: string, expectedText?: string): Promise<ProjectState | undefined> {
        return await this.post("inbox/remove", { ideaId, expectedText });
    }

    public async promoteIdea(
        ideaId: string,
        parentId?: string,
        expectedText?: string,
    ): Promise<ProjectState | undefined> {
        return await this.post("inbox/promote", { ideaId, parentId, expectedText });
    }

    public async promoteAllIdeas(parentId?: string): Promise<ProjectState | undefined> {
        return await this.post("inbox/promote-all", { parentId });
    }

    public async undo(): Promise<ProjectState | undefined> {
        return await this.post("undo");
    }

    public async listExistingProjects(): Promise<string[] | undefined> {
        return (await this.get("/projects"))?.projects;
    }

    public async newProject(): Promise<ProjectState | undefined> {
        return await this.post("projects/new");
    }

    public async saveProject(filename: string): Promise<string[] | undefined> {
        return (await this.post("projects/save", { filename }))?.projects;
    }

    public async restoreProject(filename: string): Promise<ProjectState | undefined> {
        return await this.post("projects/restore", { filename });
    }

    /** Resolves to the projects that remain, and the state the deletion left behind. */
    public async deleteProject(filename: string): Promise<{ projects: string[]; state: ProjectState } | undefined> {
        return await this.post("projects/delete", { filename });
    }

    public async getActiveProject(): Promise<string | null | undefined> {
        return (await this.get("/projects/active"))?.activeProject;
    }
}

export { APIClient };
