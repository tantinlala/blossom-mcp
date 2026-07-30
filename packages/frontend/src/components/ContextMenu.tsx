import React from "react";

function ContextMenu({ createPlanForTaskCallback, showDetailsCallback, id, top, left, right, bottom, ...props }) {
    const onCreatePlanForTask = () => {
        createPlanForTaskCallback(id);
    };

    const onShowDetails = () => {
        showDetailsCallback(id);
    };

    return (
        <div style={{ top, left, right, bottom }} className="context-menu" {...props}>
            <p style={{ margin: "0.5em" }}>
                <small>{id}</small>
            </p>
            <button onClick={onShowDetails}>Details</button>
            {createPlanForTaskCallback && <button onClick={onCreatePlanForTask}>Add Subplan</button>}
        </div>
    );
}

export default ContextMenu;
