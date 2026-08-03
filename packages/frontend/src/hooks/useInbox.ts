import { useCallback, useMemo, useRef, useState } from "react";
import { InboxIdea, ProjectState } from "@blossom/common";
import { APIClient } from "../utils/APIClient";
import { PlanManager } from "../utils/PlanManager";

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

interface UseInboxDeps {
    apiClient: APIClient;
    planManager: PlanManager;
    applyState: (state: ProjectState) => void;
    notify?: (message: string) => void;
}

export function useInbox({ apiClient, planManager, applyState, notify }: UseInboxDeps) {
    const [remoteIdeas, setRemoteIdeas] = useState<InboxIdea[]>([]);
    // Keyed by idea id, not by row: an idea keeps its id wherever it moves to,
    // so an edit stays attached to the idea it was started on however the list
    // shifts around it.
    const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());
    const pendingEditsRef = useRef(pendingEdits);
    // What callers outside rendering read, for the same reason the edits keep a
    // ref: a pushed update can land between a state update and its render.
    const remoteIdeasRef = useRef(remoteIdeas);

    // The rows the panel renders are positions, so the position a caller hands
    // back is turned into an id here, at the one point it still means anything.
    const ideaIdAt = useCallback((index: number): string | undefined => remoteIdeasRef.current[index]?.id, []);

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

    // What the user sees: the server's list in the server's order, with any
    // in-progress typing laid over the idea it was typed into, so an incoming
    // change to one idea never disturbs another.
    const ideaList = useMemo(() => {
        return remoteIdeas.map((idea) => pendingEdits.get(idea.id)?.text ?? idea.text);
    }, [remoteIdeas, pendingEdits]);

    /**
     * Adopts the server's inbox, keeping whatever is being typed laid over it.
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
     */
    const applyRemoteInbox = useCallback(
        (entries: InboxIdea[]) => {
            remoteIdeasRef.current = entries;
            setRemoteIdeas(entries);

            let rebased = false;
            let removed = false;
            let landed = false;
            updatePendingEdits((pending) => {
                if (pending.size === 0) {
                    return pending;
                }
                const byId = new Map(entries.map((entry) => [entry.id, entry.text]));
                const next = new Map(pending);
                pending.forEach((edit, ideaId) => {
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
        async (result: ProjectState | undefined) => {
            if (result) {
                applyState(result);
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
            const state = await apiClient.getState();
            if (state) {
                applyState(state);
            }
            return false;
        },
        [apiClient, applyState, notify],
    );

    const addIdea = useCallback(async () => {
        await applyResult(await apiClient.addIdea(""));
    }, [apiClient, applyResult]);

    const deleteIdea = useCallback(
        async (index: number) => {
            const ideaId = ideaIdAt(index);
            if (ideaId === undefined) {
                return;
            }
            const expectedText = pendingEditsRef.current.get(ideaId)?.original ?? remoteIdeasRef.current[index].text;
            clearPendingEdit(ideaId);
            await applyResult(await apiClient.removeIdea(ideaId, expectedText));
        },
        [apiClient, applyResult, clearPendingEdit, ideaIdAt],
    );

    // Keystrokes stay local until blur/Enter so every character does not cost a
    // round trip; commitIdea persists them.
    const changeIdea = useCallback(
        (index: number, newIdea: string) => {
            const ideaId = ideaIdAt(index);
            if (ideaId === undefined) {
                return;
            }
            updatePendingEdits((previous) => {
                const next = new Map(previous);
                const existing = previous.get(ideaId);
                next.set(ideaId, {
                    text: newIdea,
                    original: existing?.original ?? remoteIdeasRef.current[index].text,
                });
                return next;
            });
        },
        [ideaIdAt, updatePendingEdits],
    );

    const commitIdea = useCallback(
        async (index: number) => {
            const ideaId = ideaIdAt(index);
            if (ideaId === undefined) {
                return;
            }
            const pending = pendingEditsRef.current.get(ideaId);
            if (!pending) {
                return;
            }
            if (pending.text === pending.original) {
                clearPendingEdit(ideaId);
                return;
            }

            const succeeded = await applyResult(await apiClient.updateIdea(ideaId, pending.text, pending.original));
            if (succeeded) {
                clearPendingEdit(ideaId);
            }
        },
        [apiClient, applyResult, clearPendingEdit, ideaIdAt],
    );

    const addTaskToContextAndRemove = useCallback(
        async (index: number): Promise<void> => {
            const ideaId = ideaIdAt(index);
            if (ideaId === undefined) {
                return;
            }
            const expectedText = pendingEditsRef.current.get(ideaId)?.original ?? remoteIdeasRef.current[index].text;
            clearPendingEdit(ideaId);
            await applyResult(await apiClient.promoteIdea(ideaId, planManager.presentContextGoal.id, expectedText));
        },
        [apiClient, planManager, applyResult, clearPendingEdit, ideaIdAt],
    );

    // One command rather than a promotion per idea: the inbox cannot shift
    // underneath the caller part-way through, and it is a single round trip.
    const addAllIdeasToPlan = useCallback(async (): Promise<void> => {
        if (ideaList.length === 0) {
            return;
        }
        updatePendingEdits((previous) => (previous.size === 0 ? previous : new Map()));
        await applyResult(await apiClient.promoteAllIdeas(planManager.presentContextGoal.id));
    }, [apiClient, planManager, ideaList, applyResult, updatePendingEdits]);

    return {
        ideaList,
        applyRemoteInbox,
        addIdea,
        deleteIdea,
        changeIdea,
        commitIdea,
        addTaskToContextAndRemove,
        addAllIdeasToPlan,
    };
}
