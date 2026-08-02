import React from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { ConnectionState } from "../utils/RealtimeClient";

const CONNECTION_LABEL: Record<ConnectionState, string> = {
    connecting: "Connecting…",
    open: "Live",
    offline: "Reconnecting…",
};

const CONNECTION_COLOR: Record<ConnectionState, string> = {
    connecting: "warning.main",
    open: "success.main",
    offline: "error.main",
};

const CONNECTION_TOOLTIP: Record<ConnectionState, string> = {
    connecting: "Connecting to the server",
    open: "Changes made elsewhere appear here as they happen",
    offline: "Not connected - changes may be out of date and edits may fail",
};

interface ConnectionIndicatorProps {
    connectionState: ConnectionState;
}

/**
 * Shows whether this browser is actually receiving changes. Without it a
 * dropped socket looks identical to nobody else doing anything.
 */
const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({ connectionState }) => (
    <Tooltip title={CONNECTION_TOOLTIP[connectionState]}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
                data-testid="connection-dot"
                sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: CONNECTION_COLOR[connectionState],
                }}
            />
            <Typography variant="caption" color="text.secondary" data-testid="connection-state">
                {CONNECTION_LABEL[connectionState]}
            </Typography>
        </Box>
    </Tooltip>
);

export default ConnectionIndicator;
export { CONNECTION_LABEL };
