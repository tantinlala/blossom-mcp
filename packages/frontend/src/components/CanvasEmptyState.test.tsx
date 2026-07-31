import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import CanvasEmptyState from "./CanvasEmptyState";

describe("CanvasEmptyState", () => {
    it("explains what to do first", () => {
        render(<CanvasEmptyState onCreateGoal={jest.fn()} />);

        expect(screen.getByTestId("canvas-empty-state")).toBeInTheDocument();
        expect(screen.getByText("Start with a goal")).toBeInTheDocument();
    });

    it("creates a goal when the primary action is used", () => {
        const onCreateGoal = jest.fn();
        render(<CanvasEmptyState onCreateGoal={onCreateGoal} />);

        fireEvent.click(screen.getByTestId("empty-state-create-goal"));

        expect(onCreateGoal).toHaveBeenCalledTimes(1);
    });
});
