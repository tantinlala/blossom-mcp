import React, { useCallback, useEffect, useRef, useState } from "react";

export const DEFAULT_SIDE_PANEL_WIDTH = 340;
export const MIN_SIDE_PANEL_WIDTH = 260;
export const MAX_SIDE_PANEL_WIDTH = 800;

/** How far one arrow key press moves the edge, in pixels. */
const KEYBOARD_STEP = 16;

const WIDTH_KEY = "blossom.sidePanelWidth";

const clampWidth = (width: number): number =>
    Math.min(MAX_SIDE_PANEL_WIDTH, Math.max(MIN_SIDE_PANEL_WIDTH, Math.round(width)));

const readWidth = (): number => {
    try {
        const stored = Number(window.localStorage.getItem(WIDTH_KEY));
        return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_SIDE_PANEL_WIDTH;
    } catch {
        // Private browsing and similar can make localStorage throw, which opens
        // the panel at the width a first visit gets.
        return DEFAULT_SIDE_PANEL_WIDTH;
    }
};

const persistWidth = (width: number) => {
    try {
        window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
        // Not being able to remember the width is not worth failing over
    }
};

/** Props for the grab strip along the panel's left edge. */
export interface ResizeHandleProps {
    role: "separator";
    "aria-orientation": "vertical";
    "aria-label": string;
    "aria-valuenow": number;
    "aria-valuemin": number;
    "aria-valuemax": number;
    tabIndex: number;
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
}

/**
 * Owns how wide the docked panel is, and the drag that changes it.
 *
 * The width is clamped to a range that keeps both the panel's contents and the
 * canvas usable, and is remembered across reloads, so the slot opens at the size
 * the user last chose whichever panel fills it.
 */
export function useSidePanelWidth() {
    const [width, setWidth] = useState<number>(readWidth);
    const [dragging, setDragging] = useState(false);

    // The pointer handlers read the live width without re-subscribing, and the
    // drag start pins the arithmetic to where the grab began so a fast pointer
    // cannot drift away from the edge.
    const widthRef = useRef(width);
    const dragStart = useRef<{ pointerX: number; width: number } | null>(null);

    const applyWidth = useCallback((next: number) => {
        widthRef.current = clampWidth(next);
        setWidth(widthRef.current);
    }, []);

    // A drag crosses the whole window, and the browser reads that as selecting
    // the text it passes over.
    useEffect(() => {
        if (!dragging) {
            return;
        }
        const { body } = document;
        const previousUserSelect = body.style.userSelect;
        const previousCursor = body.style.cursor;
        body.style.userSelect = "none";
        body.style.cursor = "col-resize";
        return () => {
            body.style.userSelect = previousUserSelect;
            body.style.cursor = previousCursor;
        };
    }, [dragging]);

    const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        dragStart.current = { pointerX: event.clientX, width: widthRef.current };
        // Capture keeps the move and release events coming to the handle
        // once the pointer has left the few pixels it occupies.
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
    }, []);

    const onPointerMove = useCallback(
        (event: React.PointerEvent<HTMLElement>) => {
            const start = dragStart.current;
            if (!start) {
                return;
            }
            // The panel is docked to the right, so its edge moving left widens it
            applyWidth(start.width + (start.pointerX - event.clientX));
        },
        [applyWidth],
    );

    const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (!dragStart.current) {
            return;
        }
        dragStart.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        setDragging(false);
        persistWidth(widthRef.current);
    }, []);

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLElement>) => {
            const step = event.key === "ArrowLeft" ? KEYBOARD_STEP : event.key === "ArrowRight" ? -KEYBOARD_STEP : 0;
            if (step === 0) {
                return;
            }
            event.preventDefault();
            applyWidth(widthRef.current + step);
            persistWidth(widthRef.current);
        },
        [applyWidth],
    );

    const onDoubleClick = useCallback(() => {
        applyWidth(DEFAULT_SIDE_PANEL_WIDTH);
        persistWidth(widthRef.current);
    }, [applyWidth]);

    const handleProps: ResizeHandleProps = {
        role: "separator",
        "aria-orientation": "vertical",
        "aria-label": "Resize panel",
        "aria-valuenow": width,
        "aria-valuemin": MIN_SIDE_PANEL_WIDTH,
        "aria-valuemax": MAX_SIDE_PANEL_WIDTH,
        tabIndex: 0,
        onPointerDown,
        onPointerMove,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onKeyDown,
        onDoubleClick,
    };

    return { width, dragging, handleProps };
}
