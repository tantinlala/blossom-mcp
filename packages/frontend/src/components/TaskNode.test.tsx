import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ReactFlowProvider } from "@xyflow/react";
import TaskNode, { appearanceForState } from "./TaskNode";
import { TaskState } from "../types/extendedTasks";
import { palette } from "../theme/tokens";

const renderNode = (data: Record<string, any>, selected = false) =>
    render(
        <ReactFlowProvider>
            <TaskNode
                id="t1"
                selected={selected}
                data={{
                    label: "Book lodging",
                    taskState: TaskState.UNBLOCKED,
                    completionState: false,
                    hasPlan: false,
                    onToggleComplete: jest.fn(),
                    ...data,
                }}
            />
        </ReactFlowProvider>,
    );

/** The label sits directly inside the node card. */
const card = () => screen.getByText("Book lodging").parentElement as HTMLElement;

describe("appearanceForState", () => {
    it("gives each state its own fill and a text colour to match", () => {
        expect(appearanceForState(TaskState.UNBLOCKED)).toEqual({
            background: palette.task.unblocked,
            color: palette.task.unblockedText,
        });
        expect(appearanceForState(TaskState.BLOCKED)).toEqual({
            background: palette.task.blocked,
            color: palette.task.blockedText,
        });
        expect(appearanceForState(TaskState.COMPLETED)).toEqual({
            background: palette.task.completed,
            color: palette.task.completedText,
        });
    });

    it("treats an undetermined state as blocked rather than failing", () => {
        expect(appearanceForState(TaskState.UNDETERMINED).background).toBe(palette.task.blocked);
    });
});

describe("TaskNode", () => {
    it("shows a completion checkbox only for tasks without a subplan", () => {
        renderNode({ hasPlan: false });
        expect(screen.getByRole("checkbox")).toBeInTheDocument();
    });

    it("replaces the checkbox with a subplan badge for tasks that have one", () => {
        renderNode({ hasPlan: true });

        expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
        expect(screen.getByTitle("Has a subplan - double-click to open")).toBeInTheDocument();
    });

    it("strikes through completed tasks so state is not carried by colour alone", () => {
        renderNode({ taskState: TaskState.COMPLETED, completionState: true });

        expect(screen.getByText("Book lodging")).toHaveStyle({ textDecoration: "line-through" });
    });

    it("does not strike through tasks that are still open", () => {
        renderNode({ taskState: TaskState.UNBLOCKED });

        expect(screen.getByText("Book lodging")).toHaveStyle({ textDecoration: "none" });
    });

    it("exposes the full label as a tooltip, since long ones are clamped", () => {
        renderNode({ label: "Book lodging" });

        expect(screen.getByTitle("Book lodging")).toBeInTheDocument();
    });

    it("marks selection with a ring rather than a thicker border, so size does not shift", () => {
        const { unmount } = renderNode({}, false);
        const unselectedBorder = card().style.border;
        const unselectedShadow = card().style.boxShadow;
        unmount();

        renderNode({}, true);

        // The ring is what changes; the border stays put so the node keeps its size
        expect(card().style.boxShadow).not.toBe(unselectedShadow);
        expect(card().style.border).toBe(unselectedBorder);
    });
});
