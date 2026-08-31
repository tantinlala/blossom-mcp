import { useCallback, useMemo, useRef, useState } from "react";
import { InboxIdea, ProjectState, ViewState } from "@blossom/common";
import { APIClient } from "../utils/APIClient";
import { WorkspaceManager } from "../utils/WorkspaceManager";

/** An idea the user is part-way through typing, not yet sent to the server. */
interface PendingEdit {
    /** What has been typed so far. */
    text: string;
    /**
     * What the idea held when editing began. Sent as a precondition so a commit
     * cannot overwrite a change somebody else made to the same idea in the
     * meantime.
     */
    original: string;
}

/** One project's inbox, as the panel renders it. */
export interface InboxGroup {
    projectKey: string;
    ideas: InboxIdea[];
}

interface UseInboxDeps {
    apiClient: APIClient;
    workspace: WorkspaceManager;
    applyProject: (state: ProjectState) => void;
    notify?: (message: string) => void;
}

/**
 * The inbox of every project on the board.
 *
 * Ideas are addressed by id throughout. An id belongs to exactly one project, so
 * a row the panel hands back settles both which idea is meant and which project
 * to write to - which is what lets one panel hold several projects' inboxes at
 * once without the rows having to carry a project each.
 */
export function useInbox({ apiClient, workspace, applyProject, notify }: UseInboxDeps) {
    const [groups, setGroups] = useState<InboxGroup[]>([]);
    // Keyed by idea id, not by row: an idea keeps its id wherever it moves to,
    // so an edit stays attached to the idea it was started on however the list
    // shifts around it.
    const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());
    const pendingEditsRef = useRef(pendingEdits);
    // What callers outside rendering read, for the same reason the edits keep a
    // ref: a pushed update can land between a state update and its render.
    const groupsRef = useRef(groups);

    const setGroupsAndRef = useCallback((next: InboxGroup[]) => {
        groupsRef.current = next;
        setGroups(next);
    }, []);

    /** Which project holds that idea, and what the server says it says. */
    const locate = useCallback((ideaId: string): { projectKey: string; text: string } | null => {
        for (const group of groupsRef.current) {
            const idea = group.ideas.find((entry) => entry.id === ideaId);
            if (idea) {
                return { projectKey: group.projectKey, text: idea.text };
            }
        }
        return null;
    }, []);

    /**
     * Updates the pending edits, keeping the ref and the state in step.
     *
     * The ref is what callers outside rendering read, and a pushed update can
     * land between a state update and the render that applies it. Syncing the
     * ref only while rendering would leave that window reading edits that have
     * already been cleared, so every write goes through here instead.
     */
    const updatePendingEdits = useCallback(
        (update: (previous: Map<string, PendingEdit>) => Map<string, PendingEdit>) => {
            const next = update(pendingEditsRef.current);
            if (next === pendingEditsRef.current) {
                return;
            }
            pendingEditsRef.current = next;
            setPendingEdits(next);
        },
        [],
    );

    // What the user sees: each project's list in the server's order, with any
    // in-progress typing laid over the idea it was typed into, so an incoming
    // change to one idea never disturbs another.
    const ideaGroups = useMemo(
        () =>
            groups.map((group) => ({
                projectKey: group.projectKey,
                ideas: group.ideas.map((idea) => ({ id: idea.id, text: pendingEdits.get(idea.id)?.text ?? idea.text })),
            })),
        [groups, pendingEdits],
    );

    const totalIdeaCount = useMemo(
        () => ideaGroups.reduce((count, group) => count + group.ideas.length, 0),
        [ideaGroups],
    );

    /**
     * Reconciles the pending edits against the ideas the server now reports.
     *
     * When somebody changes the very idea being edited, the local text is kept
     * rather than replaced: discarding what a person is in the middle of typing
     * loses their work with no warning, which is precisely the failure this
     * overlay exists to prevent. Instead they are told, and the edit is rebased
     * onto the new value so their next commit knowingly replaces it. An idea
     * that has been removed outright has nothing left to commit onto, so that
     * edit is dropped - again with a word about why.
     *
     * Both of those turn on the idea's id, so ideas added or removed elsewhere
     * in the list leave an edit exactly where it was.
     *
     * An idea that already reads exactly as the edit would leave it has nothing
     * left to apply, so the edit is dropped in silence. That is the state every
     * commit lands in, since the reply it applies carries the text it just
     * wrote; there is no divergence to report.
     *
     * Only the projects whose inboxes arrived are reconciled: an edit in another
     * project's inbox has heard nothing that bears on it.
     */
    const reconcileEdits = useCallback(
        (arrived: InboxGroup[]) => {
            let rebased = false;
            let removed = false;
            let landed = false;

            updatePendingEdits((pending) => {
                if (pending.size === 0) {
                    return pending;
                }
                const byId = new Map<string, string>();
                const projects = new Set<string>();
                for (const group of arrived) {
                    projects.add(group.projectKey);
                    for (const idea of group.ideas) {
                        byId.set(idea.id, idea.text);
                    }
                }
                // Where each edit was before this update, so an edit belonging to
                // a project that said nothing is left untouched.
                const projectOfEdit = new Map<string, string>();
                for (const group of groupsRef.current) {
                    for (const idea of group.ideas) {
                        projectOfEdit.set(idea.id, group.projectKey);
                    }
                }

                const next = new Map(pending);
                pending.forEach((edit, ideaId) => {
                    const owner = projectOfEdit.get(ideaId);
                    if (owner !== undefined && !projects.has(owner)) {
                        return;
                    }
                    const text = byId.get(ideaId);
                    if (text === edit.original) {
                        return;
                    }
                    if (text === undefined) {
                        next.delete(ideaId);
                        removed = true;
                        return;
                    }
                    if (text === edit.text) {
                        next.delete(ideaId);
                        landed = true;
                        return;
                    }
                    next.set(ideaId, { ...edit, original: text });
                    rebased = true;
                });
                return rebased || removed || landed ? next : pending;
            });

            if (rebased) {
                notify?.("Someone else changed an idea you are editing. Your version will replace theirs.");
            }
            if (removed) {
                notify?.("An idea you were editing was removed by someone else.");
            }
        },
        [notify, updatePendingEdits],
    );

    /** Adopts the inbox of every project the board holds, in lane order. */
    const applyInboxView = useCallback(
        (view: ViewState) => {
            const arrived = view.projects.map((project) => ({ projectKey: project.key, ideas: project.inbox }));
            reconcileEdits(arrived);
            setGroupsAndRef(arrived);
        },
        [reconcileEdits, setGroupsAndRef],
    );

    /** Adopts one project's inbox, leaving the other projects' lists alone. */
    const applyRemoteInbox = useCallback(
        (projectKey: string, ideas: InboxIdea[]) => {
            reconcileEdits([{ projectKey, ideas }]);
            const existing = groupsRef.current.some((group) => group.projectKey === projectKey);
            setGroupsAndRef(
                existing
                    ? groupsRef.current.map((group) =>
                          group.projectKey === projectKey ? { projectKey, ideas } : group,
                      )
                    : [...groupsRef.current, { projectKey, ideas }],
            );
        },
        [reconcileEdits, setGroupsAndRef],
    );

    const clearPendingEdit = useCallback(
        (ideaId: string) => {
            updatePendingEdits((previous) => {
                if (!previous.has(ideaId)) {
                    return previous;
                }
                const next = new Map(previous);
                next.delete(ideaId);
                return next;
            });
        },
        [updatePendingEdits],
    );

    const applyResult = useCallback(
        async (projectKey: string, result: ProjectState | undefined) => {
            if (result) {
                applyProject(result);
                return true;
            }

            // Refusals carry the authoritative state and an explanation, both
            // already handled centrally; only unexplained failures need the
            // blunt "something went wrong, resync" treatment.
            const failure = apiClient.lastFailure();
            if (failure?.state) {
                return false;
            }

            notify?.("That did not work. Refreshing the project.");
            const view = await apiClient.getView([projectKey]);
            const state = view?.projects.find((project) => project.key === projectKey);
            if (state) {
                applyProject(state);
            }
            return false;
        },
        [apiClient, applyProject, notify],
    );

    const addIdea = useCallback(
        async (projectKey: string) => {
            await applyResult(projectKey, await apiClient.addIdea(projectKey, ""));
        },
        [apiClient, applyResult],
    );

    /** What the server last said the idea held, which every write carries as its precondition. */
    const expectedTextFor = useCallback(
        (ideaId: string, serverText: string): string => pendingEditsRef.current.get(ideaId)?.original ?? serverText,
        [],
    );

    const deleteIdea = useCallback(
        async (ideaId: string) => {
            const located = locate(ideaId);
            if (!located) {
                return;
            }
            const expectedText = expectedTextFor(ideaId, located.text);
            clearPendingEdit(ideaId);
            await applyResult(located.projectKey, await apiClient.removeIdea(located.projectKey, ideaId, expectedText));
        },
        [apiClient, applyResult, clearPendingEdit, expectedTextFor, locate],
    );

    // Keystrokes stay local until blur/Enter so every character does not cost a
    // round trip; commitIdea persists them.
    const changeIdea = useCallback(
        (ideaId: string, newIdea: string) => {
            const located = locate(ideaId);
            if (!located) {
                return;
            }
            updatePendingEdits((previous) => {
                const next = new Map(previous);
                const existing = previous.get(ideaId);
                next.set(ideaId, { text: newIdea, original: existing?.original ?? located.text });
                return next;
            });
        },
        [locate, updatePendingEdits],
    );

    const commitIdea = useCallback(
        async (ideaId: string) => {
            const located = locate(ideaId);
            const pending = pendingEditsRef.current.get(ideaId);
            if (!located || !pending) {
                return;
            }
            if (pending.text === pending.original) {
                clearPendingEdit(ideaId);
                return;
            }

            const succeeded = await applyResult(
                located.projectKey,
                await apiClient.updateIdea(located.projectKey, ideaId, pending.text, pending.original),
            );
            if (succeeded) {
                clearPendingEdit(ideaId);
            }
        },
        [apiClient, applyResult, clearPendingEdit, locate],
    );

    /** Turns an idea into a task at the level its own project is drilled into. */
    const addTaskToContextAndRemove = useCallback(
        async (ideaId: string): Promise<void> => {
            const located = locate(ideaId);
            if (!located) {
                return;
            }
            const parentId = workspace.planManagerFor(located.projectKey)?.presentContextGoal.id;
            if (parentId === undefined) {
                return;
            }
            const expectedText = expectedTextFor(ideaId, located.text);
            clearPendingEdit(ideaId);
            await applyResult(
                located.projectKey,
                await apiClient.promoteIdea(located.projectKey, ideaId, parentId, expectedText),
            );
        },
        [apiClient, workspace, applyResult, clearPendingEdit, expectedTextFor, locate],
    );

    // One command rather than a promotion per idea: the inbox cannot shift
    // underneath the caller part-way through, and it is a single round trip.
    const addAllIdeasToPlan = useCallback(
        async (projectKey: string): Promise<void> => {
            const group = groupsRef.current.find((entry) => entry.projectKey === projectKey);
            const parentId = workspace.planManagerFor(projectKey)?.presentContextGoal.id;
            if (!group || group.ideas.length === 0 || parentId === undefined) {
                return;
            }
            const ids = new Set(group.ideas.map((idea) => idea.id));
            updatePendingEdits((previous) => {
                if (previous.size === 0) {
                    return previous;
                }
                const next = new Map(previous);
                ids.forEach((id) => next.delete(id));
                return next;
            });
            await applyResult(projectKey, await apiClient.promoteAllIdeas(projectKey, parentId));
        },
        [apiClient, workspace, applyResult, updatePendingEdits],
    );

    return {
        ideaGroups,
        totalIdeaCount,
        applyInboxView,
        applyRemoteInbox,
        addIdea,
        deleteIdea,
        changeIdea,
        commitIdea,
        addTaskToContextAndRemove,
        addAllIdeasToPlan,
    };
}
