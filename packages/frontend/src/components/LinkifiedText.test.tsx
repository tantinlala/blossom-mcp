import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import LinkifiedText from "./LinkifiedText";

describe("LinkifiedText Component", () => {
    it("renders plain text as it was given", () => {
        render(<LinkifiedText text="A description with no addresses in it" />);

        expect(screen.getByText("A description with no addresses in it")).toBeInTheDocument();
    });

    it("renders a URL as a link that opens in a new tab", () => {
        render(<LinkifiedText text="See https://example.com/spec for details" />);

        const link = screen.getByRole("link", { name: "https://example.com/spec" });
        expect(link).toHaveAttribute("href", "https://example.com/spec");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("links a bare www address over https", () => {
        render(<LinkifiedText text="www.example.com" />);

        expect(screen.getByRole("link", { name: "www.example.com" })).toHaveAttribute(
            "href",
            "https://www.example.com",
        );
    });

    it("renders one link per address", () => {
        render(<LinkifiedText text="https://one.com and https://two.com" />);

        expect(screen.getAllByRole("link")).toHaveLength(2);
    });

    it("keeps a link click from reaching the surrounding block", () => {
        const onContainerClick = jest.fn();
        render(
            <div onClick={onContainerClick}>
                <LinkifiedText text="https://example.com" />
            </div>,
        );

        fireEvent.click(screen.getByRole("link"));

        expect(onContainerClick).not.toHaveBeenCalled();
    });

    it("applies the given test id", () => {
        render(<LinkifiedText text="Some text" testId="description-text" />);

        expect(screen.getByTestId("description-text")).toBeInTheDocument();
    });
});
