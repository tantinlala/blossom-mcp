import { Box, IconButton, InputBase, Tooltip, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import PlaylistAddCheckIcon from "@mui/icons-material/PlaylistAddCheck";
import { InboxGroup } from "../hooks/useInbox";

interface InboxProps {
    /** One entry per project on the board, in lane order. */
    groups: InboxGroup[];
    /** Whether each list needs saying which project it belongs to. */
    showProjectKeys: boolean;
    changeIdea: (ideaId: string, newIdea: string) => void;
    commitIdea: (ideaId: string) => void;
    deleteIdea: (ideaId: string) => void;
    addTaskToContextAndRemove: (ideaId: string) => void;
    addIdea: (projectKey: string) => void;
    addAllIdeasToPlan: (projectKey: string) => void;
}

/**
 * The unorganized ideas of every project on the board, one list per project.
 *
 * Each row is addressed by the idea's own id, which belongs to exactly one
 * project - so a row says both which idea is meant and where to write it,
 * whatever else is on the board.
 */
const Inbox = ({
    groups,
    showProjectKeys,
    changeIdea,
    commitIdea,
    deleteIdea,
    addTaskToContextAndRemove,
    addIdea,
    addAllIdeasToPlan,
}: InboxProps) => {
    if (groups.length === 0) {
        return (
            <Box data-testid="inbox" sx={{ p: 3, textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">
                    No projects on the board
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    Every project keeps its own inbox. Choose a project to park ideas in it.
                </Typography>
            </Box>
        );
    }

    return (
        <Box data-testid="inbox" sx={{ height: "100%", overflowY: "auto", py: 0.5 }}>
            {groups.map((group) => (
                <Box key={group.projectKey} data-testid={`inbox-group-${group.projectKey}`} sx={{ mb: 1 }}>
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            px: 1.5,
                            py: 0.5,
                            position: "sticky",
                            top: 0,
                            bgcolor: "background.paper",
                            zIndex: 1,
                        }}
                    >
                        {showProjectKeys && (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                noWrap
                                sx={{ flex: 1, textTransform: "uppercase", letterSpacing: "0.04em" }}
                            >
                                {group.projectKey}
                            </Typography>
                        )}
                        <Box sx={{ display: "flex", ml: showProjectKeys ? 0 : "auto" }}>
                            <Tooltip title="Add an idea">
                                <IconButton
                                    size="small"
                                    aria-label={`Add an idea to ${group.projectKey}`}
                                    data-testid={`add-idea-${group.projectKey}`}
                                    onClick={() => addIdea(group.projectKey)}
                                >
                                    <AddIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip
                                title={
                                    group.ideas.length === 0
                                        ? "Nothing in this inbox to move"
                                        : "Move every idea into the plan"
                                }
                            >
                                {/* A disabled button emits no events, so the tooltip needs a live wrapper */}
                                <Box sx={{ display: "flex" }}>
                                    <IconButton
                                        size="small"
                                        aria-label={`Move every idea in ${group.projectKey} into the plan`}
                                        data-testid={`move-all-${group.projectKey}`}
                                        disabled={group.ideas.length === 0}
                                        onClick={() => addAllIdeasToPlan(group.projectKey)}
                                    >
                                        <PlaylistAddCheckIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            </Tooltip>
                        </Box>
                    </Box>

                    {group.ideas.length === 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, pb: 1 }}>
                            Park half-formed ideas here, then move them into the plan once you know where they belong.
                        </Typography>
                    )}

                    {group.ideas.map((idea) => (
                        <Box
                            key={idea.id}
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
                                value={idea.text}
                                placeholder="New idea"
                                onChange={(e) => changeIdea(idea.id, e.target.value)}
                                onBlur={() => commitIdea(idea.id)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        commitIdea(idea.id);
                                    }
                                }}
                                sx={{
                                    flex: 1,
                                    fontSize: 14,
                                    px: 1,
                                    py: 0.5,
                                    borderRadius: 1,
                                    "&.Mui-focused": {
                                        bgcolor: "background.paper",
                                        outline: "1px solid",
                                        outlineColor: "primary.main",
                                    },
                                }}
                            />
                            <Box className="inbox-row-actions" sx={{ display: "flex", flexShrink: 0 }}>
                                <Tooltip title="Add to plan and remove from inbox">
                                    <IconButton
                                        size="small"
                                        aria-label="Add to plan and remove from inbox"
                                        onClick={() => addTaskToContextAndRemove(idea.id)}
                                    >
                                        <AddIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Remove from inbox">
                                    <IconButton
                                        size="small"
                                        aria-label="Remove from inbox"
                                        onClick={() => deleteIdea(idea.id)}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </Box>
                    ))}
                </Box>
            ))}
        </Box>
    );
};

export default Inbox;
