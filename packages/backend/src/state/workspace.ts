import { Author, ProjectState, ViewState } from "@blossom/common";
import { Project, ProjectNotFoundError } from "../models/project";
import { ProjectStore } from "./projectStore";

/** The key a project with no file behind it is given, and its numbering. */
const DRAFT_KEY_BASE = "Untitled";

/** The workspace holds no project under that key. */
class ProjectNotOpenError extends Error {
    constructor(key: string) {
        super(`Project is not open: ${key}`);
        this.name = "ProjectNotOpenError";
    }
}

/**
 * Two projects would answer to one key. Raised when a project is written under
 * a filename another open project already holds, which would leave two stores
 * backed by the same file, each overwriting the other on save.
 */
class ProjectAlreadyOpenError extends Error {
    constructor(key: string) {
        super(`Another project is already open as ${key}`);
        this.name = "ProjectAlreadyOpenError";
    }
}

/**
 * A write did not say which project it meant, and the workspace holds more than
 * one it could have been.
 */
class AmbiguousProjectError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AmbiguousProjectError";
    }
}

/** MCP was asked to work on a project before one had been chosen for it. */
class NoAssistantProjectError extends Error {
    constructor() {
        super(
            "No project has been chosen for the assistant to work on. Ask the user to pick one in the Blossom web UI.",
        );
        this.name = "NoAssistantProjectError";
    }
}

type ChangeListener = (key: string) => void;
type RenameListener = (from: string, to: string, author: Author | null) => void;
type AssistantTargetListener = (key: string | null) => void;

/**
 * Every project the server currently holds open, keyed by the name it answers
 * to. Sessions look at projects independently: opening one adds it to the
 * caller's own view and leaves everybody else's view alone, and a project stays
 * open for as long as the process runs so several sessions can share it.
 *
 * A project written to disk is keyed by its filename. One with nothing saved yet
 * is keyed by a minted `Untitled` name, which becomes its filename the first
 * time it is saved.
 *
 * The workspace also holds the single project MCP acts on, chosen by a person in
 * the web UI, so an assistant writing to the plan and a person reading it are
 * looking at the same thing without either having to follow the other around.
 */
class Workspace {
    private readonly _project: Project;
    private readonly _stores = new Map<string, ProjectStore>();
    private readonly _unsubscribes = new Map<string, () => void>();
    private readonly _changeListeners = new Set<ChangeListener>();
    private readonly _renameListeners = new Set<RenameListener>();
    private readonly _assistantTargetListeners = new Set<AssistantTargetListener>();
    private _assistantProject: string | null = null;

    constructor(project: Project) {
        this._project = project;
    }

    // ------------------------------------------------------------- listeners

    /**
     * Registers a listener fired after every mutation to any open project, with
     * the key of the project that changed. Listeners read the state themselves,
     * which lets the realtime layer coalesce a burst into one frame per project.
     */
    public onChange(listener: ChangeListener): () => void {
        this._changeListeners.add(listener);
        return () => {
            this._changeListeners.delete(listener);
        };
    }

    /** Registers a listener fired when a project starts answering to a new key. */
    public onRename(listener: RenameListener): () => void {
        this._renameListeners.add(listener);
        return () => {
            this._renameListeners.delete(listener);
        };
    }

    /** Registers a listener fired when the project MCP acts on changes. */
    public onAssistantTargetChange(listener: AssistantTargetListener): () => void {
        this._assistantTargetListeners.add(listener);
        return () => {
            this._assistantTargetListeners.delete(listener);
        };
    }

    private _emit<T extends (...args: any[]) => void>(listeners: Set<T>, ...args: Parameters<T>) {
        for (const listener of [...listeners]) {
            try {
                listener(...args);
            } catch (error) {
                // A broken listener must never fail the mutation that triggered it.
                console.error("Workspace listener threw:", error);
            }
        }
    }

    // ------------------------------------------------------------------ reads

    /** The keys of every open project, in the order they were opened. */
    public keys(): string[] {
        return [...this._stores.keys()];
    }

    public get(key: string): ProjectStore | null {
        return this._stores.get(key) ?? null;
    }

    /** The store under that key, or a failure naming the key that was asked for. */
    public require(key: string): ProjectStore {
        const store = this._stores.get(key);
        if (!store) {
            throw new ProjectNotOpenError(key);
        }
        return store;
    }

    public has(key: string): boolean {
        return this._stores.has(key);
    }

    /** The open project whose tree holds that task, if exactly one does. */
    public findByTaskId(taskId: string): ProjectStore | null {
        for (const store of this._stores.values()) {
            if (store.findTask(taskId)) {
                return store;
            }
        }
        return null;
    }

    /** The open project whose inbox holds that idea, if one does. */
    public findByIdeaId(ideaId: string): ProjectStore | null {
        for (const store of this._stores.values()) {
            if (store.findIdea(ideaId)) {
                return store;
            }
        }
        return null;
    }

    /**
     * What a session looking at these projects sees. Keys the workspace does not
     * hold are left out, so a stale bookmark renders the projects that are there.
     */
    public viewState(keys: string[]): ViewState {
        const projects: ProjectState[] = [];
        for (const key of keys) {
            const store = this._stores.get(key);
            if (store) {
                projects.push(store.getState());
            }
        }
        return { projects, assistantProject: this._assistantProject };
    }

    // ------------------------------------------------------------- lifecycle

