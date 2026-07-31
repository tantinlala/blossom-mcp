import { createTheme } from "@mui/material/styles";
import { palette, radii, shadows, SPACING_UNIT, typography } from "./tokens";

/**
 * The MUI theme, built from the shared tokens. Component overrides live here so
 * individual components can stay free of styling boilerplate.
 */
const theme = createTheme({
    spacing: SPACING_UNIT,
    palette: {
        mode: "light",
        primary: { main: palette.accent, contrastText: palette.accentContrast },
        error: { main: palette.danger },
        background: { default: palette.bg, paper: palette.surface },
        text: { primary: palette.text, secondary: palette.textMuted },
        divider: palette.border,
    },
    shape: { borderRadius: radii.md },
    typography: {
        fontFamily: typography.fontFamily,
        button: { textTransform: "none", fontWeight: 500 },
        subtitle1: { fontSize: "0.95rem", fontWeight: 600 },
        h6: { fontSize: "1.15rem", fontWeight: 600 },
    },
    components: {
        MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
                root: { borderRadius: radii.md },
                sizeSmall: { paddingTop: 4, paddingBottom: 4 },
            },
        },
        MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
                root: { backgroundImage: "none" },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: { borderRadius: radii.md, backgroundColor: palette.surface },
            },
        },
        MuiIconButton: {
            styleOverrides: {
                root: { borderRadius: radii.sm },
            },
        },
        MuiTooltip: {
            defaultProps: { arrow: true },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: { borderRadius: radii.sm },
            },
        },
    },
});

export { theme, shadows };
export default theme;
