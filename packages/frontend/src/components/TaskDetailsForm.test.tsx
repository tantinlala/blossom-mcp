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

    /** Opens the description for editing and hands back its textarea. */
    const openDescriptionEditor = (): HTMLTextAreaElement => {
        fireEvent.click(screen.getByTestId("task-description-display"));
        return screen.getByTestId("task-description-input").querySelector("textarea");
    };

    it("renders form fields with correct values", () => {
        render(<TaskDetailsForm {...defaultProps} />);

        const nameInput = screen.getByTestId("task-name-input").querySelector("input");
        expect(nameInput).toHaveValue(defaultProps.name);

        expect(screen.getByTestId("task-description-display")).toHaveTextContent(defaultProps.description);

        // For a task without a plan, the completion checkbox should be present
        const completionCheckbox = screen.getByTestId("task-completion-checkbox").querySelector("input");
        expect(completionCheckbox).not.toBeChecked();

        // Save button should be disabled when modified is false
        const saveButton = screen.getByTestId("update-task-button");
        expect(saveButton).toBeDisabled();
    });

    it("renders form with enabled save button when modified is true", () => {
        render(<TaskDetailsForm {...defaultProps} modified={true} />);

        const saveButton = screen.getByTestId("update-task-button");
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
        fireEvent.change(openDescriptionEditor(), { target: { value: "Updated task description" } });
        expect(defaultProps.onDescriptionChange).toHaveBeenCalled();

        // Toggle completion checkbox
        const completionCheckbox = screen.getByTestId("task-completion-checkbox").querySelector("input");
        fireEvent.click(completionCheckbox);
        expect(defaultProps.onCompletionStateChange).toHaveBeenCalled();
    });

    it("renders URLs in the description as links", () => {
        render(<TaskDetailsForm {...defaultProps} description="Spec: https://example.com/spec" />);

        const link = screen.getByRole("link", { name: "https://example.com/spec" });
        expect(link).toHaveAttribute("href", "https://example.com/spec");
    });

    it("shows a placeholder when the description is empty", () => {
        render(<TaskDetailsForm {...defaultProps} description="" />);

        expect(screen.getByTestId("task-description-display")).toHaveTextContent("Add a description for this task...");
    });

    it("opens the description for editing when it is clicked", () => {
        render(<TaskDetailsForm {...defaultProps} />);

        expect(screen.queryByTestId("task-description-input")).not.toBeInTheDocument();

        expect(openDescriptionEditor()).toHaveValue(defaultProps.description);
        expect(screen.queryByTestId("task-description-display")).not.toBeInTheDocument();
    });

    it("opens the description for editing when Enter is pressed on it", () => {
        render(<TaskDetailsForm {...defaultProps} />);

        fireEvent.keyDown(screen.getByTestId("task-description-display"), { key: "Enter" });

        expect(screen.getByTestId("task-description-input")).toBeInTheDocument();
    });

    it("does not follow a link click into the description editor", () => {
        render(<TaskDetailsForm {...defaultProps} description="https://example.com" />);

        fireEvent.click(screen.getByRole("link"));

        expect(screen.queryByTestId("task-description-input")).not.toBeInTheDocument();
    });

    it("returns the description to its reading view on blur", () => {
        render(<TaskDetailsForm {...defaultProps} />);

        fireEvent.blur(openDescriptionEditor());

        expect(screen.getByTestId("task-description-display")).toBeInTheDocument();
    });

    it("returns the description to its reading view when Escape is pressed", () => {
        render(<TaskDetailsForm {...defaultProps} />);

        fireEvent.keyDown(openDescriptionEditor(), { key: "Escape" });

        expect(screen.getByTestId("task-description-display")).toBeInTheDocument();
    });

    it("calls onSave handler when save button is clicked", () => {
        render(<TaskDetailsForm {...defaultProps} modified={true} />);

        // Click save button
        const saveButton = screen.getByTestId("update-task-button");
        fireEvent.click(saveButton);
        expect(defaultProps.onSave).toHaveBeenCalled();
    });
});
