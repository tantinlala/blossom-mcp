import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import BoardSelector from "./BoardSelector";

describe("BoardSelector component", () => {
    const mockProps = {
        savedProjects: ["Trip", "House"],
        openProjects: ["Trip"],
        assistantProject: null as string | null,
        onOpen: jest.fn(),
        onClose: jest.fn(),
        onNewProject: jest.fn(),
        onDelete: jest.fn(),
        onChooseAssistantProject: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    const openMenu = (props: Partial<typeof mockProps> = {}) => {
        render(<BoardSelector {...mockProps} {...props} />);
        fireEvent.click(screen.getByTestId("board-selector"));
    };

    describe("what the button says", () => {
        it("names the project when one is on the board", () => {
            render(<BoardSelector {...mockProps} />);

            expect(screen.getByTestId("board-selector")).toHaveTextContent("Trip");
        });

        it("counts them when several are", () => {
            render(<BoardSelector {...mockProps} openProjects={["Trip", "House"]} />);

            expect(screen.getByTestId("board-selector")).toHaveTextContent("2 projects");
        });

        it("says so when the board is empty", () => {
            render(<BoardSelector {...mockProps} openProjects={[]} />);

            expect(screen.getByTestId("board-selector")).toHaveTextContent("No projects");
        });
    });

    it("lists every saved project, ticking the ones on the board", () => {
        openMenu();

        expect(screen.getByTestId("project-row-Trip")).toBeInTheDocument();
        expect(screen.getByTestId("project-row-House")).toBeInTheDocument();
        expect(screen.getByLabelText("Show Trip on the board")).toBeChecked();
        expect(screen.getByLabelText("Show House on the board")).not.toBeChecked();
    });

    it("lists a project open on the board with nothing saved for it", () => {
        openMenu({ savedProjects: ["Trip"], openProjects: ["Trip", "Untitled"] });

        expect(screen.getByTestId("project-row-Untitled")).toBeInTheDocument();
        expect(screen.getByText("Not saved yet")).toBeInTheDocument();
    });

    it("puts a project on the board when its row is picked", () => {
        openMenu();

        fireEvent.click(screen.getByTestId("project-row-House"));

        expect(mockProps.onOpen).toHaveBeenCalledWith("House");
    });

    it("takes a project off the board when its row is picked again", () => {
        openMenu();

        fireEvent.click(screen.getByTestId("project-row-Trip"));

        expect(mockProps.onClose).toHaveBeenCalledWith("Trip");
    });

    it("starts a new project", () => {
        openMenu();

        fireEvent.click(screen.getByTestId("new-project"));

        expect(mockProps.onNewProject).toHaveBeenCalled();
    });

    it("passes a project up to be deleted", () => {
        openMenu();

        fireEvent.click(screen.getByTestId("delete-project-House"));

        expect(mockProps.onDelete).toHaveBeenCalledWith("House");
        // Picking it up closes the menu, since deleting asks for confirmation
        expect(mockProps.onClose).not.toHaveBeenCalled();
    });

    it("offers no delete for a project with no file behind it", () => {
        openMenu({ savedProjects: ["Trip"], openProjects: ["Trip", "Untitled"] });

        expect(screen.queryByTestId("delete-project-Untitled")).not.toBeInTheDocument();
    });

    describe("the assistant's project", () => {
        it("hands a project to the assistant", () => {
            openMenu();

            fireEvent.click(screen.getByTestId("assistant-target-Trip"));

            expect(mockProps.onChooseAssistantProject).toHaveBeenCalledWith("Trip");
            // Choosing it does not change what is on the board
            expect(mockProps.onClose).not.toHaveBeenCalled();
        });

        it("takes it back when the project it already has is picked", () => {
            openMenu({ assistantProject: "Trip" });

            fireEvent.click(screen.getByTestId("assistant-target-Trip"));

            expect(mockProps.onChooseAssistantProject).toHaveBeenCalledWith(null);
        });

        it("marks which project the assistant has", () => {
            openMenu({ assistantProject: "Trip" });

            expect(screen.getByLabelText("Stop the assistant working on Trip")).toBeInTheDocument();
            expect(screen.getByLabelText("Let the assistant work on House")).toBeInTheDocument();
        });
    });

    it("says how to get started when nothing has been saved", () => {
        openMenu({ savedProjects: [], openProjects: [] });

        expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
    });
});
