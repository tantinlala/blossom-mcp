import React from "react";
import { Alert, Snackbar } from "@mui/material";

interface NoticeSnackbarProps {
    message: string | null;
    onDismiss: () => void;
}

/**
 * Surfaces things that happened while the user was working - somebody else
 * switching projects, a write refused because it would have overwritten their
 * edit. It is non-blocking on purpose: the trigger is usually another person's
 * activity, so the tab stays usable and the message fades on its own.
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
