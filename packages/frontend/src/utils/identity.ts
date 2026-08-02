import { Author } from "@blossom/common";

const ID_KEY = "blossom.deviceId";

// localStorage is unavailable in private-mode edge cases and in some test
// environments. Identity is a nicety, not a requirement, so failures downgrade
// to an unattributed session rather than breaking the app.
const read = (key: string): string | null => {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const write = (key: string, value: string) => {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Nothing to do: this browser gets a fresh id on the next load.
    }
};

const randomId = (): string => {
    const crypto = typeof window !== "undefined" ? window.crypto : undefined;
    if (crypto?.randomUUID) {
        return crypto.randomUUID();
    }
    return `device-${Math.random().toString(36).slice(2)}`;
};

/**
 * Stable per-browser id. Two tabs on the same device share it, so one person
 * with several tabs open counts once.
 */
export const getDeviceId = (): string => {
    const existing = read(ID_KEY);
    if (existing) {
        return existing;
    }
    const created = randomId();
    write(ID_KEY, created);
    return created;
};

/**
 * Who this browser is, for telling changes apart. Nobody is asked for anything
 * and nothing is displayed: this exists so undo cannot revert work that is not
 * yours, and so a project switch knows how many others it would disturb.
 */
export const getAuthor = (): Author => ({ id: getDeviceId(), kind: "person" });
