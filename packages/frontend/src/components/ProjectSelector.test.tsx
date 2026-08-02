import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProjectSelector from "./ProjectSelector";

describe("ProjectSelector component", () => {
    const mockProps = {
        existingProjects: ["Project 1", "Project 2"],
        selectedProject: "Project 1",
        onSelect: jest.fn(),
        onDelete: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    const openMenu = () => fireEvent.mouseDown(screen.getByRole("combobox"));

    it("shows the selected project's name on its own", () => {
        render(<ProjectSelector {...mockProps} />);

        expect(screen.getByRole("combobox")).toHaveTextContent("Project 1");
        expect(screen.queryByTestId("delete-project-Project 1")).not.toBeInTheDocument();
    });

    it("shows New Project when nothing is selected", () => {
        render(<ProjectSelector {...mockProps} selectedProject="" />);

        expect(screen.getByRole("combobox")).toHaveTextContent("New Project");
    });

    it("passes the chosen project name up", () => {
        render(<ProjectSelector {...mockProps} />);

        openMenu();
        fireEvent.click(screen.getByTestId("project-option-Project 2"));

        expect(mockProps.onSelect).toHaveBeenCalledWith("Project 2");
    });

    it("offers a delete control for each saved project", () => {
        render(<ProjectSelector {...mockProps} />);

        openMenu();

        expect(screen.getByTestId("delete-project-Project 1")).toBeInTheDocument();
        expect(screen.getByTestId("delete-project-Project 2")).toBeInTheDocument();
        // "New Project" is a starting point, not a file that can be removed
        expect(screen.queryByTestId("delete-project-")).not.toBeInTheDocument();
    });

    it("asks for a project to be deleted", () => {
        render(<ProjectSelector {...mockProps} />);

        openMenu();
        fireEvent.click(screen.getByTestId("delete-project-Project 2"));

        expect(mockProps.onDelete).toHaveBeenCalledWith("Project 2");
    });

    it("does not open a project when its delete control is clicked", () => {
        render(<ProjectSelector {...mockProps} />);

        openMenu();
        fireEvent.click(screen.getByTestId("delete-project-Project 2"));

        expect(mockProps.onSelect).not.toHaveBeenCalled();
    });

    it("closes the menu when a delete is asked for, so the question is not buried", async () => {
        render(<ProjectSelector {...mockProps} />);

        openMenu();
        fireEvent.click(screen.getByTestId("delete-project-Project 2"));

        // The menu closes through a transition, so the rows outlive the click.
        await waitFor(() => expect(screen.queryByTestId("project-option-Project 2")).not.toBeInTheDocument());
    });
});
