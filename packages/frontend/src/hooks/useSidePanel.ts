import { useCallback, useState } from "react";

export type PanelName = "inbox" | "nextTasks" | "details";

/** Panels that temporarily take the slot from the inbox. */
type Overlay = Exclude<PanelName, "inbox">;

const INBOX_DISMISSED_KEY = "blossom.inboxDismissed";

const readInboxDismissed = (): boolean => {
    try {
        return window.localStorage.getItem(INBOX_DISMISSED_KEY) === "true";
    } catch {
        // Private browsing and similar can make localStorage throw; the inbox
        // being open is a fine default to fall back to.
        return false;
    }
};

const persistInboxDismissed = (dismissed: boolean) => {
    try {
        window.localStorage.setItem(INBOX_DISMISSED_KEY, String(dismissed));
    } catch {
        // Not being able to remember the choice is not worth failing over
    }
};

/**
 * Owns which single panel occupies the slot to the right of the canvas.
 *
 * Only ever one is visible. The inbox is the resting state, so opening the next
 * task list or task details takes the slot from it and closing them hands it
 * back - unless the inbox was itself dismissed, which is remembered across
 * reloads.
 */
export function useSidePanel() {
    const [inboxDismissed, setInboxDismissed] = useState<boolean>(readInboxDismissed);
    const [overlay, setOverlay] = useState<Overlay | null>(null);

    const activePanel: PanelName | null = overlay ?? (inboxDismissed ? null : "inbox");

    const showNextTasks = useCallback(() => setOverlay("nextTasks"), []);
    const showDetails = useCallback(() => setOverlay("details"), []);

    const toggleNextTasks = useCallback(() => {
        setOverlay((current) => (current === "nextTasks" ? null : "nextTasks"));
    }, []);

    const showInbox = useCallback(() => {
        setOverlay(null);
        setInboxDismissed(false);
        persistInboxDismissed(false);
    }, []);

    const toggleInbox = useCallback(() => {
        setOverlay((currentOverlay) => {
            // The inbox is behind whatever is on top, so the first press should
            // reveal it rather than dismiss something the user cannot see.
            if (currentOverlay !== null) {
                setInboxDismissed(false);
                persistInboxDismissed(false);
                return null;
            }
            setInboxDismissed((dismissed) => {
                persistInboxDismissed(!dismissed);
                return !dismissed;
            });
            return null;
        });
    }, []);

    /** Closes whatever is on screen, falling back to the inbox where there is one. */
    const closeActivePanel = useCallback(() => {
        setOverlay((currentOverlay) => {
            if (currentOverlay !== null) {
                return null;
            }
            setInboxDismissed(true);
            persistInboxDismissed(true);
            return null;
        });
    }, []);

    return {
        activePanel,
        inboxDismissed,
        showNextTasks,
        showDetails,
        toggleNextTasks,
        showInbox,
        toggleInbox,
        closeActivePanel,
    };
}
