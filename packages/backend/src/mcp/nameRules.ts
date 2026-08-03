/**
 * The rules a goal or task name has to follow, checked where the write happens.
 *
 * A name is a label on a fixed-width roadmap node, so length and line breaks
 * decide whether the graph stays readable; those are refused outright. The rest
 * of what makes a good name - an imperative verb, one action per task - needs a
 * reader to judge, so it comes back as a warning the caller can act on or
 * ignore, and the write goes through either way.
 */

// Roughly what fits on one or two lines of a roadmap node before the box grows
// and the graph becomes hard to read.
const MAX_NAME_CHARS = 40;

/** A name that cannot be stored as it stands. */
class InvalidNameError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidNameError";
    }
}

/**
 * Refuses a name the roadmap cannot render, and returns whatever is worth
 * saying about the one it accepts. An empty array means nothing to report.
 *
 * Pass `subgoal: true` for a name that labels a task holding a subplan (or the
 * goal itself): such a name spans the several tasks inside it, so joining two
 * things with "and" is its job and earns no warning.
 */
const checkName = (name: string, { subgoal = false }: { subgoal?: boolean } = {}): string[] => {
    if (/[\r\n]/.test(name)) {
        throw new InvalidNameError(
            "A name is a single-line label on a roadmap node and cannot contain a line break. " +
                "Keep the first line as the name and move the rest into the description.",
        );
    }
    if (name.length > MAX_NAME_CHARS) {
        throw new InvalidNameError(
            `A name is a label on a roadmap node and can be at most ${MAX_NAME_CHARS} characters; ` +
                `"${name}" is ${name.length}. Shorten it to a short imperative action and move the ` +
                `detail into the description.`,
        );
    }

    const warnings: string[] = [];
    const trimmed = name.trim();

    // For a leaf task, "and" usually means the name holds two tasks; a subgoal
    // covers everything inside it, so its name gets to span several things.
    if (!subgoal && /\sand\s/i.test(trimmed)) {
        warnings.push(`"${trimmed}" joins two actions with "and", which usually means it is two tasks.`);
    }
    if (trimmed.endsWith("?")) {
        warnings.push(`"${trimmed}" is a question. A name is the action to take, not the thing to find out.`);
    }
    // Judging whether a word is an imperative verb takes a reader, so every
    // one-word name is flagged: most of them are the bare noun the task is
    // about ("Venue") rather than what to do about it ("Book venue").
    if (trimmed !== "" && !/\s/.test(trimmed)) {
        warnings.push(`"${trimmed}" is a single word. Name the action, as in "Book venue" over "Venue".`);
    }

    return warnings;
};

/** Checks several names at once and returns every warning they raise. */
const checkNames = (names: (string | undefined)[]): string[] =>
    names.flatMap((name) => (name === undefined ? [] : checkName(name)));

export { checkName, checkNames, InvalidNameError, MAX_NAME_CHARS };
