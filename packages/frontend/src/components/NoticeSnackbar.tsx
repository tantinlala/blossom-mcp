import React from "react";
import { Alert, Snackbar } from "@mui/material";

interface NoticeSnackbarProps {
    message: string | null;
    onDismiss: () => void;
}

/**
 * Surfaces things that happened rather than things the user did - somebody else
 * switching projects, a write refused because it would have overwritten their
 * edit. Non-blocking on purpose: an alert() triggered by another person's
 * activity would freeze this tab until it was dismissed.
 */
const NoticeSnackbar: React.FC<NoticeSnackbarProps> = ({ message, onDismiss }) => (
    <Snackbar
        open={message !== null}
        autoHideDuration={6000}
        onClose={onDismiss}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
        <Alert severity="info" onClose={onDismiss} variant="filled" data-testid="notice">
            {message}
        </Alert>
    </Snackbar>
);

export default NoticeSnackbar;
