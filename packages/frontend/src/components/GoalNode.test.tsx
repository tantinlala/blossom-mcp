import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ReactFlowProvider } from "@xyflow/react";
import GoalNode, { UNNAMED_GOAL_LABEL } from "./GoalNode";
import { GOAL_COLOR } from "../utils/colors";

const renderNode = (data: Record<string, any> = {}, selected = false) =>
    render(
        <ReactFlowProvider>
            <GoalNode selected={selected} data={{ label: "Get to Lisbon", projectKey: "Trip", ...data }} />
        </ReactFlowProvider>,
    );

/** The two lines sit directly inside the node card. */
const card = () => screen.getByText("Trip").parentElement as HTMLElement;

describe("GoalNode", () => {
    it("shows the goal and the project it belongs to", () => {
        renderNode();

        expect(screen.getByText("Get to Lisbon")).toBeInTheDocument();
        expect(screen.getByText("Trip")).toBeInTheDocument();
    });

    it("names the project even before the goal has a name, so the lane is identifiable", () => {
        renderNode({ label: "" });

        expect(screen.getByText("Trip")).toBeInTheDocument();
        expect(screen.getByText(UNNAMED_GOAL_LABEL)).toBeInTheDocument();
    });

    it("carries the goal fill, so it reads apart from the tasks feeding it", () => {
        renderNode();

        expect(card()).toHaveStyle({ background: GOAL_COLOR });
    });

    it("takes a ring when picked out, so its size does not shift", () => {
        const { rerender } = renderNode();
        const plainShadow = card().style.boxShadow;

        rerender(
            <ReactFlowProvider>
                <GoalNode selected={true} data={{ label: "Get to Lisbon", projectKey: "Trip" }} />
            </ReactFlowProvider>,
        );

        expect(card().style.boxShadow).not.toBe(plainShadow);
    });

    it("offers the handle a dependency into the goal attaches to", () => {
        const { container } = renderNode();

        expect(container.querySelector(".react-flow__handle-left")).not.toBeNull();
    });
});
