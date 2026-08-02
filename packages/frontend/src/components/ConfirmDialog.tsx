import React from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    message,
    confirmLabel = "Continue",
    onConfirm,
    onCancel,
}) => (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs" data-testid="confirm-dialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
            <DialogContentText data-testid="confirm-message">{message}</DialogContentText>
        </DialogContent>
        <DialogActions>
            <Button onClick={onCancel} data-testid="confirm-cancel">
                Cancel
            </Button>
            <Button onClick={onConfirm} variant="contained" data-testid="confirm-accept">
                {confirmLabel}
            </Button>
        </DialogActions>
    </Dialog>
);

export default ConfirmDialog;
