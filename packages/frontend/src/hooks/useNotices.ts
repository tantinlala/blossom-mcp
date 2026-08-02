import { useCallback, useState } from "react";

/**
 * A transient message channel for things worth mentioning but not worth
 * interrupting for: someone else opened a different project, a write was
 * refused because it would have overwritten their edit.
 *
 * Deliberately non-blocking: the trigger is often someone else's activity, so
 * the tab stays usable and the message fades on its own.
 */
export function useNotices() {
    const [notice, setNotice] = useState<string | null>(null);

    const notify = useCallback((message: string) => setNotice(message), []);
    const dismissNotice = useCallback(() => setNotice(null), []);

    return { notice, notify, dismissNotice };
}
