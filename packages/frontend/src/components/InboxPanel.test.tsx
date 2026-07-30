import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import InboxPanel from "./InboxPanel";

describe("InboxPanel Component", () => {
    const defaultProps = {
        ideaList: ["Task 1", "Task 2"],
        addIdea: jest.fn(),
        addAllIdeasToPlan: jest.fn(),
        changeIdea: jest.fn(),
        commitIdea: jest.fn(),
        deleteIdea: jest.fn(),
        addTaskToContextAndRemove: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders the inbox panel with title and buttons", () => {
        render(<InboxPanel {...defaultProps} />);

        // Check if the title is rendered
        expect(screen.getByText("Inbox")).toBeInTheDocument();

        // Check if all buttons are rendered
        expect(screen.getByTestId("add-idea-button")).toBeInTheDocument();
        expect(screen.getByTestId("move-all-button")).toBeInTheDocument();
    });

    it("calls addIdea when Add button is clicked", () => {
        render(<InboxPanel {...defaultProps} />);

        fireEvent.click(screen.getByTestId("add-idea-button"));
        expect(defaultProps.addIdea).toHaveBeenCalledTimes(1);
    });

    it("calls addAllIdeasToPlan when Move button is clicked", () => {
        render(<InboxPanel {...defaultProps} />);

        fireEvent.click(screen.getByTestId("move-all-button"));
        expect(defaultProps.addAllIdeasToPlan).toHaveBeenCalledTimes(1);
    });

    it("disables Move button when ideaList is empty", () => {
        render(<InboxPanel {...defaultProps} ideaList={[]} />);

        expect(screen.getByTestId("move-all-button")).toBeDisabled();
    });

    it("enables Move button when ideaList has items", () => {
        render(<InboxPanel {...defaultProps} />);

        expect(screen.getByTestId("move-all-button")).not.toBeDisabled();
    });

    describe("Inbox rendering", () => {
        it("renders an input for each idea", () => {
            render(<InboxPanel {...defaultProps} />);

            const inputs = screen.getAllByPlaceholderText("New idea");
            expect(inputs).toHaveLength(2);
            expect(inputs[0]).toHaveValue("Task 1");
            expect(inputs[1]).toHaveValue("Task 2");
        });

        it("calls changeIdea when an idea input is edited", () => {
            render(<InboxPanel {...defaultProps} />);

            const inputs = screen.getAllByPlaceholderText("New idea");
            fireEvent.change(inputs[1], { target: { value: "Updated Task" } });

            expect(defaultProps.changeIdea).toHaveBeenCalledWith(1, "Updated Task");
        });

        it("calls commitIdea when an idea input is blurred", () => {
            render(<InboxPanel {...defaultProps} />);

            const inputs = screen.getAllByPlaceholderText("New idea");
            fireEvent.blur(inputs[0]);

            expect(defaultProps.commitIdea).toHaveBeenCalledWith(0);
        });

        it("calls commitIdea when Enter is pressed in an idea input", () => {
            render(<InboxPanel {...defaultProps} />);

            const inputs = screen.getAllByPlaceholderText("New idea");
            fireEvent.keyDown(inputs[1], { key: "Enter" });

            expect(defaultProps.commitIdea).toHaveBeenCalledWith(1);
        });

        it("calls deleteIdea when the delete button is clicked", () => {
            render(<InboxPanel {...defaultProps} />);

            const deleteButtons = screen.getAllByTitle("Remove from inbox");
            fireEvent.click(deleteButtons[0]);

            expect(defaultProps.deleteIdea).toHaveBeenCalledWith(0);
        });

        it("calls addTaskToContextAndRemove when the add-to-context button is clicked", () => {
            render(<InboxPanel {...defaultProps} />);

            const addButtons = screen.getAllByTitle("Add to project and remove from inbox");
            fireEvent.click(addButtons[1]);

            expect(defaultProps.addTaskToContextAndRemove).toHaveBeenCalledWith(1);
        });
    });
});
