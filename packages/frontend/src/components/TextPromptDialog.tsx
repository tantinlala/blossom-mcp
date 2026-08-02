import React, { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";

interface TextPromptDialogProps {
    open: boolean;
    title: string;
    label?: string;
    defaultValue: string;
    confirmLabel?: string;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}

const TextPromptDialog: React.FC<TextPromptDialogProps> = ({
    open,
    title,
    label,
    defaultValue,
    confirmLabel = "Create",
    onSubmit,
    onCancel,
}) => {
    const [value, setValue] = useState(defaultValue);

    // Each opening starts from its own default rather than whatever was typed last
    useEffect(() => {
        if (open) {
            setValue(defaultValue);
        }
    }, [open, defaultValue]);

    const trimmed = value.trim();

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!trimmed) {
            return;
        }
        onSubmit(trimmed);
    };

    return (
        <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs" data-testid="text-prompt-dialog">
            {/* A form, so Enter submits */}
            <form onSubmit={handleSubmit}>
                <DialogTitle>{title}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        margin="dense"
                        label={label}
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        // The default is a placeholder like "New Task"; selecting
                        // it means typing replaces it rather than appending
                        onFocus={(event) => event.target.select()}
                        slotProps={{ htmlInput: { "data-testid": "text-prompt-input" } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={onCancel} data-testid="text-prompt-cancel">
                        Cancel
                    </Button>
                    <Button type="submit" variant="contained" disabled={!trimmed} data-testid="text-prompt-confirm">
                        {confirmLabel}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default TextPromptDialog;
