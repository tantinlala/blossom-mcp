import React from "react";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PlaylistAddCheckIcon from "@mui/icons-material/PlaylistAddCheck";
import Inbox from "./Inbox";

interface InboxPanelProps {
    ideaList: string[];
    addIdea: () => void;
    addAllIdeasToPlan: () => void;
    changeIdea: (index: number, newIdea: string) => void;
    commitIdea: (index: number) => void;
    deleteIdea: (index: number) => void;
    addTaskToContextAndRemove: (index: number) => void;
}

const InboxPanel: React.FC<InboxPanelProps> = ({
    ideaList,
    addIdea,
    addAllIdeasToPlan,
    changeIdea,
    commitIdea,
    deleteIdea,
    addTaskToContextAndRemove,
}) => {
    const isEmpty = ideaList.length === 0;

    return (
        <Box
            data-testid="inbox-panel"
            sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
                borderLeft: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
            }}
        >
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", bgcolor: "background.default" }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    Inbox
                </Typography>
                <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={addIdea}
                        sx={{ flex: 1 }}
                        data-testid="add-idea-button"
                    >
                        Add
                    </Button>
                    <Tooltip title={isEmpty ? "Nothing in the inbox to move" : "Move every idea into the plan"}>
                        {/* A disabled button emits no events, so the tooltip needs a live wrapper */}
                        <Box sx={{ flex: 1, display: "flex" }}>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<PlaylistAddCheckIcon />}
                                onClick={addAllIdeasToPlan}
                                disabled={isEmpty}
                                sx={{ flex: 1 }}
                                data-testid="move-all-button"
                            >
                                Move
                            </Button>
                        </Box>
                    </Tooltip>
                </Box>
            </Box>
            <Box sx={{ flex: 1, overflow: "hidden" }}>
                <Inbox
                    ideaList={ideaList}
                    changeIdea={changeIdea}
                    commitIdea={commitIdea}
                    deleteIdea={deleteIdea}
                    addTaskToContextAndRemove={addTaskToContextAndRemove}
                />
            </Box>
        </Box>
    );
};

export default InboxPanel;
