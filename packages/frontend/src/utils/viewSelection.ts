const QUERY_PARAM = "projects";
const STORAGE_KEY = "blossom.view";

/** Splits a comma-separated list of project keys, dropping blanks. */
const parseKeys = (value: string): string[] => {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const raw of value.split(",")) {
        const key = raw.trim();
        // A project drawn twice would give one plan two lanes, each showing the
        // same tasks under the same ids.
        if (key !== "" && !seen.has(key)) {
            seen.add(key);
            keys.push(key);
        }
    }
    return keys;
};

/**
 * Which projects this session is looking at.
 *
 * The address bar wins, so a board can be sent to somebody as a link and opened
 * on another device. With nothing in the address bar the last board this browser
 * was on is used, so reopening the app lands back where the person left off.
 */
const readSelection = (): string[] => {
    if (typeof window === "undefined") {
        return [];
    }

    const fromUrl = new URLSearchParams(window.location.search).get(QUERY_PARAM);
    if (fromUrl !== null) {
        return parseKeys(fromUrl);
    }

    try {
        return parseKeys(window.localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {
        // A browser refusing storage still gets a working board.
        return [];
    }
};

/**
 * Records the board this session is on, in the address bar so the link carries
 * it and in storage so the next visit opens on it. The history entry is
 * replaced: picking projects is arranging one board, and the back button
 * belongs to wherever the person came from.
 */
const writeSelection = (keys: string[]): void => {
    if (typeof window === "undefined") {
        return;
    }

    const joined = keys.join(",");

    const url = new URL(window.location.href);
    if (keys.length > 0) {
        url.searchParams.set(QUERY_PARAM, joined);
    } else {
        url.searchParams.delete(QUERY_PARAM);
    }
    window.history.replaceState(null, "", url.toString());

    try {
        window.localStorage.setItem(STORAGE_KEY, joined);
    } catch {
        // The address bar already carries the board.
    }
};

export { readSelection, writeSelection, QUERY_PARAM, STORAGE_KEY };
