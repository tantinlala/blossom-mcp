import React from "react";
import { Link, Typography } from "@mui/material";
import { splitIntoSegments } from "../utils/linkify";

interface LinkifiedTextProps {
    text: string;
    testId?: string;
}

/**
 * Renders plain text with any web addresses in it as links that open in a new
 * tab. Line breaks and runs of spaces are preserved, so the text reads the way
 * it was typed.
 *
 * Clicks on a link stop there: the surrounding block is free to use `onClick`
 * for its own purpose without following the link at the same time.
 */
const LinkifiedText: React.FC<LinkifiedTextProps> = ({ text, testId }) => {
    const segments = splitIntoSegments(text);

    return (
        <Typography
            variant="body2"
            component="div"
            data-testid={testId}
            sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
        >
            {segments.map((segment, index) =>
                segment.kind === "link" ? (
                    <Link
                        key={index}
                        href={segment.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event: React.MouseEvent) => event.stopPropagation()}
                    >
                        {segment.value}
                    </Link>
                ) : (
                    <React.Fragment key={index}>{segment.value}</React.Fragment>
                ),
            )}
        </Typography>
    );
};

export default LinkifiedText;
