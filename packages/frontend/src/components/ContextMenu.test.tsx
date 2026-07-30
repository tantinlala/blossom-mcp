import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ContextMenu from "./ContextMenu";

describe("ContextMenu Component", () => {
    const mockRenameCallback = jest.fn();
    const mockCreatePlanForTaskCallback = jest.fn();
    const mockShowDetailsCallback = jest.fn();
    const mockTaskId = "task-123";

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders properly with all options", () => {
        render(
            <ContextMenu
                renameCallback={mockRenameCallback}
                createPlanForTaskCallback={mockCreatePlanForTaskCallback}
                showDetailsCallback={mockShowDetailsCallback}
                id={mockTaskId}
                top={100}
                left={100}
                right={100}
                bottom={100}
            />,
        );

        expect(screen.getByText(mockTaskId)).toBeInTheDocument();
        expect(screen.getByText("Details")).toBeInTheDocument();
        expect(screen.getByText("Add Subplan")).toBeInTheDocument();
    });

    it("calls createPlanForTaskCallback with task id when Add Subplan button is clicked", () => {
        render(
            <ContextMenu
                renameCallback={mockRenameCallback}
                createPlanForTaskCallback={mockCreatePlanForTaskCallback}
                showDetailsCallback={mockShowDetailsCallback}
                id={mockTaskId}
                top={100}
                left={100}
                right={100}
                bottom={100}
            />,
        );

        const addSubplanButton = screen.getByText("Add Subplan");
        fireEvent.click(addSubplanButton);

        expect(mockCreatePlanForTaskCallback).toHaveBeenCalledTimes(1);
        expect(mockCreatePlanForTaskCallback).toHaveBeenCalledWith(mockTaskId);
    });

    it("calls showDetailsCallback with task id when Details button is clicked", () => {
        render(
            <ContextMenu
                renameCallback={mockRenameCallback}
                createPlanForTaskCallback={mockCreatePlanForTaskCallback}
                showDetailsCallback={mockShowDetailsCallback}
                id={mockTaskId}
                top={100}
                left={100}
                right={100}
                bottom={100}
            />,
        );

        const detailsButton = screen.getByText("Details");
        fireEvent.click(detailsButton);

        expect(mockShowDetailsCallback).toHaveBeenCalledTimes(1);
        expect(mockShowDetailsCallback).toHaveBeenCalledWith(mockTaskId);
    });
});
