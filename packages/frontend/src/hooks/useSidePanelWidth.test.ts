import React from "react";
import { renderHook, act } from "@testing-library/react";
import {
    useSidePanelWidth,
    DEFAULT_SIDE_PANEL_WIDTH,
    MIN_SIDE_PANEL_WIDTH,
    MAX_SIDE_PANEL_WIDTH,
} from "./useSidePanelWidth";

const capture = { setPointerCapture: jest.fn(), releasePointerCapture: jest.fn() };

const pointerEvent = (clientX: number, button = 0) =>
    ({
        button,
        clientX,
        pointerId: 1,
        preventDefault: jest.fn(),
        currentTarget: capture,
    }) as unknown as React.PointerEvent<HTMLElement>;

const keyEvent = (key: string) => ({ key, preventDefault: jest.fn() }) as unknown as React.KeyboardEvent<HTMLElement>;

describe("useSidePanelWidth", () => {
    beforeEach(() => {
        window.localStorage.clear();
        jest.clearAllMocks();
    });

    /** Grabs the handle at `from` and moves it to `to`. */
    const drag = (result: { current: ReturnType<typeof useSidePanelWidth> }, from: number, to: number) => {
        act(() => result.current.handleProps.onPointerDown(pointerEvent(from)));
        act(() => result.current.handleProps.onPointerMove(pointerEvent(to)));
        act(() => result.current.handleProps.onPointerUp(pointerEvent(to)));
    };

    it("opens at the default width", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH);
        expect(result.current.dragging).toBe(false);
    });

    it("widens the panel when the handle is dragged left", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        drag(result, 800, 700);

        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH + 100);
    });

    it("narrows the panel when the handle is dragged right", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        drag(result, 800, 850);

        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH - 50);
    });

    it("measures each move from where the drag began", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        act(() => result.current.handleProps.onPointerDown(pointerEvent(800)));
        act(() => result.current.handleProps.onPointerMove(pointerEvent(760)));
        act(() => result.current.handleProps.onPointerMove(pointerEvent(780)));

        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH + 20);
    });

    it("reports that a drag is under way while the handle is held", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        act(() => result.current.handleProps.onPointerDown(pointerEvent(800)));
        expect(result.current.dragging).toBe(true);

        act(() => result.current.handleProps.onPointerUp(pointerEvent(700)));
        expect(result.current.dragging).toBe(false);
    });

    it("keeps the pointer's moves coming to the handle it left", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        act(() => result.current.handleProps.onPointerDown(pointerEvent(800)));
        expect(capture.setPointerCapture).toHaveBeenCalledWith(1);

        act(() => result.current.handleProps.onPointerUp(pointerEvent(700)));
        expect(capture.releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it("stops following the pointer once the handle is released", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        drag(result, 800, 700);
        act(() => result.current.handleProps.onPointerMove(pointerEvent(400)));

        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH + 100);
    });

    it("leaves the width alone for a press of another pointer button", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        act(() => result.current.handleProps.onPointerDown(pointerEvent(800, 2)));
        act(() => result.current.handleProps.onPointerMove(pointerEvent(600)));

        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH);
        expect(result.current.dragging).toBe(false);
    });

    it("holds the panel within a width that leaves both it and the canvas usable", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        drag(result, 800, 0);
        expect(result.current.width).toBe(MAX_SIDE_PANEL_WIDTH);

        drag(result, 800, 2000);
        expect(result.current.width).toBe(MIN_SIDE_PANEL_WIDTH);
    });

    it("moves the edge with the arrow keys", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        act(() => result.current.handleProps.onKeyDown(keyEvent("ArrowLeft")));
        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH + 16);

        act(() => result.current.handleProps.onKeyDown(keyEvent("ArrowRight")));
        act(() => result.current.handleProps.onKeyDown(keyEvent("ArrowRight")));
        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH - 16);
    });

    it("ignores keys that do not move the edge", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        act(() => result.current.handleProps.onKeyDown(keyEvent("Enter")));

        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH);
    });

    it("returns to the default width on a double click", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        drag(result, 800, 600);
        act(() => result.current.handleProps.onDoubleClick());

        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH);
    });

    it("remembers the chosen width across reloads", () => {
        const { result, unmount } = renderHook(() => useSidePanelWidth());
        drag(result, 800, 700);
        unmount();

        const remounted = renderHook(() => useSidePanelWidth());

        expect(remounted.result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH + 100);
    });

    it("remembers a width set with the keyboard", () => {
        const { result, unmount } = renderHook(() => useSidePanelWidth());
        act(() => result.current.handleProps.onKeyDown(keyEvent("ArrowLeft")));
        unmount();

        const remounted = renderHook(() => useSidePanelWidth());

        expect(remounted.result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH + 16);
    });

    it("opens at the default width when a stored width makes no sense", () => {
        window.localStorage.setItem("blossom.sidePanelWidth", "not a width");

        const { result } = renderHook(() => useSidePanelWidth());

        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH);
    });

    it("brings a stored width back within range", () => {
        window.localStorage.setItem("blossom.sidePanelWidth", "5000");

        const { result } = renderHook(() => useSidePanelWidth());

        expect(result.current.width).toBe(MAX_SIDE_PANEL_WIDTH);
    });

    it("opens at the default width when localStorage is unavailable", () => {
        const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("denied");
        });

        const { result } = renderHook(() => useSidePanelWidth());

        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH);
        getItem.mockRestore();
    });

    it("keeps resizing when the width cannot be stored", () => {
        const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("denied");
        });

        const { result } = renderHook(() => useSidePanelWidth());
        drag(result, 800, 700);

        expect(result.current.width).toBe(DEFAULT_SIDE_PANEL_WIDTH + 100);
        setItem.mockRestore();
    });

    it("frees the page's text selection once the drag ends", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        act(() => result.current.handleProps.onPointerDown(pointerEvent(800)));
        expect(document.body.style.userSelect).toBe("none");

        act(() => result.current.handleProps.onPointerUp(pointerEvent(700)));
        expect(document.body.style.userSelect).toBe("");
    });

    it("ends the drag when the pointer is taken away", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        act(() => result.current.handleProps.onPointerDown(pointerEvent(800)));
        act(() => result.current.handleProps.onPointerCancel(pointerEvent(700)));

        expect(result.current.dragging).toBe(false);
        expect(document.body.style.userSelect).toBe("");
    });

    it("describes the edge it moves to assistive technology", () => {
        const { result } = renderHook(() => useSidePanelWidth());

        expect(result.current.handleProps).toMatchObject({
            role: "separator",
            "aria-orientation": "vertical",
            "aria-valuenow": DEFAULT_SIDE_PANEL_WIDTH,
            "aria-valuemin": MIN_SIDE_PANEL_WIDTH,
            "aria-valuemax": MAX_SIDE_PANEL_WIDTH,
            tabIndex: 0,
        });
    });
});
