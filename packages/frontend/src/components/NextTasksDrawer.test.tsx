import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import NextTasksDrawer from "./NextTasksDrawer";
import { Task } from "@blossom/common";

describe("TaskDrawer Component", () => {
    const mockTask1: Task = {
        id: "task1",
        name: "Task 1",
        completionState: false,
        plan: null,
    };

    const mockTask2: Task = {
        id: "task2",
        name: "Task 2",
        completionState: true,
        plan: null,
    };

    const unblockedTasks: Task[] = [mockTask1, mockTask2];

    const mockToggleComplete = jest.fn();
    const mockChangeContext = jest.fn();
    const mockOnClose = jest.fn();

    it("renders properly when open", () => {
        render(
            <NextTasksDrawer
                open={true}
                onClose={mockOnClose}
                shownTasks={unblockedTasks}
                toggleCompletion={mockToggleComplete}
                changeContext={mockChangeContext}
            />,
        );

        expect(screen.getByTestId("task-drawer")).toBeInTheDocument();
        expect(screen.getByText('"Next Task" List')).toBeInTheDocument();
        expect(screen.getByText("Task 1")).toBeInTheDocument();
        expect(screen.getByText("Task 2")).toBeInTheDocument();
    });

    it("does not render when closed", () => {
        render(
            <NextTasksDrawer
                open={false}
                onClose={mockOnClose}
                shownTasks={unblockedTasks}
                toggleCompletion={mockToggleComplete}
                changeContext={mockChangeContext}
            />,
        );

        // Check that the drawer is not in the document when closed
        expect(screen.queryByText('"Next Task" List')).not.toBeInTheDocument();
    });

    it("calls toggleCompleteByRef when checkbox is clicked", () => {
        render(
            <NextTasksDrawer
                open={true}
                onClose={mockOnClose}
                shownTasks={unblockedTasks}
                toggleCompletion={mockToggleComplete}
                changeContext={mockChangeContext}
            />,
        );

        // Find the checkbox input inside the element with task-checkbox-task1 data-testid
        const checkbox = screen.getByTestId("task-checkbox-task1").querySelector("input");

        if (checkbox) {
            fireEvent.click(checkbox);
            expect(mockToggleComplete).toHaveBeenCalledWith(mockTask1.id);
        }
    });

    it("calls handleDoubleClick when task item is double-clicked", () => {
        render(
            <NextTasksDrawer
                open={true}
                onClose={mockOnClose}
                shownTasks={unblockedTasks}
                toggleCompletion={mockToggleComplete}
                changeContext={mockChangeContext}
            />,
        );

        fireEvent.click(screen.getByTestId("change-context-button-task1"));
        expect(mockChangeContext).toHaveBeenCalledWith(mockTask1.id);
    });

    it("displays checkboxes with correct checked state", () => {
        render(
            <NextTasksDrawer
                open={true}
                onClose={mockOnClose}
                shownTasks={unblockedTasks}
                toggleCompletion={mockToggleComplete}
                changeContext={mockChangeContext}
            />,
        );

        // Find the actual checkbox input elements
        const checkbox1 = screen.getByTestId("task-checkbox-task1").querySelector("input");
        const checkbox2 = screen.getByTestId("task-checkbox-task2").querySelector("input");

        if (checkbox1 && checkbox2) {
            // @ts-ignore - We know these are checkbox inputs
            expect(checkbox1.checked).toBe(false);
            // @ts-ignore - We know these are checkbox inputs
            expect(checkbox2.checked).toBe(true);
        }
    });

    it("calls onClose when drawer is closed", () => {
        const { baseElement } = render(
            <NextTasksDrawer
                open={true}
                onClose={mockOnClose}
                shownTasks={unblockedTasks}
                toggleCompletion={mockToggleComplete}
                changeContext={mockChangeContext}
            />,
        );

        // Find backdrop and click it to close the drawer
        const backdrop = baseElement.querySelector(".MuiBackdrop-root");
        if (backdrop) {
            fireEvent.click(backdrop);
            expect(mockOnClose).toHaveBeenCalled();
        }
    });

    it("renders empty list when no tasks are available", () => {
        render(
            <NextTasksDrawer
                open={true}
                onClose={mockOnClose}
                shownTasks={[]}
                toggleCompletion={mockToggleComplete}
                changeContext={mockChangeContext}
            />,
        );

        expect(screen.getByText('"Next Task" List')).toBeInTheDocument();
        expect(screen.getByText("No tasks to show!")).toBeInTheDocument();
        expect(screen.queryByTestId("task-item-task1")).not.toBeInTheDocument();
    });
});
