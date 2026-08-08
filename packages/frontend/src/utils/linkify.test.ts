import { splitIntoSegments } from "./linkify";

describe("splitIntoSegments", () => {
    it("returns no segments for empty text", () => {
        expect(splitIntoSegments("")).toEqual([]);
    });

    it("returns a single text segment when there is no URL", () => {
        expect(splitIntoSegments("Just a plain description.")).toEqual([
            { kind: "text", value: "Just a plain description." },
        ]);
    });

    it("recognises an https URL", () => {
        expect(splitIntoSegments("See https://example.com/spec for details")).toEqual([
            { kind: "text", value: "See " },
            { kind: "link", value: "https://example.com/spec", href: "https://example.com/spec" },
            { kind: "text", value: " for details" },
        ]);
    });

    it("recognises an http URL", () => {
        expect(splitIntoSegments("http://example.com")).toEqual([
            { kind: "link", value: "http://example.com", href: "http://example.com" },
        ]);
    });

    it("gives a bare www address an https scheme while showing it as written", () => {
        expect(splitIntoSegments("www.example.com")).toEqual([
            { kind: "link", value: "www.example.com", href: "https://www.example.com" },
        ]);
    });

    it("keeps query strings, fragments and ports in the URL", () => {
        const url = "https://example.com:8080/path?a=1&b=2#section";
        expect(splitIntoSegments(url)).toEqual([{ kind: "link", value: url, href: url }]);
    });

    it("finds several URLs in one description", () => {
        expect(splitIntoSegments("a https://one.com b www.two.com c")).toEqual([
            { kind: "text", value: "a " },
            { kind: "link", value: "https://one.com", href: "https://one.com" },
            { kind: "text", value: " b " },
            { kind: "link", value: "www.two.com", href: "https://www.two.com" },
            { kind: "text", value: " c" },
        ]);
    });

    it("leaves a sentence-ending full stop out of the URL", () => {
        expect(splitIntoSegments("Read https://example.com/docs.")).toEqual([
            { kind: "text", value: "Read " },
            { kind: "link", value: "https://example.com/docs", href: "https://example.com/docs" },
            { kind: "text", value: "." },
        ]);
    });

    it("leaves a closing bracket whose opener sits outside the URL as text", () => {
        expect(splitIntoSegments("(see https://example.com)")).toEqual([
            { kind: "text", value: "(see " },
            { kind: "link", value: "https://example.com", href: "https://example.com" },
            { kind: "text", value: ")" },
        ]);
    });

    it("keeps a balanced pair of brackets inside the URL", () => {
        const url = "https://example.com/wiki/Thing_(disambiguation)";
        expect(splitIntoSegments(url)).toEqual([{ kind: "link", value: url, href: url }]);
    });

    it("treats a scheme with no host as text", () => {
        expect(splitIntoSegments("write https:// here")).toEqual([{ kind: "text", value: "write https:// here" }]);
    });

    it("treats a www prefix with no domain as text", () => {
        expect(splitIntoSegments("www.,")).toEqual([{ kind: "text", value: "www.," }]);
    });

    it("ignores schemes other than http and https", () => {
        const text = "javascript:alert(1) and mailto:someone@example.com";
        expect(splitIntoSegments(text)).toEqual([{ kind: "text", value: text }]);
    });

    it("keeps line breaks in the surrounding text", () => {
        expect(splitIntoSegments("Line one\nhttps://example.com\nLine three")).toEqual([
            { kind: "text", value: "Line one\n" },
            { kind: "link", value: "https://example.com", href: "https://example.com" },
            { kind: "text", value: "\nLine three" },
        ]);
    });
});
