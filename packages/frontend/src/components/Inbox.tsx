import { useCallback } from "react";
import { Box, IconButton, InputBase, Tooltip, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";

const Inbox = (props: {
    ideaList: string[];
    changeIdea: (index: number, newIdea: string) => void;
    commitIdea: (index: number) => void;
    deleteIdea: (index: number) => void;
    addTaskToContextAndRemove: (index: number) => void;
}) => {
    const handleEdit = useCallback(
        (index: number, newIdea: string) => {
            props.changeIdea(index, newIdea);
        },
        [props],
    );

    const handleCommit = useCallback(
        (index: number) => {
            props.commitIdea(index);
        },
        [props],
    );

    const handleDelete = useCallback(
        (index: number) => {
            props.deleteIdea(index);
        },
        [props],
    );

    const handleAddToContext = useCallback(
        (index: number) => {
            props.addTaskToContextAndRemove(index);
        },
        [props],
    );

    if (props.ideaList.length === 0) {
        return (
            <Box data-testid="inbox" sx={{ p: 3, textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">
                    Nothing here yet
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    Park half-formed ideas here, then move them into the plan once you know where they belong.
                </Typography>
            </Box>
        );
    }

    return (
        <Box data-testid="inbox" sx={{ height: "100%", overflowY: "auto", py: 0.5 }}>
            {props.ideaList.map((idea, index) => (
                <Box
                    key={index}
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        px: 1,
                        py: 0.25,
                        // The row actions are noise until the row is the one being
                        // worked on, so they only appear on hover or keyboard focus
                        "& .inbox-row-actions": { opacity: 0 },
                        "&:hover": { bgcolor: "action.hover" },
                        "&:hover .inbox-row-actions, &:focus-within .inbox-row-actions": { opacity: 1 },
                    }}
                >
                    <InputBase
                        value={idea}
                        placeholder="New idea"
                        onChange={(e) => handleEdit(index, e.target.value)}
                        onBlur={() => handleCommit(index)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                handleCommit(index);
                            }
                        }}
                        sx={{
                            flex: 1,
                            fontSize: 14,
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            "&.Mui-focused": { bgcolor: "background.paper", outline: 1, outlineColor: "primary.main" },
                        }}
                    />
                    <Box className="inbox-row-actions" sx={{ display: "flex", flexShrink: 0 }}>
                        <Tooltip title="Add to plan and remove from inbox">
                            <IconButton
                                size="small"
                                aria-label="Add to plan and remove from inbox"
                                onClick={() => handleAddToContext(index)}
                            >
                                <AddIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove from inbox">
                            <IconButton size="small" aria-label="Remove from inbox" onClick={() => handleDelete(index)}>
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
            ))}
        </Box>
    );
};

export default Inbox;
