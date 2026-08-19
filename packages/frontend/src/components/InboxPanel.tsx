import React from "react";
import { Box } from "@mui/material";
import Inbox from "./Inbox";
import SidePanel from "./SidePanel";
import { InboxGroup } from "../hooks/useInbox";

interface InboxPanelProps {
    open: boolean;
    onClose: () => void;
    /** One entry per project on the board, in lane order. */
    groups: InboxGroup[];
    addIdea: (projectKey: string) => void;
    addAllIdeasToPlan: (projectKey: string) => void;
    changeIdea: (ideaId: string, newIdea: string) => void;
    commitIdea: (ideaId: string) => void;
    deleteIdea: (ideaId: string) => void;
    addTaskToContextAndRemove: (ideaId: string) => void;
}

/**
 * The inbox panel. Each project on the board keeps its own list, with its own
 * add and move-everything controls, since an idea belongs to one plan.
 */
const InboxPanel: React.FC<InboxPanelProps> = ({
    open,
    onClose,
    groups,
    addIdea,
    addAllIdeasToPlan,
    changeIdea,
    commitIdea,
    deleteIdea,
    addTaskToContextAndRemove,
}) => {
    return (
        <SidePanel open={open} onClose={onClose} title="Inbox" testId="inbox-panel">
            <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <Box sx={{ flex: 1, overflow: "hidden" }}>
                    <Inbox
                        groups={groups}
                        showProjectKeys={groups.length > 1}
                        changeIdea={changeIdea}
                        commitIdea={commitIdea}
                        deleteIdea={deleteIdea}
                        addTaskToContextAndRemove={addTaskToContextAndRemove}
                        addIdea={addIdea}
                        addAllIdeasToPlan={addAllIdeasToPlan}
                    />
                </Box>
            </Box>
        </SidePanel>
    );
};

export default InboxPanel;
