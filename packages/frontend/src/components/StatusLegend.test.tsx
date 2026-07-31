import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import StatusLegend from "./StatusLegend";

describe("StatusLegend", () => {
    it("names every state a node can be in", () => {
        render(<StatusLegend />);

        expect(screen.getByTestId("status-legend")).toBeInTheDocument();
        expect(screen.getByText("Ready")).toBeInTheDocument();
        expect(screen.getByText("Blocked")).toBeInTheDocument();
        expect(screen.getByText("Done")).toBeInTheDocument();
    });
});
