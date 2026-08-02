import { REALTIME_PATH } from "@blossom/common";

export const DEFAULT_API_URL = "http://localhost:3030/api";

/**
 * Works out where the realtime socket lives.
 *
 * By default it is derived from the REST URL rather than configured separately,
 * so pointing the app at another machine (a LAN IP in .env.development, say)
 * moves both transports at once. REACT_APP_WS_URL overrides it for the cases
 * where the socket really does live somewhere else.
 */
export const resolveRealtimeUrl = (
    wsUrl: string | undefined = process.env.REACT_APP_WS_URL,
    apiUrl: string | undefined = process.env.REACT_APP_API_URL,
    base: string = typeof window === "undefined" ? DEFAULT_API_URL : window.location.href,
): string => {
    if (wsUrl) {
        return wsUrl;
    }

    // `base` lets a relative REACT_APP_API_URL resolve against the page origin.
    const url = new URL(apiUrl || DEFAULT_API_URL, base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = REALTIME_PATH;
    url.search = "";
    url.hash = "";
    return url.toString();
};
