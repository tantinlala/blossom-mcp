import { QUERY_PARAM, readSelection, STORAGE_KEY, writeSelection } from "./viewSelection";

/** Puts the address bar at a given query string, without leaving the test page. */
const setSearch = (search: string) => {
    window.history.replaceState(null, "", `/${search}`);
};

describe("viewSelection", () => {
    beforeEach(() => {
        window.localStorage.clear();
        setSearch("");
    });

    describe("readSelection", () => {
        it("reads the board from the address bar, so a link opens what it names", () => {
            setSearch(`?${QUERY_PARAM}=Trip,House`);

            expect(readSelection()).toEqual(["Trip", "House"]);
        });

        it("falls back to the board this browser was last on", () => {
            window.localStorage.setItem(STORAGE_KEY, "House");

            expect(readSelection()).toEqual(["House"]);
        });

        it("lets the address bar win, since a link says what to open", () => {
            window.localStorage.setItem(STORAGE_KEY, "House");
            setSearch(`?${QUERY_PARAM}=Trip`);

            expect(readSelection()).toEqual(["Trip"]);
        });

        it("reads an empty board from a link that names no projects", () => {
            window.localStorage.setItem(STORAGE_KEY, "House");
            setSearch(`?${QUERY_PARAM}=`);

            expect(readSelection()).toEqual([]);
        });

        it("reads an empty board when neither says anything", () => {
            expect(readSelection()).toEqual([]);
        });

        it("ignores blank entries and surrounding space", () => {
            setSearch(`?${QUERY_PARAM}=${encodeURIComponent(" Trip , ,House ")}`);

            expect(readSelection()).toEqual(["Trip", "House"]);
        });

        it("keeps a project named twice to a single lane", () => {
            setSearch(`?${QUERY_PARAM}=Trip,House,Trip`);

            expect(readSelection()).toEqual(["Trip", "House"]);
        });
    });

    describe("writeSelection", () => {
        it("puts the board in the address bar, so the link carries it", () => {
            writeSelection(["Trip", "House"]);

            expect(new URLSearchParams(window.location.search).get(QUERY_PARAM)).toBe("Trip,House");
        });

        it("records the board so the next visit opens on it", () => {
            writeSelection(["Trip"]);

            expect(window.localStorage.getItem(STORAGE_KEY)).toBe("Trip");
        });

        it("takes the projects out of the address bar for an empty board", () => {
            writeSelection(["Trip"]);

            writeSelection([]);

            expect(new URLSearchParams(window.location.search).has(QUERY_PARAM)).toBe(false);
            expect(window.localStorage.getItem(STORAGE_KEY)).toBe("");
        });

        it("leaves the rest of the address bar alone", () => {
            setSearch("?other=keep-me");

            writeSelection(["Trip"]);

            expect(new URLSearchParams(window.location.search).get("other")).toBe("keep-me");
        });

        it("round-trips through readSelection", () => {
            writeSelection(["Trip", "House"]);

            expect(readSelection()).toEqual(["Trip", "House"]);
        });
    });
});
