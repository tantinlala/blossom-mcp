import { useCallback } from "react";
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

    return (
        <div data-testid="inbox" style={{ height: "100%", overflow: "auto" }}>
            {props.ideaList.map((idea, index) => (
                <div style={{ height: "30px", display: "flex", alignItems: "center" }} key={index}>
                    <button
                        style={{
                            width: "20px",
                            height: "20px",
                            padding: 0,
                            margin: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                        onClick={() => handleAddToContext(index)}
                        title="Add to project and remove from inbox"
                    >
                        <AddIcon style={{ fontSize: "20px" }} />
                    </button>
                    <button
                        style={{
                            width: "20px",
                            height: "20px",
                            padding: 0,
                            margin: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                        onClick={() => handleDelete(index)}
                        title="Remove from inbox"
                    >
                        <DeleteIcon style={{ fontSize: "20px" }} />
                    </button>
                    <input
                        value={idea}
                        placeholder="New idea"
                        onChange={(e) => handleEdit(index, e.target.value)}
                        onBlur={() => handleCommit(index)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                handleCommit(index);
                            }
                        }}
                        style={{
                            height: "20px",
                            width: "calc(100% - 40px)", // Adjusted for two buttons
                            backgroundColor: "white",
                        }}
                    />
                </div>
            ))}
        </div>
    );
};

export default Inbox;
