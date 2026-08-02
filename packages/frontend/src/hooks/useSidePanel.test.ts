import { renderHook, act } from "@testing-library/react";
import { useSidePanel } from "./useSidePanel";

describe("useSidePanel", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("starts with the slot empty", () => {
        const { result } = renderHook(() => useSidePanel());

        expect(result.current.activePanel).toBeNull();
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

    it("empties the slot when a panel over the inbox is closed", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.showInbox());
        act(() => result.current.showDetails());
        act(() => result.current.closeActivePanel());

        expect(result.current.activePanel).toBeNull();
    });

    it("keeps the slot empty across a reload once a panel is closed", () => {
        const { result, unmount } = renderHook(() => useSidePanel());

        act(() => result.current.showInbox());
        act(() => result.current.showNextTasks());
        act(() => result.current.closeActivePanel());
        unmount();

        const remounted = renderHook(() => useSidePanel());

        expect(remounted.result.current.activePanel).toBeNull();
    });

    it("leaves the slot empty when a panel is closed over a closed inbox", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.showDetails());
        act(() => result.current.closeActivePanel());

        expect(result.current.activePanel).toBeNull();
    });

    it("closes the inbox itself, leaving nothing on screen", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.showInbox());
        act(() => result.current.closeActivePanel());

        expect(result.current.activePanel).toBeNull();
    });

    it("toggleNextTasks closes the list when it is already showing", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.toggleNextTasks());
        expect(result.current.activePanel).toBe("nextTasks");

        act(() => result.current.toggleNextTasks());
        expect(result.current.activePanel).toBeNull();
    });

    it("reveals the inbox from behind another panel", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.showNextTasks());
        act(() => result.current.toggleInbox());

        expect(result.current.activePanel).toBe("inbox");
    });

    it("toggleInbox opens and closes the inbox when nothing is over it", () => {
        const { result } = renderHook(() => useSidePanel());

        act(() => result.current.toggleInbox());
        expect(result.current.activePanel).toBe("inbox");

        act(() => result.current.toggleInbox());
        expect(result.current.activePanel).toBeNull();
    });

    it("remembers an open inbox across reloads", () => {
        const { result, unmount } = renderHook(() => useSidePanel());
        act(() => result.current.showInbox());
        unmount();

        const remounted = renderHook(() => useSidePanel());

        expect(remounted.result.current.activePanel).toBe("inbox");
    });

    it("leaves the slot empty when localStorage is unavailable", () => {
        const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("denied");
        });

        const { result } = renderHook(() => useSidePanel());

        expect(result.current.activePanel).toBeNull();
        getItem.mockRestore();
    });
});
