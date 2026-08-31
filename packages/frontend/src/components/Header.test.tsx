import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import Header from "./Header";

describe("Header component", () => {
    const mockProps = {
        savedProjects: ["Project 1", "Project 2"],
        openProjects: ["Project 1"],
        assistantProject: null,
        focusedProject: "Project 1",
        onOpenProject: jest.fn(),
        onCloseProject: jest.fn(),
        onNewProject: jest.fn(),
        onDeleteProject: jest.fn(),
        onChooseAssistantProject: jest.fn(),
        onSave: jest.fn(),
        onReload: jest.fn(),
        saveState: "saved" as const,
        connectionState: "open" as const,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders correctly", () => {
        render(<Header {...mockProps} />);

        expect(screen.getByText("Blossom")).toBeInTheDocument();
        expect(screen.getByTestId("brand-mark")).toBeInTheDocument();

        // The board selector says what is on the board
        expect(screen.getByTestId("board-selector")).toHaveTextContent("Project 1");

        expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
    });

    it("calls onSave when Save button is clicked", () => {
        render(<Header {...mockProps} />);
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(mockProps.onSave).toHaveBeenCalled();
    });

    it("calls onReload when Reload button is clicked", () => {
        render(<Header {...mockProps} />);
        fireEvent.click(screen.getByRole("button", { name: /reload/i }));
        expect(mockProps.onReload).toHaveBeenCalled();
    });

    it("has nothing to save or reload while the board is empty", () => {
        render(<Header {...mockProps} openProjects={[]} focusedProject={null} />);

        expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /reload/i })).toBeDisabled();
    });

    it("says which project it saves when the board holds several", () => {
        render(<Header {...mockProps} openProjects={["Project 1", "Project 2"]} focusedProject="Project 2" />);

        expect(screen.getByRole("button", { name: "Save Project 2" })).toBeInTheDocument();
    });

    it("reports whether there is anything unsaved", () => {
        const { rerender } = render(<Header {...mockProps} saveState="saved" />);
        expect(screen.getByTestId("save-state")).toHaveTextContent("Saved");

        rerender(<Header {...mockProps} saveState="unsaved" />);
        expect(screen.getByTestId("save-state")).toHaveTextContent("Unsaved changes");

        rerender(<Header {...mockProps} saveState="neverSaved" />);
        expect(screen.getByTestId("save-state")).toHaveTextContent("Not saved yet");
    });

    it("reports whether changes from other people are getting through", () => {
        const { rerender } = render(<Header {...mockProps} connectionState="open" />);
        expect(screen.getByTestId("connection-state")).toHaveTextContent("Live");

        rerender(<Header {...mockProps} connectionState="offline" />);
        expect(screen.getByTestId("connection-state")).toHaveTextContent("Reconnecting");
    });
});
