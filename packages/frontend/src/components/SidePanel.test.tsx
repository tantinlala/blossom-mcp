import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import SidePanel from "./SidePanel";
import { DEFAULT_SIDE_PANEL_WIDTH } from "../hooks/useSidePanelWidth";

describe("SidePanel", () => {
    const onClose = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
    });

    const renderPanel = (open: boolean) =>
        render(
            <SidePanel open={open} title="Task Details" onClose={onClose} testId="side-panel">
                <p>Panel body</p>
            </SidePanel>,
        );

    it("renders the title and children when open", () => {
        renderPanel(true);

        expect(screen.getByTestId("side-panel")).toBeInTheDocument();
        expect(screen.getByText("Task Details")).toBeInTheDocument();
        expect(screen.getByText("Panel body")).toBeInTheDocument();
    });

    it("renders nothing when closed", () => {
        renderPanel(false);

        expect(screen.queryByTestId("side-panel")).not.toBeInTheDocument();
        expect(screen.queryByText("Panel body")).not.toBeInTheDocument();
    });

    it("calls onClose when the close button is clicked", () => {
        renderPanel(true);

        fireEvent.click(screen.getByRole("button", { name: "Close Task Details" }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("renders as a plain flex sibling that takes up width in the layout", () => {
        renderPanel(true);

        expect(screen.getByTestId("side-panel").tagName).toBe("ASIDE");
    });

    it("offers a handle on the left edge for resizing the panel", () => {
        renderPanel(true);

        const handle = screen.getByRole("separator", { name: "Resize panel" });

        expect(handle).toHaveAttribute("aria-valuenow", String(DEFAULT_SIDE_PANEL_WIDTH));
        expect(handle).toHaveAttribute("aria-orientation", "vertical");
    });

    it("widens the panel as the handle is dragged left", () => {
        renderPanel(true);
        const handle = screen.getByTestId("side-panel-resize-handle");

        fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 900 });
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: 820 });
        fireEvent.pointerUp(handle, { pointerId: 1, clientX: 820 });

        expect(handle).toHaveAttribute("aria-valuenow", String(DEFAULT_SIDE_PANEL_WIDTH + 80));
        expect(screen.getByTestId("side-panel")).toHaveStyle({ width: `${DEFAULT_SIDE_PANEL_WIDTH + 80}px` });
    });

    it("opens at the width the last drag left behind", () => {
        const { unmount } = renderPanel(true);
        const handle = screen.getByTestId("side-panel-resize-handle");
        fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 900 });
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: 820 });
        fireEvent.pointerUp(handle, { pointerId: 1, clientX: 820 });
        unmount();

        renderPanel(true);

        expect(screen.getByTestId("side-panel-resize-handle")).toHaveAttribute(
            "aria-valuenow",
            String(DEFAULT_SIDE_PANEL_WIDTH + 80),
        );
    });
});
