import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import SidePanel from "./SidePanel";

describe("SidePanel", () => {
    const onClose = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
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
});
