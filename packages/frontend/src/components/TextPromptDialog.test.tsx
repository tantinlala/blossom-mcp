import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

    it("holds focus in the field even when something takes it while the dialog opens", async () => {
        // The canvas underneath moves focus around as it redraws, and it does so
        // while the dialog is on its way in. The field claims focus once the
        // dialog has finished opening, so a name can be typed straight away.
        const rival = document.createElement("button");
        document.body.appendChild(rival);

        renderDialog();
        // Focus lands back on the dialog itself, not the field, until the field
        // claims it.
        rival.focus();

        await waitFor(() => expect(input()).toHaveFocus());
        expect(input().selectionEnd! - input().selectionStart!).toBe("New Task".length);

        rival.remove();
    });

    it("submits the typed value", () => {
        renderDialog();

        fireEvent.change(input(), { target: { value: "Book flights" } });
        fireEvent.click(screen.getByTestId("text-prompt-confirm"));

        expect(onSubmit).toHaveBeenCalledWith("Book flights");
    });

    it("submits on Enter", () => {
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
