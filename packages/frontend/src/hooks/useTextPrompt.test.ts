import { renderHook, act } from "@testing-library/react";
import { useTextPrompt } from "./useTextPrompt";

describe("useTextPrompt", () => {
    it("starts closed", () => {
        const { result } = renderHook(() => useTextPrompt());

        expect(result.current.dialogProps.open).toBe(false);
    });

    it("opens the dialog with the requested copy", () => {
        const { result } = renderHook(() => useTextPrompt());

        act(() => {
            result.current.promptForText({ title: "Add a task", label: "Task name", defaultValue: "New Task" });
        });

        expect(result.current.dialogProps.open).toBe(true);
        expect(result.current.dialogProps.title).toBe("Add a task");
        expect(result.current.dialogProps.label).toBe("Task name");
        expect(result.current.dialogProps.defaultValue).toBe("New Task");
    });

    it("resolves with the submitted value and closes", async () => {
        const { result } = renderHook(() => useTextPrompt());

        let pending: Promise<string | null>;
        act(() => {
            pending = result.current.promptForText({ title: "Add a task" });
        });
        act(() => result.current.dialogProps.onSubmit("Book flights"));

        await expect(pending).resolves.toBe("Book flights");
        expect(result.current.dialogProps.open).toBe(false);
    });

    it("resolves null when cancelled, so callers can treat it as a no-op", async () => {
        const { result } = renderHook(() => useTextPrompt());

        let pending: Promise<string | null>;
        act(() => {
            pending = result.current.promptForText({ title: "Add a task" });
        });
        act(() => result.current.dialogProps.onCancel());

        await expect(pending).resolves.toBeNull();
        expect(result.current.dialogProps.open).toBe(false);
    });

    it("cancels a prompt that a second one displaces, rather than stranding it", async () => {
        const { result } = renderHook(() => useTextPrompt());

        let first: Promise<string | null>;
        let second: Promise<string | null>;
        act(() => {
            first = result.current.promptForText({ title: "First" });
        });
        act(() => {
            second = result.current.promptForText({ title: "Second" });
        });

        await expect(first).resolves.toBeNull();

        act(() => result.current.dialogProps.onSubmit("done"));
        await expect(second).resolves.toBe("done");
    });

    it("can be reopened after being settled", async () => {
        const { result } = renderHook(() => useTextPrompt());

        let pending: Promise<string | null>;
        act(() => {
            pending = result.current.promptForText({ title: "First" });
        });
        act(() => result.current.dialogProps.onSubmit("one"));
        await pending;

        act(() => {
            pending = result.current.promptForText({ title: "Second" });
        });

        expect(result.current.dialogProps.open).toBe(true);
        expect(result.current.dialogProps.title).toBe("Second");
    });
});
