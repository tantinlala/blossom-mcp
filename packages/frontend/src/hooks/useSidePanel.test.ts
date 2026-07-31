import { renderHook, act } from "@testing-library/react";
import { useSidePanel } from "./useSidePanel";

describe("useSidePanel", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("starts on the inbox", () => {
        const { result } = renderHook(() => useSidePanel());

        expect(result.current.activePanel).toBe("inbox");
    });

    it("only ever shows one panel", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.showNextTasks());
        expect(result.current.activePanel).toBe("nextTasks");

        act(() => result.current.showDetails());
        expect(result.current.activePanel).toBe("details");

        act(() => result.current.showNextTasks());
        expect(result.current.activePanel).toBe("nextTasks");
    });

    it("hands the slot back to the inbox when a panel is closed", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.showDetails());
        act(() => result.current.closeActivePanel());

        expect(result.current.activePanel).toBe("inbox");
    });

    it("closes the inbox itself, leaving nothing on screen", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.closeActivePanel());

        expect(result.current.activePanel).toBeNull();
    });

    it("keeps the inbox dismissed when a later panel is closed", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.closeActivePanel());
        act(() => result.current.showNextTasks());
        act(() => result.current.closeActivePanel());

        expect(result.current.activePanel).toBeNull();
    });

    it("toggleNextTasks closes the list when it is already showing", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.toggleNextTasks());
        expect(result.current.activePanel).toBe("nextTasks");

        act(() => result.current.toggleNextTasks());
        expect(result.current.activePanel).toBe("inbox");
    });

    it("reveals the inbox from behind another panel rather than dismissing it", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.showNextTasks());
        act(() => result.current.toggleInbox());

        expect(result.current.activePanel).toBe("inbox");
    });

    it("toggleInbox dismisses and restores the inbox when nothing is over it", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.toggleInbox());
        expect(result.current.activePanel).toBeNull();

        act(() => result.current.toggleInbox());
        expect(result.current.activePanel).toBe("inbox");
    });

    it("remembers a dismissed inbox across reloads", () => {
        const { result, unmount } = renderHook(() => useSidePanel());
        act(() => result.current.closeActivePanel());
        unmount();

        const remounted = renderHook(() => useSidePanel());

        expect(remounted.result.current.activePanel).toBeNull();
    });

    it("falls back to showing the inbox when localStorage is unavailable", () => {
        const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("denied");
        });

        const { result } = renderHook(() => useSidePanel());

        expect(result.current.activePanel).toBe("inbox");
        getItem.mockRestore();
    });
});
