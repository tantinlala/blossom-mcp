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

        // Check if project dropdown is rendered
        expect(screen.getByRole("button", { name: /project 1/i })).toBeInTheDocument();

        // Check if buttons are rendered
        expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
    });

    it("calls onSave when Save button is clicked", () => {
        render(<Header {...mockProps} />);
        fireEvent.click(screen.getByRole("button", { name: /save/i }));
        expect(mockProps.onSave).toHaveBeenCalled();
    });

    it("calls onRestore when Open button is clicked", () => {
        render(<Header {...mockProps} />);
        fireEvent.click(screen.getByRole("button", { name: /open/i }));
        expect(mockProps.onRestore).toHaveBeenCalled();
    });

    it("enables Open button when no project is selected", () => {
        render(<Header {...mockProps} selectedProject="" />);
        expect(screen.getByRole("button", { name: /open/i })).toBeEnabled();
    });
});
