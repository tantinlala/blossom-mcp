import { useCallback, useState } from "react";

export type PanelName = "inbox" | "nextTasks" | "details";

/** Panels that temporarily take the slot from the inbox. */
type Overlay = Exclude<PanelName, "inbox">;

const INBOX_OPEN_KEY = "blossom.inboxOpen";

const readInboxOpen = (): boolean => {
    try {
        return window.localStorage.getItem(INBOX_OPEN_KEY) === "true";
    } catch {
        // Private browsing and similar can make localStorage throw, which leaves
        // the canvas with the whole width - the same as a first visit.
        return false;
    }
};

const persistInboxOpen = (open: boolean) => {
    try {
        window.localStorage.setItem(INBOX_OPEN_KEY, String(open));
    } catch {
        // Not being able to remember the choice is not worth failing over
    }
};

/**
 * Owns which single panel occupies the slot to the right of the canvas.
 *
 * Only ever one is visible, and the slot starts empty: the inbox appears once
 * asked for, and that choice is remembered across reloads. Opening the next task
 * list or task details takes the slot, and toggling them off hands it back to an
 * inbox that was open when they arrived. Closing a panel outright empties the
 * slot, which is what the close control on each panel does.
 */
export function useSidePanel() {
    const [inboxOpen, setInboxOpen] = useState<boolean>(readInboxOpen);
    const [overlay, setOverlay] = useState<Overlay | null>(null);

    const activePanel: PanelName | null = overlay ?? (inboxOpen ? "inbox" : null);

    const showNextTasks = useCallback(() => setOverlay("nextTasks"), []);
    const showDetails = useCallback(() => setOverlay("details"), []);

    const toggleNextTasks = useCallback(() => {
        setOverlay((current) => (current === "nextTasks" ? null : "nextTasks"));
    }, []);

    const showInbox = useCallback(() => {
        setOverlay(null);
        setInboxOpen(true);
        persistInboxOpen(true);
    }, []);

    const toggleInbox = useCallback(() => {
        setOverlay((currentOverlay) => {
            // The inbox is behind whatever is on top, so the first press should
            // reveal it rather than close something the user cannot see.
            if (currentOverlay !== null) {
                setInboxOpen(true);
                persistInboxOpen(true);
                return null;
            }
            setInboxOpen((open) => {
                persistInboxOpen(!open);
                return !open;
            });
            return null;
        });
    }, []);

    /** Empties the slot, whichever panel is in it. */
    const closeActivePanel = useCallback(() => {
        setOverlay(null);
        setInboxOpen(false);
        persistInboxOpen(false);
    }, []);

    return {
        activePanel,
        showNextTasks,
        showDetails,
        toggleNextTasks,
        showInbox,
        toggleInbox,
        closeActivePanel,
    };
}
