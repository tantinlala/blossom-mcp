import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ContextMenu from "./ContextMenu";

describe("ContextMenu Component", () => {
    const mockCreatePlanForTaskCallback = jest.fn();
    const mockShowDetailsCallback = jest.fn();
    const mockDeleteCallback = jest.fn();
    const mockTaskId = "task-123";
    const mockTaskName = "Book lodging";

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders properly with all options", () => {
        render(
            <ContextMenu
                createPlanForTaskCallback={mockCreatePlanForTaskCallback}
                openSubplanCallback={null}
                showDetailsCallback={mockShowDetailsCallback}
                deleteCallback={mockDeleteCallback}
                name={mockTaskName}
                id={mockTaskId}
                top={100}
                left={100}
                right={100}
                bottom={100}
            />,
        );

        expect(screen.getByText(mockTaskName)).toBeInTheDocument();
        expect(screen.getByText("Details")).toBeInTheDocument();
        expect(screen.getByText("Add Subplan")).toBeInTheDocument();
        expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("offers to open the subplan instead of adding one when the task has one", () => {
        const openSubplan = jest.fn();
        render(
            <ContextMenu
                createPlanForTaskCallback={null}
                openSubplanCallback={openSubplan}
                showDetailsCallback={mockShowDetailsCallback}
                deleteCallback={mockDeleteCallback}
                name={mockTaskName}
                id={mockTaskId}
                top={100}
                left={100}
                right={100}
                bottom={100}
            />,
        );

        expect(screen.queryByText("Add Subplan")).not.toBeInTheDocument();
        fireEvent.click(screen.getByText("Open Subplan"));

        expect(openSubplan).toHaveBeenCalledWith(mockTaskId);
    });

    it("omits Add Subplan and Delete when their callbacks are absent", () => {
        render(
            <ContextMenu
                createPlanForTaskCallback={null}
                openSubplanCallback={null}
                showDetailsCallback={mockShowDetailsCallback}
                deleteCallback={null}
                name={mockTaskName}
                id={mockTaskId}
                top={100}
                left={100}
                right={100}
                bottom={100}
            />,
        );

        expect(screen.queryByText("Add Subplan")).not.toBeInTheDocument();
        expect(screen.queryByText("Delete")).not.toBeInTheDocument();
        expect(screen.getByText("Details")).toBeInTheDocument();
    });

    it("calls deleteCallback with task id when Delete button is clicked", () => {
        render(
            <ContextMenu
                createPlanForTaskCallback={mockCreatePlanForTaskCallback}
                openSubplanCallback={null}
                showDetailsCallback={mockShowDetailsCallback}
                deleteCallback={mockDeleteCallback}
                name={mockTaskName}
                id={mockTaskId}
                top={100}
                left={100}
                right={100}
                bottom={100}
            />,
        );

        fireEvent.click(screen.getByText("Delete"));

        expect(mockDeleteCallback).toHaveBeenCalledTimes(1);
        expect(mockDeleteCallback).toHaveBeenCalledWith(mockTaskId);
    });

    it("calls createPlanForTaskCallback with task id when Add Subplan button is clicked", () => {
        render(
            <ContextMenu
                createPlanForTaskCallback={mockCreatePlanForTaskCallback}
                openSubplanCallback={null}
                showDetailsCallback={mockShowDetailsCallback}
                deleteCallback={mockDeleteCallback}
                name={mockTaskName}
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
                createPlanForTaskCallback={mockCreatePlanForTaskCallback}
                openSubplanCallback={null}
                showDetailsCallback={mockShowDetailsCallback}
                deleteCallback={mockDeleteCallback}
                name={mockTaskName}
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
