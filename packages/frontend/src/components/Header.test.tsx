import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Header from "./Header";

describe("Header component", () => {
    const mockProps = {
        existingProjects: ["Project 1", "Project 2"],
        selectedProject: "Project 1",
        handleProjectChange: jest.fn(),
        onSave: jest.fn(),
        onRestore: jest.fn(),
    };

    it("renders correctly", () => {
        render(<Header {...mockProps} />);

        // Check if the app title is rendered
        expect(screen.getByText("Blossom")).toBeInTheDocument();

        // Check if project dropdown is rendered showing the current project
        expect(screen.getByRole("combobox")).toHaveTextContent("Project 1");

        // Check if buttons are rendered
        expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
    });

    it("calls onSave when Save button is clicked", () => {
        render(<Header {...mockProps} />);
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(mockProps.onSave).toHaveBeenCalled();
    });

    it("calls onRestore when Reload button is clicked", () => {
        render(<Header {...mockProps} />);
        fireEvent.click(screen.getByRole("button", { name: /reload/i }));
        expect(mockProps.onRestore).toHaveBeenCalled();
    });

    it("enables Reload button when no project is selected", () => {
        render(<Header {...mockProps} selectedProject="" />);
        expect(screen.getByRole("button", { name: /reload/i })).toBeEnabled();
    });

    it("passes the chosen project name up when the dropdown changes", () => {
        render(<Header {...mockProps} />);

        fireEvent.mouseDown(screen.getByRole("combobox"));
        fireEvent.click(screen.getByTestId("project-option-Project 2"));

        expect(mockProps.handleProjectChange).toHaveBeenCalledWith("Project 2");
    });
});