    /**
     * Opens a saved project, reading it from disk the first time it is asked
     * for. A project already open comes back as it stands, so two sessions
     * asking for the same project share one copy and see each other's edits.
     */
    public async open(filename: string): Promise<ProjectStore> {
        const existing = this._stores.get(filename);
        if (existing) {
            return existing;
        }

        // A key that names no file would open as an empty project claiming a
        // file behind it, so the missing file is reported to the caller.
        if (!(await this._project.projectExists(filename))) {
            throw new ProjectNotFoundError(filename);
        }

        const { goal, inbox } = await this._project.restoreProject(filename);
        const store = this._track(new ProjectStore(filename, true));
        store.load(goal, inbox);
        return store;
    }

    /**
     * Opens each named project, in the order named, and answers with the ones
     * that are now open. A name with nothing behind it is left out, so a session
     * arriving on a bookmark outliving one of its projects gets the rest.
     */
    public async openMany(keys: string[]): Promise<string[]> {
        const opened: string[] = [];
        for (const key of keys) {
            if (this._stores.has(key)) {
                opened.push(key);
                continue;
            }
            try {
                await this.open(key);
                opened.push(key);
            } catch {
                // Left out of the answer, which is how the caller is told.
            }
        }
        return opened;
    }

    /**
     * Re-reads an open project from disk, discarding whatever it holds. The key
     * it answers to and every session looking at it are untouched.
     */
    public async reload(key: string): Promise<ProjectStore> {
        const store = this.require(key);
        const { goal, inbox } = await this._project.restoreProject(key);
        store.load(goal, inbox);
        store.setSavedToDisk(await this._project.projectExists(key));
        return store;
    }

    /**
     * Opens an empty project under a minted key. The key avoids both the
     * projects already open and the filenames on disk, so saving it under that
     * name lands on a file of its own.
     */
    public async createDraft(): Promise<ProjectStore> {
        const taken = new Set<string>([...this._stores.keys(), ...(await this._project.listExistingProjects())]);

        let key = DRAFT_KEY_BASE;
        for (let n = 2; taken.has(key); n++) {
            key = `${DRAFT_KEY_BASE} ${n}`;
        }

        return this._track(new ProjectStore(key, false));
    }

    /**
     * Writes an open project to disk and puts it under the filename it was
     * written to, so the key a session holds keeps naming the file behind it.
     *
     * `author` is whoever asked for the save. It rides along to the sessions
     * being told the project has a new key, so the browser that asked can tell
     * the change as its own doing.
     */
    public async save(key: string, filename: string, author: Author | null = null): Promise<ProjectStore> {
        const store = this.require(key);
        if (filename !== key && this._stores.has(filename)) {
            throw new ProjectAlreadyOpenError(filename);
        }

        const state = store.getState();
        await this._project.saveProject(filename, state.goal, state.inbox);

        const record = () => {
            if (filename !== key) {
                this._rekey(key, filename, author);
            }
            store.setSavedToDisk(true);
        };
        if (author) {
            store.runAs(author, record);
        } else {
            record();
        }
        return store;
    }

    /**
     * Removes a project's file. An open project keeps its work and its key, and
     * reports that nothing on disk holds it any more.
     */
    public async delete(filename: string): Promise<ProjectStore | null> {
        await this._project.deleteProject(filename);
        const store = this._stores.get(filename);
        store?.setSavedToDisk(false);
        return store ?? null;
    }

    // ------------------------------------------------------- assistant target

    /** The key of the project MCP acts on, as chosen in the web UI. */
    public get assistantProject(): string | null {
        return this._assistantProject;
    }

    /** Chooses which open project MCP acts on. Null leaves it unset. */
    public setAssistantProject(key: string | null) {
        if (key !== null) {
            this.require(key);
        }
        if (this._assistantProject === key) {
            return;
        }
        this._assistantProject = key;
        this._emit(this._assistantTargetListeners, key);
    }

    /**
     * The project MCP writes to. A workspace holding exactly one project needs
     * no choice made, since there is only one thing the assistant could mean.
     */
    public assistantStore(): ProjectStore {
        if (this._assistantProject) {
            const store = this._stores.get(this._assistantProject);
            if (store) {
                return store;
            }
        }
        if (this._stores.size === 1) {
            return [...this._stores.values()][0];
        }
        throw new NoAssistantProjectError();
    }

    // ------------------------------------------------------------- internals

    private _track(store: ProjectStore): ProjectStore {
        this._stores.set(store.key, store);
        // The key is read when the change fires, so a renamed project reports
        // its changes under the name sessions currently know it by.
        this._unsubscribes.set(
            store.key,
            store.onChange(() => this._emit(this._changeListeners, store.key)),
        );
        return store;
    }

    private _rekey(from: string, to: string, author: Author | null = null) {
        const store = this.require(from);
        const unsubscribe = this._unsubscribes.get(from);

        this._stores.delete(from);
        this._unsubscribes.delete(from);
        this._stores.set(to, store);
        if (unsubscribe) {
            this._unsubscribes.set(to, unsubscribe);
        }

        store.setKey(to);
        if (this._assistantProject === from) {
            this._assistantProject = to;
        }
        this._emit(this._renameListeners, from, to, author);
    }
}

export {
    Workspace,
    DRAFT_KEY_BASE,
    ProjectNotOpenError,
    ProjectAlreadyOpenError,
    AmbiguousProjectError,
    NoAssistantProjectError,
};
