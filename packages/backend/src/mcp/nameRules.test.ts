import { checkName, checkNames, InvalidNameError, MAX_NAME_CHARS } from "./nameRules";

describe("checkName", () => {
    describe("names it refuses", () => {
        it("should refuse a name past the character limit, quoting it", () => {
            const tooLong = "a".repeat(MAX_NAME_CHARS + 1);

            expect(() => checkName(tooLong)).toThrow(InvalidNameError);
            expect(() => checkName(tooLong)).toThrow(/40 characters/);
        });

        it("should point at the description field when it refuses a long name", () => {
            expect(() => checkName("a".repeat(MAX_NAME_CHARS + 1))).toThrow(/description/);
        });

        it("should accept a name exactly at the limit", () => {
            const atTheLimit = "Book the venue and confirm the caterer".padEnd(MAX_NAME_CHARS, "s");

            expect(atTheLimit).toHaveLength(MAX_NAME_CHARS);
            expect(() => checkName(atTheLimit)).not.toThrow();
        });

        it("should refuse a name holding a line break", () => {
            expect(() => checkName("Book venue\nSeats 80")).toThrow(InvalidNameError);
            expect(() => checkName("Book venue\r\nSeats 80")).toThrow(InvalidNameError);
        });
    });

    describe("names it warns about", () => {
        it("should warn about a name joining two actions", () => {
            expect(checkName("Book venue and print flyers")).toEqual([expect.stringContaining("two tasks")]);
        });

        it("should not read a word merely containing 'and' as a join", () => {
            expect(checkName("Sand the floor")).toEqual([]);
            expect(checkName("Brand the packaging")).toEqual([]);
        });

        it("should warn about a question", () => {
            expect(checkName("Which venue?")).toEqual([expect.stringContaining("question")]);
        });

        it("should warn about a single word", () => {
            expect(checkName("Venue")).toEqual([expect.stringContaining("single word")]);
        });

        it("should raise every warning a name earns", () => {
            expect(checkName("Venue and catering?")).toHaveLength(2);
        });

        it("should say nothing about a short imperative action", () => {
            expect(checkName("Book venue")).toEqual([]);
            expect(checkName("Sign software engineering offer")).toEqual([]);
        });
    });
});

describe("checkNames", () => {
    it("should gather the warnings from every name given", () => {
        expect(checkNames(["Book venue", "Venue", "Which venue?"])).toHaveLength(2);
    });

    it("should skip names that were left out", () => {
        expect(checkNames([undefined, "Book venue"])).toEqual([]);
    });

    it("should refuse the whole set when one name cannot be stored", () => {
        expect(() => checkNames(["Book venue", "a".repeat(MAX_NAME_CHARS + 1)])).toThrow(InvalidNameError);
    });
});
