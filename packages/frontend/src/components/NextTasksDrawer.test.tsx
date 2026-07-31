import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import NextTasksDrawer from "./NextTasksDrawer";
import { NextTask } from "../types/roadmap";

describe("TaskDrawer Component", () => {
    const topLevelTask: NextTask = {
        task: { id: "task1", name: "Task 1", completionState: false, plan: null },
        path: [],
    };

    const nestedTask: NextTask = {
        task: { id: "task2", name: "Task 2", completionState: true, plan: null },
        path: [
            { id: "p1", name: "Prepare for departure" },
            { id: "p2", name: "Sort paperwork" },
        ],
    };

    const unblockedTasks: NextTask[] = [topLevelTask, nestedTask];

    const mockToggleComplete = jest.fn();
    const mockChangeContext = jest.fn();
    const mockOnClose = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    const renderDrawer = (open = true, shownTasks = unblockedTasks) =>
        render(
            <NextTasksDrawer
                open={open}
                onClose={mockOnClose}
                shownTasks={shownTasks}
                toggleCompletion={mockToggleComplete}
                changeContext={mockChangeContext}
            />,
        );

    it("renders properly when open", () => {
        renderDrawer();

        expect(screen.getByTestId("task-drawer")).toBeInTheDocument();
        expect(screen.getByText('"Next Task" List')).toBeInTheDocument();
        expect(screen.getByText("Task 1")).toBeInTheDocument();
        expect(screen.getByText("Task 2")).toBeInTheDocument();
    });

    it("does not render when closed", () => {
        renderDrawer(false);

        expect(screen.queryByText('"Next Task" List')).not.toBeInTheDocument();
    });

    it("shows the plan a nested task lives in", () => {
        renderDrawer();

        expect(screen.getByText("Prepare for departure / Sort paperwork")).toBeInTheDocument();
    });

    it("shows no path for a task in the plan already on screen", () => {
        renderDrawer(true, [topLevelTask]);

        expect(screen.getByText("Task 1")).toBeInTheDocument();
        expect(screen.queryByText("/")).not.toBeInTheDocument();
    });

    it("calls toggleCompletion when the checkbox is clicked", () => {
        renderDrawer();

        const checkbox = screen.getByTestId("task-checkbox-task1").querySelector("input");
        fireEvent.click(checkbox as HTMLInputElement);

        expect(mockToggleComplete).toHaveBeenCalledWith("task1");
    });

    it("navigates to the plan a task lives in", () => {
        renderDrawer();

        fireEvent.click(screen.getByTestId("change-context-button-task1"));

        expect(mockChangeContext).toHaveBeenCalledWith("task1");
    });

    it("displays checkboxes with correct checked state", () => {
        renderDrawer();

        const checkbox1 = screen.getByTestId("task-checkbox-task1").querySelector("input") as HTMLInputElement;
        const checkbox2 = screen.getByTestId("task-checkbox-task2").querySelector("input") as HTMLInputElement;

        expect(checkbox1.checked).toBe(false);
        expect(checkbox2.checked).toBe(true);
    });

    it("calls onClose when the panel is dismissed", () => {
        renderDrawer();

        fireEvent.click(screen.getByRole("button", { name: 'Close "Next Task" List' }));

        expect(mockOnClose).toHaveBeenCalled();
    });

    it("renders empty list when no tasks are available", () => {
        renderDrawer(true, []);

        expect(screen.getByText('"Next Task" List')).toBeInTheDocument();
        expect(screen.getByText("No tasks to show!")).toBeInTheDocument();
        expect(screen.queryByTestId("task-item-task1")).not.toBeInTheDocument();
    });
});
