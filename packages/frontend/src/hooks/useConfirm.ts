import { useCallback, useRef, useState } from "react";

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
}

export type AskForConfirmation = (options: ConfirmOptions) => Promise<boolean>;

/**
 * Asks the user a yes/no question and resolves to their answer.
 *
 * Resolving a promise, as [[useTextPrompt]] does, keeps a call site reading as
 * straight-line code with its context still in scope.
 */
export function useConfirm() {
    const [pending, setPending] = useState<ConfirmOptions | null>(null);
    const resolverRef = useRef<((value: boolean) => void) | null>(null);

    const askForConfirmation = useCallback<AskForConfirmation>(
        (options) =>
            new Promise<boolean>((resolve) => {
                // A second question opening over the first would strand its
                // promise unresolved, so treat the displaced one as declined.
                resolverRef.current?.(false);
                resolverRef.current = resolve;
                setPending(options);
            }),
        [],
    );

    const settle = useCallback((value: boolean) => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setPending(null);
        resolve?.(value);
    }, []);

    const onConfirm = useCallback(() => settle(true), [settle]);
    const onCancel = useCallback(() => settle(false), [settle]);

    return {
        askForConfirmation,
        dialogProps: {
            open: pending !== null,
            title: pending?.title ?? "",
            message: pending?.message ?? "",
            confirmLabel: pending?.confirmLabel,
            onConfirm,
            onCancel,
        },
    };
}
