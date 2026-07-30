import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import TaskDetailsDrawer from "./TaskDetailsDrawer";
import { Task } from "@blossom/common";

describe("TaskDetailsDrawer Component", () => {
    const mockTask: Task = {
        id: "task1",
        name: "Test Task",
        description: "Test Description",
        completionState: false,
        plan: null,
    };

    const mockTaskWithPlan: Task = {
        id: "task2",
        name: "Task With Plan",
        completionState: true,
        plan: { tasksList: [], dependenciesList: [] },
    };

    const mockOnClose = jest.fn();
    const mockUpdateTaskDetails = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders editable fields correctly for a selected task", () => {
        render(
            <TaskDetailsDrawer
                open={true}
                onClose={mockOnClose}
                selectedTask={mockTask}
                updateTaskDetails={mockUpdateTaskDetails}
            />,
        );

        expect(screen.getByTestId("task-details-drawer")).toBeInTheDocument();

        // Check if editable fields are present with correct values
        const nameInput = screen.getByTestId("task-name-input").querySelector("input");
        expect(nameInput).toHaveValue(mockTask.name);

        const descriptionInput = screen.getByTestId("task-description-input").querySelector("textarea");
        expect(descriptionInput).toHaveValue(mockTask.description);

        // For a task without a plan, the completion checkbox should be present
        expect(screen.getByTestId("task-completion-checkbox").querySelector("input")).not.toBeChecked();
    });

    it("renders properly for a completed task with plan", () => {
        render(
            <TaskDetailsDrawer
                open={true}
                onClose={mockOnClose}
                selectedTask={mockTaskWithPlan}
                updateTaskDetails={mockUpdateTaskDetails}
            />,
        );

        expect(screen.getByTestId("task-details-drawer")).toBeInTheDocument();
        const nameInput = screen.getByTestId("task-name-input").querySelector("input");
        expect(nameInput).toHaveValue(mockTaskWithPlan.name);

        // For a task with a plan, the completion checkbox should not be present
        expect(screen.queryByTestId("task-completion-checkbox")).not.toBeInTheDocument();
    });

    it("updates form fields when user enters new values", async () => {
        render(
            <TaskDetailsDrawer
                open={true}
                onClose={mockOnClose}
                selectedTask={mockTask}
                updateTaskDetails={mockUpdateTaskDetails}
            />,
        );

        // Edit the name field
        const nameInput = screen.getByTestId("task-name-input").querySelector("input");
        fireEvent.change(nameInput, { target: { value: "Updated Task Name" } });

        // Edit the description field
        const descriptionInput = screen.getByTestId("task-description-input").querySelector("textarea");
        fireEvent.change(descriptionInput, { target: { value: "Updated task description" } });

        // Toggle completion checkbox (only available for tasks without subplans)
        const completionCheckbox = screen.getByTestId("task-completion-checkbox").querySelector("input");
        fireEvent.click(completionCheckbox);

        // Save button should be enabled after modifications
        expect(screen.getByTestId("save-task-button")).not.toBeDisabled();
    });

    it("calls updateTaskDetails when save button is clicked", async () => {
        render(
            <TaskDetailsDrawer
                open={true}
                onClose={mockOnClose}
                selectedTask={mockTask}
                updateTaskDetails={mockUpdateTaskDetails}
            />,
        );

        // Edit the name field
        const nameInput = screen.getByTestId("task-name-input").querySelector("input");
        fireEvent.change(nameInput, { target: { value: "Updated Task Name" } });

        // Click save button
        const saveButton = screen.getByTestId("save-task-button");
        fireEvent.click(saveButton);

        // Check if updateTaskDetails was called with correct parameters
        expect(mockUpdateTaskDetails).toHaveBeenCalledWith("task1", "Updated Task Name", mockTask.description, false);
    });

    it("calls updateTaskDetails when save button is clicked for task with plan", async () => {
        render(
            <TaskDetailsDrawer
                open={true}
                onClose={mockOnClose}
                selectedTask={mockTaskWithPlan}
                updateTaskDetails={mockUpdateTaskDetails}
            />,
        );

        // Edit the name field
        const nameInput = screen.getByTestId("task-name-input").querySelector("input");
        fireEvent.change(nameInput, { target: { value: "Updated Task With Plan" } });

        // Click save button
        const saveButton = screen.getByTestId("save-task-button");
        fireEvent.click(saveButton);

        // Check if updateTaskDetails was called with correct parameters
        // Note: The component initializes the description as empty string '' when undefined
        expect(mockUpdateTaskDetails).toHaveBeenCalledWith(
            "task2",
            "Updated Task With Plan",
            "", // description is initialized as empty string when undefined in the component
            true,
        );
    });

    it("does not render when there is no selected task", () => {
        const { container } = render(
            <TaskDetailsDrawer
                open={true}
                onClose={mockOnClose}
                selectedTask={null}
                updateTaskDetails={mockUpdateTaskDetails}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it("does not render when closed", () => {
        render(
            <TaskDetailsDrawer
                open={false}
                onClose={mockOnClose}
                selectedTask={mockTask}
                updateTaskDetails={mockUpdateTaskDetails}
            />,
        );

        expect(screen.queryByText(mockTask.name)).not.toBeInTheDocument();
    });

    it("resets modified state when a new task is selected", () => {
        const { rerender } = render(
            <TaskDetailsDrawer
                open={true}
                onClose={mockOnClose}
                selectedTask={mockTask}
                updateTaskDetails={mockUpdateTaskDetails}
            />,
        );

        // Edit the name field to trigger modified state
        const nameInput = screen.getByTestId("task-name-input").querySelector("input");
        fireEvent.change(nameInput, { target: { value: "Changed name" } });

        // Save button should be enabled
        expect(screen.getByTestId("save-task-button")).not.toBeDisabled();

        // Rerender with a different task
        rerender(
            <TaskDetailsDrawer
                open={true}
                onClose={mockOnClose}
                selectedTask={mockTaskWithPlan}
                updateTaskDetails={mockUpdateTaskDetails}
            />,
        );

        // Save button should be disabled again for new task
        expect(screen.getByTestId("save-task-button")).toBeDisabled();
    });
});
