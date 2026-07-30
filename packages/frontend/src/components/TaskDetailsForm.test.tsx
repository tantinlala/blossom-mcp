import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import TaskDetailsForm from "./TaskDetailsForm";

describe("TaskDetailsForm Component", () => {
    const defaultProps = {
        name: "Test Task",
        description: "Test Description",
        completionState: false,
        hasSubplan: false,
        modified: false,
        onNameChange: jest.fn(),
        onDescriptionChange: jest.fn(),
        onCompletionStateChange: jest.fn(),
        onSave: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders form fields with correct values", () => {
        render(<TaskDetailsForm {...defaultProps} />);

        const nameInput = screen.getByTestId("task-name-input").querySelector("input");
        expect(nameInput).toHaveValue(defaultProps.name);

        const descriptionInput = screen.getByTestId("task-description-input").querySelector("textarea");
        expect(descriptionInput).toHaveValue(defaultProps.description);

        // For a task without a plan, the completion checkbox should be present
        const completionCheckbox = screen.getByTestId("task-completion-checkbox").querySelector("input");
        expect(completionCheckbox).not.toBeChecked();

        // Save button should be disabled when modified is false
        const saveButton = screen.getByTestId("save-task-button");
        expect(saveButton).toBeDisabled();
    });

    it("renders form with enabled save button when modified is true", () => {
        render(<TaskDetailsForm {...defaultProps} modified={true} />);

        const saveButton = screen.getByTestId("save-task-button");
        expect(saveButton).not.toBeDisabled();
    });

    it("does not render completion checkbox for tasks with a subplan", () => {
        render(<TaskDetailsForm {...defaultProps} hasSubplan={true} />);

        expect(screen.queryByTestId("task-completion-checkbox")).not.toBeInTheDocument();
    });

    it("renders completion checkbox as checked when completionState is true", () => {
        render(<TaskDetailsForm {...defaultProps} completionState={true} />);

        const completionCheckbox = screen.getByTestId("task-completion-checkbox").querySelector("input");
        expect(completionCheckbox).toBeChecked();
    });

    it("calls appropriate handlers when form fields are changed", () => {
        render(<TaskDetailsForm {...defaultProps} />);

        // Edit the name field
        const nameInput = screen.getByTestId("task-name-input").querySelector("input");
        fireEvent.change(nameInput, { target: { value: "Updated Task Name" } });
        expect(defaultProps.onNameChange).toHaveBeenCalled();

        // Edit the description field
        const descriptionInput = screen.getByTestId("task-description-input").querySelector("textarea");
        fireEvent.change(descriptionInput, { target: { value: "Updated task description" } });
        expect(defaultProps.onDescriptionChange).toHaveBeenCalled();

        // Toggle completion checkbox
        const completionCheckbox = screen.getByTestId("task-completion-checkbox").querySelector("input");
        fireEvent.click(completionCheckbox);
        expect(defaultProps.onCompletionStateChange).toHaveBeenCalled();
    });

    it("calls onSave handler when save button is clicked", () => {
        render(<TaskDetailsForm {...defaultProps} modified={true} />);

        // Click save button
        const saveButton = screen.getByTestId("save-task-button");
        fireEvent.click(saveButton);
        expect(defaultProps.onSave).toHaveBeenCalled();
    });
});
