/**
 * Design tokens for the app.
 *
 * These are plain objects rather than MUI theme values on purpose: the React
 * Flow canvas renders nodes and edges outside MUI's styling, so it needs to read
 * the same colours directly. `theme.ts` builds the MUI theme from these.
 *
 * The palette is keyed by scheme so a dark palette can be added later without
 * changing any call site - only `theme.ts` picks a scheme.
 */

export interface Palette {
    /** App background behind the canvas */
    bg: string;
    /** Panels, headers, cards */
    surface: string;
    surfaceMuted: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
    accentContrast: string;
    danger: string;
    dangerSurface: string;
    task: {
        blocked: string;
        blockedText: string;
        unblocked: string;
        unblockedText: string;
        completed: string;
        completedText: string;
    };
    goal: {
        fill: string;
        text: string;
    };
    edge: {
        default: string;
        marker: string;
        highlighted: string;
        selected: string;
    };
}

const light: Palette = {
    bg: "#F7F8FA",
    surface: "#FFFFFF",
    surfaceMuted: "#F0F2F5",
    border: "#E3E6EB",
    text: "#1A1D23",
    textMuted: "#6B7280",
    accent: "#1D4E89",
    accentContrast: "#FFFFFF",
    danger: "#B3261E",
    dangerSurface: "#FDECEA",
    task: {
        blocked: "#E5E7EB",
        blockedText: "#4B5563",
        unblocked: "#7FBDEB",
        unblockedText: "#0B2C45",
        completed: "#4682B4",
        completedText: "#FFFFFF",
    },
    goal: {
        fill: "#1D4E89",
        text: "#FFFFFF",
    },
    edge: {
        default: "#B4BAC4",
        marker: "#9AA1AC",
        highlighted: "#1D4E89",
        // The accent a selected node is ringed in, so one selection colour covers
        // both kinds of element
        selected: "#1D4E89",
    },
};

export const palette = light;

export const radii = {
    sm: 4,
    md: 8,
    lg: 12,
};

/** MUI spacing unit; `sx={{ p: 2 }}` is 2 * this, in px. */
export const SPACING_UNIT = 8;

export const typography = {
    fontFamily: [
        "-apple-system",
        "BlinkMacSystemFont",
        "'Segoe UI'",
        "Roboto",
        "'Helvetica Neue'",
        "Arial",
        "sans-serif",
    ].join(", "),
    nodeSize: 13,
};

export const shadows = {
    card: "0 1px 2px rgba(16, 24, 40, 0.06)",
    raised: "0 4px 12px rgba(16, 24, 40, 0.10)",
    overlay: "0 8px 24px rgba(16, 24, 40, 0.12)",
};
