import React from "react";

function ContextMenu({
    name,
    createPlanForTaskCallback,
    showDetailsCallback,
    deleteCallback,
    id,
    top,
    left,
    right,
    bottom,
    ...props
}) {
    const onCreatePlanForTask = () => {
        createPlanForTaskCallback(id);
    };

    const onShowDetails = () => {
        showDetailsCallback(id);
    };

    const onDelete = () => {
        deleteCallback(id);
    };

    return (
        <div style={{ top, left, right, bottom }} className="context-menu" {...props}>
            <p className="context-menu-title" title={name}>
                {name}
            </p>
            <button onClick={onShowDetails}>Details</button>
            {createPlanForTaskCallback && <button onClick={onCreatePlanForTask}>Add Subplan</button>}
            {deleteCallback && (
                <button onClick={onDelete} className="context-menu-destructive">
                    Delete
                </button>
            )}
        </div>
    );
}

export default ContextMenu;
