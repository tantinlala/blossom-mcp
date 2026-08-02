import React from "react";
import { Box } from "@mui/material";

interface BrandMarkProps {
    /** Width and height of the mark in pixels. */
    size?: number;
}

/** Five petals around a centre, drawn in the current text colour. */
const BrandMark: React.FC<BrandMarkProps> = ({ size = 22 }) => (
    <Box
        component="svg"
        data-testid="brand-mark"
        viewBox="0 0 24 24"
        role="presentation"
        sx={{ width: size, height: size, display: "block", flexShrink: 0, color: "primary.main" }}
    >
        {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse
                key={angle}
                cx="12"
                cy="7"
                rx="3.1"
                ry="5"
                fill="currentColor"
                opacity="0.85"
                transform={`rotate(${angle} 12 12)`}
            />
        ))}
        <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    </Box>
);

export default BrandMark;
