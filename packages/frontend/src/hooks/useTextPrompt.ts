import { useCallback, useRef, useState } from "react";

export interface TextPromptOptions {
    title: string;
    label?: string;
    defaultValue?: string;
    confirmLabel?: string;
}

export type PromptForText = (options: TextPromptOptions) => Promise<string | null>;

/**
 * An in-app replacement for `window.prompt`.
 *
 * Resolving a promise rather than exposing open/close state keeps call sites
 * reading exactly as they did when they were synchronous - `await promptForText(...)`
 * in place of `window.prompt(...)` - so whatever context the caller had stays in
 * scope instead of having to be parked in state until the dialog closes.
 */
export function useTextPrompt() {
    const [pending, setPending] = useState<TextPromptOptions | null>(null);
    const resolverRef = useRef<((value: string | null) => void) | null>(null);

    const promptForText = useCallback<PromptForText>(
        (options) =>
            new Promise<string | null>((resolve) => {
                // A second prompt opening over the first would strand its promise
                // unresolved, so treat the displaced one as cancelled.
                resolverRef.current?.(null);
                resolverRef.current = resolve;
                setPending(options);
            }),
        [],
    );

    const settle = useCallback((value: string | null) => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setPending(null);
        resolve?.(value);
    }, []);

    const onSubmit = useCallback((value: string) => settle(value), [settle]);
    const onCancel = useCallback(() => settle(null), [settle]);

    return {
        promptForText,
        dialogProps: {
            open: pending !== null,
            title: pending?.title ?? "",
            label: pending?.label,
            defaultValue: pending?.defaultValue ?? "",
            confirmLabel: pending?.confirmLabel,
            onSubmit,
            onCancel,
        },
    };
}
