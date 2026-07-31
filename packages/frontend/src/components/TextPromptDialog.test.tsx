import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import TextPromptDialog from "./TextPromptDialog";

describe("TextPromptDialog", () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    const renderDialog = (props: Partial<React.ComponentProps<typeof TextPromptDialog>> = {}) =>
        render(
            <TextPromptDialog
                open
                title="Add a task"
                label="Task name"
                defaultValue="New Task"
                onSubmit={onSubmit}
                onCancel={onCancel}
                {...props}
            />,
        );

    const input = () => screen.getByTestId("text-prompt-input") as HTMLInputElement;

    it("renders nothing when closed", () => {
        renderDialog({ open: false });

        expect(screen.queryByTestId("text-prompt-dialog")).not.toBeInTheDocument();
    });

    it("opens seeded with the default value", () => {
        renderDialog();

        expect(screen.getByText("Add a task")).toBeInTheDocument();
        expect(input().value).toBe("New Task");
    });

    it("submits the typed value", () => {
        renderDialog();

        fireEvent.change(input(), { target: { value: "Book flights" } });
        fireEvent.click(screen.getByTestId("text-prompt-confirm"));

        expect(onSubmit).toHaveBeenCalledWith("Book flights");
    });

    it("submits on Enter, as the native prompt did", () => {
        renderDialog();

        fireEvent.change(input(), { target: { value: "Book flights" } });
        fireEvent.submit(input());

        expect(onSubmit).toHaveBeenCalledWith("Book flights");
    });

    it("trims surrounding whitespace off the value", () => {
        renderDialog();

        fireEvent.change(input(), { target: { value: "  Book flights  " } });
        fireEvent.click(screen.getByTestId("text-prompt-confirm"));

        expect(onSubmit).toHaveBeenCalledWith("Book flights");
    });

    it("refuses to submit a blank name", () => {
        renderDialog();

        fireEvent.change(input(), { target: { value: "   " } });

        expect(screen.getByTestId("text-prompt-confirm")).toBeDisabled();
        fireEvent.submit(input());
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("cancels without submitting", () => {
        renderDialog();

        fireEvent.click(screen.getByTestId("text-prompt-cancel"));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("starts from the new default rather than the last thing typed", () => {
        const { rerender } = renderDialog();
        fireEvent.change(input(), { target: { value: "Something else" } });

        rerender(
            <TextPromptDialog
                open={false}
                title="Add a task"
                defaultValue="New Task"
                onSubmit={onSubmit}
                onCancel={onCancel}
            />,
        );
        rerender(
            <TextPromptDialog
                open
                title="Name your goal"
                defaultValue="New Goal"
                onSubmit={onSubmit}
                onCancel={onCancel}
            />,
        );

        expect(input().value).toBe("New Goal");
    });
});
