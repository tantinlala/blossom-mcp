import React from "react";
import { Box, Button } from "@material-ui/core";
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
    return (
        <div
            data-testid="inbox-panel"
            style={{
                flex: 1,
                borderLeft: "1px solid #e0e0e0",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
            }}
        >
            <Box display="flex" alignItems="center" padding={1} bgcolor="#f5f5f5" flexDirection="column">
                <Box flex={1} width="100%" marginBottom={1}>
                    <h3 style={{ margin: 0, textAlign: "center" }}>Inbox</h3>
                </Box>
                <Box display="flex" flexDirection="row" width="100%" justifyContent="space-between" marginBottom={1}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={addIdea}
                        size="small"
                        style={{
                            width: "48%",
                        }}
                        data-testid="add-idea-button"
                    >
                        Add
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={addAllIdeasToPlan}
                        disabled={ideaList.length === 0}
                        size="small"
                        style={{
                            width: "48%",
                        }}
                        data-testid="move-all-button"
                    >
                        Move
                    </Button>
                </Box>
            </Box>
            <div style={{ flex: 1, overflow: "hidden" }}>
                <Inbox
                    ideaList={ideaList}
                    changeIdea={changeIdea}
                    commitIdea={commitIdea}
                    deleteIdea={deleteIdea}
                    addTaskToContextAndRemove={addTaskToContextAndRemove}
                />
            </div>
        </div>
    );
};

export default InboxPanel;
