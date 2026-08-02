import { resolveRealtimeUrl } from "./realtimeUrl";

describe("resolveRealtimeUrl", () => {
    const pageUrl = "http://localhost:3000/";

    it("uses an explicit override verbatim", () => {
        expect(resolveRealtimeUrl("ws://elsewhere:9000/socket", "http://localhost:3030/api", pageUrl)).toBe(
            "ws://elsewhere:9000/socket",
        );
    });

    it("derives the socket from the API URL, keeping host and port", () => {
        expect(resolveRealtimeUrl(undefined, "http://192.168.0.186:3030/api", pageUrl)).toBe(
            "ws://192.168.0.186:3030/ws",
        );
    });

    it("upgrades to a secure socket when the API is served over https", () => {
        expect(resolveRealtimeUrl(undefined, "https://blossom.example.com/api", pageUrl)).toBe(
            "wss://blossom.example.com/ws",
        );
    });

    it("falls back to the default backend when nothing is configured", () => {
        expect(resolveRealtimeUrl(undefined, undefined, pageUrl)).toBe("ws://localhost:3030/ws");
    });

    it("resolves a relative API URL against the page it is served from", () => {
        expect(resolveRealtimeUrl(undefined, "/api", "https://blossom.example.com/roadmap")).toBe(
            "wss://blossom.example.com/ws",
        );
    });

    it("drops any query string or fragment on the API URL", () => {
        expect(resolveRealtimeUrl(undefined, "http://localhost:3030/api?debug=1#top", pageUrl)).toBe(
            "ws://localhost:3030/ws",
        );
    });
});
