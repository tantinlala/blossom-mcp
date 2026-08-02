import { useCallback, useMemo, useRef, useState } from "react";
import { ProjectState } from "@blossom/common";
import { APIClient } from "../utils/APIClient";
import { PlanManager } from "../utils/PlanManager";

/** An idea the user is part-way through typing, not yet sent to the server. */
interface PendingEdit {
    /** What has been typed so far. */
    text: string;
    /**
     * What the row held when editing began. Sent as a precondition so a commit
     * cannot overwrite a change somebody else made to the same row in the
     * meantime - and, because inbox rows are addressed by index and adding an
     * idea shifts every index, cannot land on the wrong row either.
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
    const [remoteIdeas, setRemoteIdeas] = useState<string[]>([]);
    const [pendingEdits, setPendingEdits] = useState<Map<number, PendingEdit>>(new Map());
    const pendingEditsRef = useRef(pendingEdits);
    pendingEditsRef.current = pendingEdits;

    // What the user sees: the server's list with any in-progress typing laid
    // over the top, so an incoming change to one row never disturbs another.
    const ideaList = useMemo(() => {
        if (pendingEdits.size === 0) {
            return remoteIdeas;
        }
        const merged = [...remoteIdeas];
        pendingEdits.forEach((edit, index) => {
            if (index < merged.length) {
                merged[index] = edit.text;
            }
        });
        return merged;
    }, [remoteIdeas, pendingEdits]);

    /**
     * Adopts the server's inbox, keeping whatever is being typed laid over it.
     *
     * When somebody changes the very row being edited, the local text is kept
     * rather than replaced: discarding what a person is in the middle of typing
     * loses their work with no warning, which is precisely the failure this
     * overlay exists to prevent. Instead they are told, and the edit is rebased
     * onto the new value so their next commit knowingly replaces it. A row that
     * has been deleted outright has nothing left to commit onto, so that edit
     * is dropped - again with a word about why.
     */
    const applyRemoteInbox = useCallback(
        (ideas: string[]) => {
            setRemoteIdeas(ideas);

            const pending = pendingEditsRef.current;
            if (pending.size === 0) {
                return;
            }

            const next = new Map(pending);
            let rebased = false;
            let removed = false;
            pending.forEach((edit, index) => {
                if (ideas[index] === edit.original) {
                    return;
                }
                if (index >= ideas.length) {
                    next.delete(index);
                    removed = true;
                    return;
                }
                next.set(index, { ...edit, original: ideas[index] });
                rebased = true;
            });

            if (!rebased && !removed) {
                return;
            }
            pendingEditsRef.current = next;
            setPendingEdits(next);
            if (rebased) {
                notify?.("Someone else changed an idea you are editing. Your version will replace theirs.");
            }
            if (removed) {
                notify?.("An idea you were editing was removed by someone else.");
            }
        },
        [notify],
    );

    const clearPendingEdit = useCallback((index: number) => {
        setPendingEdits((previous) => {
            if (!previous.has(index)) {
                return previous;
            }
            const next = new Map(previous);
            next.delete(index);
            return next;
        });
    }, []);

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
            const expectedText = pendingEditsRef.current.get(index)?.original ?? remoteIdeas[index];
            clearPendingEdit(index);
            await applyResult(await apiClient.removeIdea(index, expectedText));
        },
        [apiClient, applyResult, clearPendingEdit, remoteIdeas],
    );

    // Keystrokes stay local until blur/Enter so every character does not cost a
    // round trip; commitIdea persists them.
    const changeIdea = useCallback(
        (index: number, newIdea: string) => {
            setPendingEdits((previous) => {
                const next = new Map(previous);
                const existing = previous.get(index);
                next.set(index, { text: newIdea, original: existing?.original ?? remoteIdeas[index] ?? "" });
                return next;
            });
        },
        [remoteIdeas],
    );

    const commitIdea = useCallback(
        async (index: number) => {
            const pending = pendingEditsRef.current.get(index);
            if (!pending) {
                return;
            }
            if (pending.text === pending.original) {
                clearPendingEdit(index);
                return;
            }

            const succeeded = await applyResult(await apiClient.updateIdea(index, pending.text, pending.original));
            if (succeeded) {
                clearPendingEdit(index);
            }
        },
        [apiClient, applyResult, clearPendingEdit],
    );

    const addTaskToContextAndRemove = useCallback(
        async (index: number): Promise<void> => {
            const expectedText = pendingEditsRef.current.get(index)?.original ?? remoteIdeas[index];
            clearPendingEdit(index);
            await applyResult(await apiClient.promoteIdea(index, planManager.presentContextGoal.id, expectedText));
        },
        [apiClient, planManager, applyResult, clearPendingEdit, remoteIdeas],
    );

    // One command rather than a promotion per idea: the inbox cannot shift
    // underneath the caller part-way through, and it is a single round trip.
    const addAllIdeasToPlan = useCallback(async (): Promise<void> => {
        if (ideaList.length === 0) {
            return;
        }
        setPendingEdits(new Map());
        await applyResult(await apiClient.promoteAllIdeas(planManager.presentContextGoal.id));
    }, [apiClient, planManager, ideaList, applyResult]);

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
