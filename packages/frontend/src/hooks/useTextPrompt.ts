import { useCallback, useRef, useState } from "react";

export interface TextPromptOptions {
    title: string;
    label?: string;
    defaultValue?: string;
    confirmLabel?: string;
}

export type PromptForText = (options: TextPromptOptions) => Promise<string | null>;

/**
 * Asks the user for a line of text and resolves to what they typed, or to null
 * if they cancel.
 *
 * Resolving a promise keeps a call site reading as straight-line code -
 * `await promptForText(...)` - so whatever context it holds stays in scope
 * across the await.
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
