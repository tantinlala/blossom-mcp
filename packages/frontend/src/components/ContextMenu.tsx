import React from "react";

function ContextMenu({
    name,
    createPlanForTaskCallback,
    openSubplanCallback,
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

    const onOpenSubplan = () => {
        openSubplanCallback(id);
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
            {/* A task holds at most one subplan, so these two are alternatives */}
            {createPlanForTaskCallback && <button onClick={onCreatePlanForTask}>Add Subplan</button>}
            {openSubplanCallback && <button onClick={onOpenSubplan}>Open Subplan</button>}
            {deleteCallback && (
                <button onClick={onDelete} className="context-menu-destructive">
                    Delete
                </button>
            )}
        </div>
    );
}

export default ContextMenu;
