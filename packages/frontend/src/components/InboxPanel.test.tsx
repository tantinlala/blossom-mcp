import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import InboxPanel from "./InboxPanel";
import { InboxGroup } from "../hooks/useInbox";

describe("InboxPanel Component", () => {
    const mockOnClose = jest.fn();

    const tripGroup: InboxGroup = {
        projectKey: "Trip",
        ideas: [
            { id: "idea-1", text: "Task 1" },
            { id: "idea-2", text: "Task 2" },
        ],
    };

    const houseGroup: InboxGroup = {
        projectKey: "House",
        ideas: [{ id: "idea-3", text: "Look at swatches" }],
    };

    const defaultProps = {
        groups: [tripGroup],
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

    const renderPanel = (groups: InboxGroup[] = [tripGroup]) =>
        render(<InboxPanel open={true} onClose={mockOnClose} {...defaultProps} groups={groups} />);

    it("renders the inbox panel with its title and each project's controls", () => {
        renderPanel();

        expect(screen.getByText("Inbox")).toBeInTheDocument();
        expect(screen.getByTestId("add-idea-Trip")).toBeInTheDocument();
        expect(screen.getByTestId("move-all-Trip")).toBeInTheDocument();
    });

    it("calls addIdea for the project whose Add control was clicked", () => {
        renderPanel();

        fireEvent.click(screen.getByTestId("add-idea-Trip"));

        expect(defaultProps.addIdea).toHaveBeenCalledWith("Trip");
    });

    it("calls addAllIdeasToPlan for the project whose Move control was clicked", () => {
        renderPanel();

        fireEvent.click(screen.getByTestId("move-all-Trip"));

        expect(defaultProps.addAllIdeasToPlan).toHaveBeenCalledWith("Trip");
    });

    it("disables Move for a project whose inbox is empty", () => {
        renderPanel([{ projectKey: "Trip", ideas: [] }]);

        expect(screen.getByTestId("move-all-Trip")).toBeDisabled();
    });

    it("enables Move for a project holding ideas", () => {
        renderPanel();

        expect(screen.getByTestId("move-all-Trip")).not.toBeDisabled();
    });

    describe("with several projects on the board", () => {
        it("renders one list per project, each named", () => {
            renderPanel([tripGroup, houseGroup]);

            expect(screen.getByTestId("inbox-group-Trip")).toBeInTheDocument();
            expect(screen.getByTestId("inbox-group-House")).toBeInTheDocument();
            expect(screen.getByText("Trip")).toBeInTheDocument();
            expect(screen.getByText("House")).toBeInTheDocument();
            expect(screen.getAllByPlaceholderText("New idea")).toHaveLength(3);
        });

        it("leaves the project unsaid when the board holds one", () => {
            renderPanel();

            expect(screen.queryByText("Trip")).not.toBeInTheDocument();
        });

        it("addresses a write to the project holding the idea", () => {
            renderPanel([tripGroup, houseGroup]);

            const inputs = screen.getAllByPlaceholderText("New idea");
            fireEvent.change(inputs[2], { target: { value: "Look at more swatches" } });

            expect(defaultProps.changeIdea).toHaveBeenCalledWith("idea-3", "Look at more swatches");
        });
    });

    describe("Inbox rendering", () => {
        it("renders an input for each idea", () => {
            renderPanel();

            const inputs = screen.getAllByPlaceholderText("New idea");
            expect(inputs).toHaveLength(2);
            expect(inputs[0]).toHaveValue("Task 1");
            expect(inputs[1]).toHaveValue("Task 2");
        });

        it("calls changeIdea when an idea input is edited", () => {
            renderPanel();

            const inputs = screen.getAllByPlaceholderText("New idea");
            fireEvent.change(inputs[1], { target: { value: "Updated Task" } });

            expect(defaultProps.changeIdea).toHaveBeenCalledWith("idea-2", "Updated Task");
        });

        it("calls commitIdea when an idea input is blurred", () => {
            renderPanel();

            const inputs = screen.getAllByPlaceholderText("New idea");
            fireEvent.blur(inputs[0]);

            expect(defaultProps.commitIdea).toHaveBeenCalledWith("idea-1");
        });

        it("calls commitIdea when Enter is pressed in an idea input", () => {
            renderPanel();

            const inputs = screen.getAllByPlaceholderText("New idea");
            fireEvent.keyDown(inputs[1], { key: "Enter" });

            expect(defaultProps.commitIdea).toHaveBeenCalledWith("idea-2");
        });

        it("calls deleteIdea when the delete button is clicked", () => {
            renderPanel();

            const deleteButtons = screen.getAllByLabelText("Remove from inbox");
            fireEvent.click(deleteButtons[0]);

            expect(defaultProps.deleteIdea).toHaveBeenCalledWith("idea-1");
        });

        it("calls addTaskToContextAndRemove when the add-to-context button is clicked", () => {
            renderPanel();

            const addButtons = screen.getAllByLabelText("Add to plan and remove from inbox");
            fireEvent.click(addButtons[1]);

            expect(defaultProps.addTaskToContextAndRemove).toHaveBeenCalledWith("idea-2");
        });

        it("says the board holds no projects when it holds none", () => {
            renderPanel([]);

            expect(screen.getByText("No projects on the board")).toBeInTheDocument();
        });
    });
});
