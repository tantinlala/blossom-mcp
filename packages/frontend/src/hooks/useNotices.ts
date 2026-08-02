import { useCallback, useState } from "react";

/**
 * A transient message channel for things worth mentioning but not worth
 * interrupting for: someone else opened a different project, a write was
 * refused because it would have overwritten their edit.
 *
 * These used to be `alert()`, which blocks the whole tab - unacceptable when
 * the trigger is someone else's activity rather than your own action.
 */
export function useNotices() {
    const [notice, setNotice] = useState<string | null>(null);

    const notify = useCallback((message: string) => setNotice(message), []);
    const dismissNotice = useCallback(() => setNotice(null), []);

    return { notice, notify, dismissNotice };
}
