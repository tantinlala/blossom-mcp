import { getAuthor, getDeviceId } from "./identity";

describe("identity", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("keeps the same device id across calls so one browser is not counted twice", () => {
        expect(getDeviceId()).toBe(getDeviceId());
    });

    it("describes this browser as a person", () => {
        const author = getAuthor();

        expect(author.kind).toBe("person");
        expect(author.id).toBeTruthy();
    });

    it("reuses the id stored by an earlier session", () => {
        const first = getDeviceId();

        expect(getAuthor().id).toBe(first);
    });

    it("still produces an author when storage is unavailable", () => {
        const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("denied");
        });
        const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("denied");
        });

        expect(() => getAuthor()).not.toThrow();
        expect(getAuthor().id).toBeTruthy();

        getItem.mockRestore();
        setItem.mockRestore();
    });
});
