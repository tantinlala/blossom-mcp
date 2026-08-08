/**
 * Finds web URLs inside plain text and splits the text into segments, so a
 * renderer can turn the URLs into links and leave everything else as text.
 *
 * Only `http`, `https` and bare `www.` addresses are recognised, which keeps
 * the generated `href` values restricted to the web.
 */

export interface TextSegment {
    kind: "text";
    value: string;
}

export interface LinkSegment {
    kind: "link";
    /** The URL exactly as it appears in the text. */
    value: string;
    /** Absolute URL for the `href`; bare `www.` addresses gain an `https` scheme. */
    href: string;
}

export type Segment = TextSegment | LinkSegment;

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>]+/gi;

/** Punctuation that ends a sentence, so it belongs to the prose around the URL. */
const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;

/** Closing brackets, mapped to the opener that has to appear for them to count. */
const BRACKET_PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

const countOccurrences = (text: string, character: string): number => text.split(character).length - 1;

/**
 * Drops characters from the end of a match that read as punctuation around the
 * URL: sentence punctuation, and closing brackets whose opener is outside the
 * match, as in `(see https://example.com)`.
 */
const trimTrailingPunctuation = (url: string): string => {
    let trimmed = url;
    let changed = true;

    while (changed && trimmed.length > 0) {
        changed = false;

        const withoutPunctuation = trimmed.replace(TRAILING_PUNCTUATION, "");
        if (withoutPunctuation !== trimmed) {
            trimmed = withoutPunctuation;
            changed = true;
        }

        const opener = BRACKET_PAIRS[trimmed.slice(-1)];
        if (opener && countOccurrences(trimmed, trimmed.slice(-1)) > countOccurrences(trimmed, opener)) {
            trimmed = trimmed.slice(0, -1);
            changed = true;
        }
    }

    return trimmed;
};

/** A trimmed match is a link when it still carries a scheme, or a `www.` host with a dot in it. */
const isLinkable = (url: string): boolean =>
    /^https?:\/\/[^\s<>]+$/i.test(url) || /^www\.[^\s<>]+\.[^\s<>]+$/i.test(url);

const toHref = (url: string): string => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/**
 * Splits `text` into consecutive segments covering every character of the
 * input. Text with no URLs in it yields a single text segment; empty text
 * yields no segments.
 */
export const splitIntoSegments = (text: string): Segment[] => {
    const segments: Segment[] = [];
    let cursor = 0;

    URL_PATTERN.lastIndex = 0;
    let match = URL_PATTERN.exec(text);

    while (match !== null) {
        const url = trimTrailingPunctuation(match[0]);
        const start = match.index;

        if (isLinkable(url)) {
            if (start > cursor) {
                segments.push({ kind: "text", value: text.slice(cursor, start) });
            }
            segments.push({ kind: "link", value: url, href: toHref(url) });
            cursor = start + url.length;
            URL_PATTERN.lastIndex = cursor;
        }

        match = URL_PATTERN.exec(text);
    }

    if (cursor < text.length) {
        segments.push({ kind: "text", value: text.slice(cursor) });
    }

    return segments;
};
