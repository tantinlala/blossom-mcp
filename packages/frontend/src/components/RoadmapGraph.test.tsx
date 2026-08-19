import React from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import RoadmapGraph from "./RoadmapGraph";
import { mockReactFlow } from "../test/setup";
import { goalNodeId } from "../utils/goalNodeUtils";
import { Dependency, GOAL_ID, Task } from "@blossom/common";
import { TASK_COMPLETED_COLOR, TASK_BLOCKED_COLOR, TASK_UNBLOCKED_COLOR, GOAL_COLOR } from "../utils/colors";
import { TaskAndState, TaskState } from "../types/extendedTasks";
import { Board, BoardLane, Roadmap, TaskRef } from "../types/roadmap";
import { palette } from "../theme/tokens";
import { EDGE_WIDTH, EDGE_WIDTH_HIGHLIGHTED, EDGE_WIDTH_SELECTED } from "./TaskNode";

// How many edges each layout run was given, in the order the runs happened.
const mockLayoutEdgeCounts: number[] = [];
jest.mock("../utils/layouter", () => {
    const actual = jest.requireActual("../utils/layouter");
    return {
        ...actual,
        getLayoutedElements: (nodes: any, edges: any, laneOrder?: string[]) => {
            mockLayoutEdgeCounts.push(edges.length);
            return actual.getLayoutedElements(nodes, edges, laneOrder);
        },
    };
});

// The project every single-lane test draws.
const PROJECT = "Trip";

// The canvas id of that project's goal node. Every project names its own goal
// with the same sentinel, so a board keeps them apart by the project.
const GOAL_NODE = goalNodeId(PROJECT);

// Fake callbacks
const setGoal = jest.fn();
const addTask = jest.fn(async (projectKey: string, taskName: string): Promise<Task | null> => {
    return { name: taskName, id: "new-task-id", completionState: false, plan: null };
});
const removeTask = (ref: TaskRef) => {
    /* ... */
};
const connect = async (projectKey: string, source: string, target: string) => {
    /* ... */
};
const edgeRemove = async (projectKey: string, source: string, target: string) => {
    /* ... */
};
const edgeUpdate = (projectKey: string, oldSource: string, oldTarget: string, newSource: string, newTarget: string) => {
    /* ... */
};
const toggleComplete = (ref: TaskRef) => {
    /* ... */
};
const changeRoadmapContext = (ref: TaskRef) => {
    /* ... */
};
const createPlanForTask = (ref: TaskRef) => {
    /* ... */
};
const selectTask = (ref: TaskRef) => {
    /* ... */
};
const toggleTaskDetails = () => {
    /* ... */
};
const toggleNextTaskDrawer = () => {
    /* ... */
};
const handlePaste = (projectKey: string, tasks: Task[], dependencies: Dependency[]) => {
    /* ... */
};
const handleUndo = (projectKey: string) => {
    /* ... */
};
const toggleInbox = () => {
    /* ... */
};
const promptForText = jest.fn(async () => "New Task" as string | null);

/** One project's lane, which is what a board showing a single project holds. */
const laneFor = (
    tasksList: TaskAndState[],
    dependenciesList: Dependency[],
    roadmapOverrides: Partial<Roadmap> = {},
    projectKey: string = PROJECT,
): BoardLane => ({
    projectKey,
    savedToDisk: true,
    roadmap: { tasksList, dependenciesList, isSubplan: false, ancestors: [], ...roadmapOverrides },
});

const renderBoard = (board: Board, propOverrides: Record<string, any> = {}) => {
    return render(
        <ReactFlowProvider>
            <RoadmapGraph
                board={board}
                handleSetGoal={setGoal}
                handleAddTask={addTask}
                handleRemoveTask={removeTask}
                handleConnect={connect}
                handleRemoveEdge={edgeRemove}
                handleUpdateEdge={edgeUpdate}
                handleToggleComplete={toggleComplete}
                handleChangeRoadmapContext={changeRoadmapContext}
                handleCreatePlanForTask={createPlanForTask}
                handleSelectTask={selectTask}
                showTaskDetails={toggleTaskDetails}
                showNextTasks={toggleNextTaskDrawer}
                handlePaste={handlePaste}
                handleUndo={handleUndo}
                toggleInbox={toggleInbox}
                promptForText={promptForText}
                focusedProject={PROJECT}
                {...propOverrides}
            />
        </ReactFlowProvider>,
    );
};

const renderRoadmapGraph = (
    tasksList: TaskAndState[],
    dependenciesList: Dependency[],
    roadmapOverrides: Partial<Roadmap> = {},
    propOverrides: Record<string, any> = {},
) => renderBoard({ lanes: [laneFor(tasksList, dependenciesList, roadmapOverrides)] }, propOverrides);

describe("RoadmapGraph", () => {
    const GOAL_STRING: string = "My goal";
    beforeEach(() => {
        mockReactFlow();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test("renders empty plan without crashing", () => {
        const tasksList: TaskAndState[] = [];
        const dependenciesList: Dependency[] = [];

        renderRoadmapGraph(tasksList, dependenciesList);
    });

    describe("chain highlighting", () => {
        const task = (id: string, name: string): TaskAndState => ({
            task: { name, id, completionState: false, plan: null },
            state: TaskState.UNBLOCKED,
        });

        const opacityOf = (label: string) => {
            const node = screen.getByText(label).closest(".react-flow__node") as HTMLElement;
            return node.style.opacity;
        };

        test("renders nothing dimmed when no task is focused", async () => {
            renderRoadmapGraph([task("a", "Task A"), task("b", "Task B")], [{ source: "a", target: "b" }]);

            await waitFor(() => expect(screen.getByText("Task A")).toBeInTheDocument());

            expect(opacityOf("Task A")).toBe("");
            expect(opacityOf("Task B")).toBe("");
        });

        test("does not dim anything when the focused task has no chain to trace", async () => {
            // An unconnected task picks out nothing, so fading the rest of the
            // graph would blank it for no benefit.
            renderRoadmapGraph([task("a", "Task A"), task("lonely", "Lonely Task")], []);

            await waitFor(() => expect(screen.getByText("Lonely Task")).toBeInTheDocument());
            fireEvent.mouseEnter(screen.getByText("Lonely Task").closest(".react-flow__node") as HTMLElement);

            expect(opacityOf("Task A")).toBe("");
            expect(opacityOf("Lonely Task")).toBe("");
        });

        test("drops a stale hover when the layout moves nodes out from under the cursor", async () => {
            // Autoformat only exists once there is a goal to lay the plan out around
            renderRoadmapGraph(
                [task("a", "Task A"), task("b", "Task B"), task(GOAL_ID, "My goal")],
                [{ source: "a", target: "b" }],
            );
            await waitFor(() => expect(screen.getByText("Task A")).toBeInTheDocument());

            fireEvent.mouseEnter(screen.getByText("Task A").closest(".react-flow__node") as HTMLElement);
            fireEvent.click(screen.getByText("Autoformat"));

            await waitFor(() => expect(opacityOf("Task B")).toBe(""));
        });

        test("does not dim the graph when a focused task is not in the current plan", async () => {
            // Drilling into a subplan leaves the selection pointing at a task from
            // the plan above, which matches nothing here.
            const { rerender } = renderRoadmapGraph([task("a", "Task A")], []);
            await waitFor(() => expect(screen.getByText("Task A")).toBeInTheDocument());

            rerender(
                <ReactFlowProvider>
                    <RoadmapGraph
                        board={{
                            lanes: [
                                laneFor(
                                    [task("sub1", "Subtask One"), task("sub2", "Subtask Two")],
                                    [{ source: "sub1", target: "sub2" }],
                                    {
                                        isSubplan: true,
                                        ancestors: [
                                            { id: GOAL_ID, name: "Goal" },
                                            { id: "a", name: "Task A" },
                                        ],
                                    },
                                ),
                            ],
                        }}
                        handleSetGoal={setGoal}
                        handleAddTask={addTask}
                        handleRemoveTask={removeTask}
                        handleConnect={connect}
                        handleRemoveEdge={edgeRemove}
                        handleUpdateEdge={edgeUpdate}
                        handleToggleComplete={toggleComplete}
                        handleChangeRoadmapContext={changeRoadmapContext}
                        handleCreatePlanForTask={createPlanForTask}
                        handleSelectTask={selectTask}
                        showTaskDetails={toggleTaskDetails}
                        showNextTasks={toggleNextTaskDrawer}
                        handlePaste={handlePaste}
                        handleUndo={handleUndo}
                        toggleInbox={toggleInbox}
                        promptForText={promptForText}
                        focusedProject={PROJECT}
                    />
                </ReactFlowProvider>,
            );

            await waitFor(() => expect(screen.getByText("Subtask One")).toBeInTheDocument());

            expect(opacityOf("Subtask One")).toBe("");
            expect(opacityOf("Subtask Two")).toBe("");
        });
    });

    describe("dependency selection", () => {
        const task = (id: string, name: string): TaskAndState => ({
            task: { name, id, completionState: false, plan: null },
            state: TaskState.UNBLOCKED,
        });

        /** The colour as the DOM reports it back, which is the form a style read returns. */
        const asCssColour = (colour: string) => {
            const probe = document.createElement("div");
            probe.style.stroke = colour;
            return probe.style.stroke;
        };

        const dependencyGroup = () => document.querySelector(".react-flow__edge") as Element;
        const dependencyPath = () => document.querySelector(".react-flow__edge-path") as SVGPathElement;

        const renderWithOneDependency = async () => {
            const rendered = renderRoadmapGraph(
                [task("a", "Task A"), task("b", "Task B")],
                [{ source: "a", target: "b" }],
            );
            await waitFor(() => expect(dependencyPath()).toBeInTheDocument());
            return rendered;
        };

        const pressKey = (container: HTMLElement, key: string) =>
            fireEvent.keyDown(container.querySelector(".react-flow") as HTMLElement, { key });

        test("draws a dependency in the default stroke while nothing is selected", async () => {
            await renderWithOneDependency();

            expect(dependencyPath().style.stroke).toBe(asCssColour(palette.edge.default));
            expect(dependencyPath().style.strokeWidth).toBe(String(EDGE_WIDTH));
        });

        test("draws a clicked dependency in the selection colour", async () => {
            await renderWithOneDependency();

            fireEvent.click(dependencyGroup());

            await waitFor(() => expect(dependencyPath().style.stroke).toBe(asCssColour(palette.edge.selected)));
            expect(dependencyPath().style.strokeWidth).toBe(String(EDGE_WIDTH_SELECTED));
        });

        test("returns a dependency to the default stroke once the selection moves to the pane", async () => {
            await renderWithOneDependency();

            fireEvent.click(dependencyGroup());
            await waitFor(() => expect(dependencyPath().style.stroke).toBe(asCssColour(palette.edge.selected)));

            fireEvent.click(document.querySelector(".react-flow__pane") as Element);

            await waitFor(() => expect(dependencyPath().style.stroke).toBe(asCssColour(palette.edge.default)));
        });

        test("hands the selection over to the task an arrow key highlights", async () => {
            const { container } = await renderWithOneDependency();

            fireEvent.click(dependencyGroup());
            await waitFor(() => expect(dependencyGroup().classList.contains("selected")).toBe(true));

            pressKey(container, "ArrowRight");

            // The highlighted task traces its chain, which the dependency is part
            // of, so it is the selection width that says the selection has moved.
            await waitFor(() => expect(dependencyGroup().classList.contains("selected")).toBe(false));
            expect(dependencyPath().style.strokeWidth).toBe(String(EDGE_WIDTH_HIGHLIGHTED));
        });

        test("returns a dependency to the default stroke on Escape", async () => {
            const { container } = await renderWithOneDependency();

            fireEvent.click(dependencyGroup());
            await waitFor(() => expect(dependencyPath().style.stroke).toBe(asCssColour(palette.edge.selected)));

            pressKey(container, "Escape");

            await waitFor(() => expect(dependencyPath().style.stroke).toBe(asCssColour(palette.edge.default)));
        });

        test("keeps a selected dependency at full strength while a chain is traced around it", async () => {
            renderRoadmapGraph(
                [task("a", "Task A"), task("b", "Task B"), task("c", "Task C"), task("d", "Task D")],
                [
                    { source: "a", target: "b" },
                    { source: "c", target: "d" },
                ],
            );
            await waitFor(() => expect(document.querySelectorAll(".react-flow__edge-path")).toHaveLength(2));

            const [firstDependency] = Array.from(document.querySelectorAll(".react-flow__edge"));
            fireEvent.click(firstDependency);
            // Hovering the other chain dims everything outside it
            fireEvent.mouseEnter(screen.getByText("Task C").closest(".react-flow__node") as HTMLElement);

            const selectedPath = firstDependency.querySelector(".react-flow__edge-path") as SVGPathElement;
            await waitFor(() => expect(selectedPath.style.stroke).toBe(asCssColour(palette.edge.selected)));
            expect(selectedPath.style.opacity).toBe("1");
        });
    });

    describe("subplan breadcrumb", () => {
        const ancestors = [
            { id: GOAL_ID, name: "Ship product" },
            { id: "t2", name: "Prepare for departure" },
        ];

        test("is hidden before a goal exists", () => {
            renderRoadmapGraph([], []);

            expect(screen.queryByTestId("plan-breadcrumbs")).not.toBeInTheDocument();
        });

        test("shows the goal on its own at the top level", () => {
            renderRoadmapGraph([], [], { isSubplan: false, ancestors: [ancestors[0]] });

            expect(screen.getByTestId("plan-breadcrumbs")).toBeInTheDocument();
            expect(screen.getByText("Ship product")).toBeInTheDocument();
        });

        test("keeps the toolbar in place regardless of the nesting depth", () => {
            const { unmount } = renderRoadmapGraph([], [], { isSubplan: false, ancestors: [ancestors[0]] });
            const atRoot = screen.getByText("Name Goal").getBoundingClientRect().top;
            unmount();

            renderRoadmapGraph([], [], { isSubplan: true, ancestors });
            const inSubplan = screen.getByText("Name Goal").getBoundingClientRect().top;

            expect(inSubplan).toBe(atRoot);
        });

        test("shows every ancestor when viewing a subplan", () => {
            renderRoadmapGraph([], [], { isSubplan: true, ancestors });

            expect(screen.getByTestId("plan-breadcrumbs")).toBeInTheDocument();
            expect(screen.getByText("Ship product")).toBeInTheDocument();
            expect(screen.getByText("Prepare for departure")).toBeInTheDocument();
        });

        test("navigates to an ancestor when its crumb is clicked", () => {
            const changeContext = jest.fn();
            renderRoadmapGraph([], [], { isSubplan: true, ancestors }, { handleChangeRoadmapContext: changeContext });

            fireEvent.click(screen.getByText("Ship product"));

            expect(changeContext).toHaveBeenCalledWith({ projectKey: PROJECT, taskId: GOAL_ID });
        });

        test("renders the current plan as plain text rather than a link", () => {
            const changeContext = jest.fn();
            renderRoadmapGraph([], [], { isSubplan: true, ancestors }, { handleChangeRoadmapContext: changeContext });

            fireEvent.click(screen.getByText("Prepare for departure"));

            expect(changeContext).not.toHaveBeenCalled();
        });
    });

    describe("node context menu positioning", () => {
        // The pane sits below the header, so its viewport offset is non-zero —
        // this is what the menu coordinates have to be measured against.
        const PANE = { top: 64, left: 40, width: 1000, height: 800 };

        let originalGetBoundingClientRect: () => DOMRect;

        beforeEach(() => {
            originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
            HTMLElement.prototype.getBoundingClientRect = function () {
                if (this.classList.contains("react-flow")) {
                    return { ...PANE, right: PANE.left + PANE.width, bottom: PANE.top + PANE.height } as DOMRect;
                }
                return originalGetBoundingClientRect.call(this);
            };
        });

        afterEach(() => {
            HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
        });

        const openMenuAt = async (clientX: number, clientY: number) => {
            const tasksList: TaskAndState[] = [
                { task: { name: "Task 1", id: "1", completionState: false, plan: null }, state: TaskState.UNBLOCKED },
                {
                    task: { name: GOAL_STRING, id: GOAL_ID, completionState: false, plan: null },
                    state: TaskState.BLOCKED,
                },
            ];

            renderRoadmapGraph(tasksList, []);

            const node = await waitFor(() => screen.getByText("Task 1"));
            fireEvent.contextMenu(node, { clientX, clientY });

            return await waitFor(() => document.querySelector(".context-menu") as HTMLElement);
        };

        test("anchors the menu using pane-relative coordinates, not viewport ones", async () => {
            const menu = await openMenuAt(PANE.left + 300, PANE.top + 200);

            // 300/200 within the pane — not the raw 340/264 client coordinates.
            expect(menu.style.left).toBe("300px");
            expect(menu.style.top).toBe("200px");
            expect(menu.style.right).toBe("");
            expect(menu.style.bottom).toBe("");
        });

        test("flips to the right/bottom edges near the far corner of the pane", async () => {
            const menu = await openMenuAt(PANE.left + 900, PANE.top + 700);

            expect(menu.style.right).toBe("100px");
            expect(menu.style.bottom).toBe("100px");
            expect(menu.style.left).toBe("");
            expect(menu.style.top).toBe("");
        });
    });

    describe("goal vs task creation button", () => {
        test("explains what to do first when the canvas is empty", () => {
            renderRoadmapGraph([], []);

            expect(screen.getByTestId("canvas-empty-state")).toBeInTheDocument();
        });

        test("drops the empty state once a goal exists", async () => {
            const goal: TaskAndState = {
                task: { name: "My goal", id: GOAL_ID, completionState: false, plan: null },
                state: TaskState.BLOCKED,
            };
            renderRoadmapGraph([goal], []);

            await waitFor(() => expect(screen.queryByTestId("canvas-empty-state")).not.toBeInTheDocument());
        });

        test("offers to name the goal while the lane has none", () => {
            renderRoadmapGraph([], []);

            expect(screen.getByText("Name Goal")).toBeInTheDocument();
            expect(screen.queryByText("Add Task")).not.toBeInTheDocument();
        });

        test("shows only Add Task once the goal exists", async () => {
            const tasksList: TaskAndState[] = [
                {
                    task: { name: GOAL_STRING, id: GOAL_ID, completionState: false, plan: null },
                    state: TaskState.UNBLOCKED,
                },
            ];

            renderRoadmapGraph(tasksList, []);

            await waitFor(() => {
                expect(screen.getByText("Add Task")).toBeInTheDocument();
            });
            expect(screen.queryByText("Name Goal")).not.toBeInTheDocument();
        });

        test("Name Goal asks for a name and calls handleSetGoal", async () => {
            promptForText.mockResolvedValueOnce("My new goal");

            renderRoadmapGraph([], []);
            fireEvent.click(screen.getByText("Name Goal"));

            await waitFor(() => expect(setGoal).toHaveBeenCalledWith(PROJECT, "My new goal"));
        });

        test("Name Goal does nothing when the prompt is cancelled", async () => {
            promptForText.mockResolvedValueOnce(null);

            renderRoadmapGraph([], []);
            fireEvent.click(screen.getByText("Name Goal"));

            await waitFor(() => expect(promptForText).toHaveBeenCalled());
            expect(setGoal).not.toHaveBeenCalled();
        });
    });

    test("renders plan with multiple tasks and dependencies correctly", async () => {
        const tasksList: TaskAndState[] = [
            { task: { name: "Task 1", id: "1", completionState: true, plan: null }, state: TaskState.COMPLETED },
            { task: { name: "Task 2", id: "2", completionState: true, plan: null }, state: TaskState.COMPLETED },
            { task: { name: "Task 3", id: "3", completionState: false, plan: null }, state: TaskState.UNBLOCKED },
            { task: { name: "Task 4", id: "4", completionState: false, plan: null }, state: TaskState.BLOCKED },
            { task: { name: "Task 5", id: "5", completionState: false, plan: null }, state: TaskState.UNBLOCKED },
            { task: { name: GOAL_STRING, id: GOAL_ID, completionState: false, plan: null }, state: TaskState.BLOCKED },
        ];
        const dependenciesList: Dependency[] = [
            { source: "1", target: "2" },
            { source: "2", target: "3" },
            { source: "3", target: "4" },
            { source: "4", target: GOAL_ID },
            { source: "5", target: GOAL_ID },
        ];

        let { getByText } = renderRoadmapGraph(tasksList, dependenciesList);

        await waitFor(() => {
            // Check that all tasks are rendered
            tasksList.forEach((task) => {
                let taskNode = getByText(task.task.name);
                console.log(`Checking task: ${task.task.name}`);
                expect(taskNode).toBeInTheDocument();

                // Find the predecessor div that contains the background color
                const taskNodeDiv = taskNode.closest('div[style*="background"]');

                if (task.task.id === "1" || task.task.id === "2") {
                    expect(taskNodeDiv).toHaveStyle(`background: ${TASK_COMPLETED_COLOR}`);
                } else if (task.task.id === "3" || task.task.id === "5") {
                    expect(taskNodeDiv).toHaveStyle(`background: ${TASK_UNBLOCKED_COLOR}`);
                } else if (task.task.id === "4") {
                    expect(taskNodeDiv).toHaveStyle(`background: ${TASK_BLOCKED_COLOR}`);
                }
            });

            let goalNode = getByText(GOAL_STRING);
            expect(goalNode).toBeInTheDocument();

            // Find the predecessor div containing the goal node's background color
            const goalNodeDiv = goalNode.closest('div[style*="background"]');
            expect(goalNodeDiv).toHaveStyle(`background: ${GOAL_COLOR}`);
        });
    });

    test("rerendering plan will update the graph", async () => {
        const tasksList: TaskAndState[] = [
            { task: { name: "Task 1", id: "1", completionState: true, plan: null }, state: TaskState.COMPLETED },
            { task: { name: "Task 2", id: "2", completionState: true, plan: null }, state: TaskState.COMPLETED },
            { task: { name: GOAL_STRING, id: GOAL_ID, completionState: false, plan: null }, state: TaskState.BLOCKED },
        ];
        const dependenciesList: Dependency[] = [
            { source: "1", target: "2" },
            { source: "2", target: GOAL_ID },
        ];

        let { rerender, getByText } = renderRoadmapGraph(tasksList, dependenciesList);

        // Rerender with new plan but same goal
        const newTasksList: TaskAndState[] = [
            { task: { name: "Task 1", id: "1", completionState: true, plan: null }, state: TaskState.COMPLETED },
            { task: { name: "Task 3", id: "3", completionState: false, plan: null }, state: TaskState.UNBLOCKED },
            { task: { name: GOAL_STRING, id: GOAL_ID, completionState: false, plan: null }, state: TaskState.BLOCKED },
        ];
        const newDependenciesList: Dependency[] = [
            { source: "1", target: "3" },
            { source: "3", target: GOAL_ID },
        ];

        rerender(
            <ReactFlowProvider>
                <RoadmapGraph
                    board={{ lanes: [laneFor(newTasksList, newDependenciesList)] }}
                    handleSetGoal={setGoal}
                    handleAddTask={addTask}
                    handleRemoveTask={removeTask}
                    handleConnect={connect}
                    handleRemoveEdge={edgeRemove}
                    handleUpdateEdge={edgeUpdate}
                    handleToggleComplete={toggleComplete}
                    handleChangeRoadmapContext={changeRoadmapContext}
                    handleCreatePlanForTask={createPlanForTask}
                    handleSelectTask={selectTask}
                    showTaskDetails={toggleTaskDetails}
                    showNextTasks={toggleNextTaskDrawer}
                    handlePaste={handlePaste}
                    handleUndo={handleUndo}
                    toggleInbox={toggleInbox}
                    promptForText={promptForText}
                    focusedProject={PROJECT}
                />
            </ReactFlowProvider>,
        );

        await waitFor(() => {
            // Check that all tasks are rendered and color coded correctly
            newTasksList.forEach((task) => {
                let taskNode = getByText(task.task.name);
                console.log(`Checking task: ${task.task.name}`);
                expect(taskNode).toBeInTheDocument();

                // Find the predecessor div that contains the background color
                const taskNodeDiv = taskNode.closest('div[style*="background"]');

                if (task.task.id === "1") {
                    expect(taskNodeDiv).toHaveStyle(`background: ${TASK_COMPLETED_COLOR}`);
                } else if (task.task.id === "3") {
                    expect(taskNodeDiv).toHaveStyle(`background: ${TASK_UNBLOCKED_COLOR}`);
                } else if (task.task.id === GOAL_ID) {
                    expect(taskNodeDiv).toHaveStyle(`background: ${GOAL_COLOR}`);
                }
            });
        });
    });

    describe("moving the highlight with the arrow keys", () => {
        const task = (id: string, name: string): TaskAndState => ({
            task: { name, id, completionState: false, plan: null },
            state: TaskState.UNBLOCKED,
        });

        const isHighlighted = (label: string) =>
            (screen.getByText(label).closest(".react-flow__node") as HTMLElement).classList.contains("selected");

        const pressArrow = (container: HTMLElement, key: string) =>
            fireEvent.keyDown(container.querySelector(".react-flow") as HTMLElement, { key });

        test("moves to the task the arrow points at", async () => {
            const { container } = renderRoadmapGraph(
                [task("a", "Task A"), task("b", "Task B")],
                [{ source: "a", target: "b" }],
            );
            await waitFor(() => expect(screen.getByText("Task B")).toBeInTheDocument());

            fireEvent.click(screen.getByText("Task A").closest(".react-flow__node") as HTMLElement);
            await waitFor(() => expect(isHighlighted("Task A")).toBe(true));

            // The layout runs left to right, so what Task A feeds sits to its right.
            pressArrow(container, "ArrowRight");

            await waitFor(() => expect(isHighlighted("Task B")).toBe(true));
            expect(isHighlighted("Task A")).toBe(false);
        });

        test("takes the highlight into the graph when nothing is highlighted", async () => {
            const { container } = renderRoadmapGraph(
                [task("a", "Task A"), task("b", "Task B")],
                [{ source: "a", target: "b" }],
            );
            await waitFor(() => expect(screen.getByText("Task B")).toBeInTheDocument());

            pressArrow(container, "ArrowRight");

            await waitFor(() => expect(isHighlighted("Task A")).toBe(true));
        });

        test("Enter opens the highlighted task's subplan", async () => {
            const changeContext = jest.fn();
            const withSubplan: TaskAndState = {
                task: {
                    name: "Task A",
                    id: "a",
                    completionState: false,
                    plan: { tasksList: [], dependenciesList: [] },
                },
                state: TaskState.UNBLOCKED,
            };
            const { container } = renderRoadmapGraph(
                [withSubplan, task("b", "Task B")],
                [],
                {},
                { handleChangeRoadmapContext: changeContext },
            );
            await waitFor(() => expect(screen.getByText("Task A")).toBeInTheDocument());

            fireEvent.click(screen.getByText("Task A").closest(".react-flow__node") as HTMLElement);
            await waitFor(() => expect(isHighlighted("Task A")).toBe(true));

            fireEvent.keyDown(container.querySelector(".react-flow") as HTMLElement, { key: "Enter" });

            expect(changeContext).toHaveBeenCalledWith({ projectKey: PROJECT, taskId: "a" });
        });

        test("Enter ticks off a highlighted task that holds no plan", async () => {
            const toggleCompletion = jest.fn();
            const { container } = renderRoadmapGraph(
                [task("a", "Task A"), task("b", "Task B")],
                [],
                {},
                { handleToggleComplete: toggleCompletion },
            );
            await waitFor(() => expect(screen.getByText("Task A")).toBeInTheDocument());

            fireEvent.click(screen.getByText("Task A").closest(".react-flow__node") as HTMLElement);
            await waitFor(() => expect(isHighlighted("Task A")).toBe(true));

            fireEvent.keyDown(container.querySelector(".react-flow") as HTMLElement, { key: "Enter" });

            expect(toggleCompletion).toHaveBeenCalledWith({ projectKey: PROJECT, taskId: "a" });
        });

        test("Shift+Enter steps out to the plan this one sits in", async () => {
            const changeContext = jest.fn();
            const { container } = renderRoadmapGraph(
                [task("a", "Task A")],
                [],
                {
                    isSubplan: true,
                    ancestors: [
                        { id: GOAL_ID, name: "Ship product" },
                        { id: "t2", name: "Prepare for departure" },
                    ],
                },
                { handleChangeRoadmapContext: changeContext },
            );
            await waitFor(() => expect(screen.getByText("Task A")).toBeInTheDocument());

            fireEvent.keyDown(container.querySelector(".react-flow") as HTMLElement, { key: "Enter", shiftKey: true });

            expect(changeContext).toHaveBeenCalledWith({ projectKey: PROJECT, taskId: GOAL_ID });
        });

        test("Shift+Enter lands the highlight on the task whose subplan was left", async () => {
            /** Swaps the subplan for the plan holding it, the way the app does. */
            const SteppingOutGraph: React.FC = () => {
                const [inSubplan, setInSubplan] = React.useState(true);
                const roadmap = React.useMemo(
                    () =>
                        inSubplan
                            ? {
                                  tasksList: [task("child", "Subtask")],
                                  dependenciesList: [],
                                  isSubplan: true,
                                  ancestors: [
                                      { id: GOAL_ID, name: "Ship product" },
                                      { id: "holder", name: "Book lodging" },
                                  ],
                              }
                            : {
                                  tasksList: [task("holder", "Book lodging"), task("other", "Buy travel insurance")],
                                  dependenciesList: [],
                                  isSubplan: false,
                                  ancestors: [{ id: GOAL_ID, name: "Ship product" }],
                              },
                    [inSubplan],
                );

                return (
                    <ReactFlowProvider>
                        <RoadmapGraph
                            board={{ lanes: [{ projectKey: PROJECT, savedToDisk: true, roadmap }] }}
                            handleChangeRoadmapContext={() => setInSubplan(false)}
                            handleSetGoal={setGoal}
                            handleAddTask={addTask}
                            handleRemoveTask={removeTask}
                            handleConnect={connect}
                            handleRemoveEdge={edgeRemove}
                            handleUpdateEdge={edgeUpdate}
                            handleToggleComplete={toggleComplete}
                            handleCreatePlanForTask={createPlanForTask}
                            handleSelectTask={selectTask}
                            showTaskDetails={toggleTaskDetails}
                            showNextTasks={toggleNextTaskDrawer}
                            handlePaste={handlePaste}
                            handleUndo={handleUndo}
                            toggleInbox={toggleInbox}
                            promptForText={promptForText}
                            focusedProject={PROJECT}
                        />
                    </ReactFlowProvider>
                );
            };

            const { container } = render(<SteppingOutGraph />);
            await waitFor(() => expect(screen.getByText("Subtask")).toBeInTheDocument());

            fireEvent.keyDown(container.querySelector(".react-flow") as HTMLElement, { key: "Enter", shiftKey: true });

            await waitFor(() => expect(screen.getByText("Book lodging")).toBeInTheDocument());
            await waitFor(() => expect(isHighlighted("Book lodging")).toBe(true));
            expect(isHighlighted("Buy travel insurance")).toBe(false);
        });

        test("Shift+Enter stays put at the top of the plan", async () => {
            const changeContext = jest.fn();
            const { container } = renderRoadmapGraph(
                [task("a", "Task A")],
                [],
                { isSubplan: false, ancestors: [{ id: GOAL_ID, name: "Ship product" }] },
                { handleChangeRoadmapContext: changeContext },
            );
            await waitFor(() => expect(screen.getByText("Task A")).toBeInTheDocument());

            fireEvent.keyDown(container.querySelector(".react-flow") as HTMLElement, { key: "Enter", shiftKey: true });

            expect(changeContext).not.toHaveBeenCalled();
        });

        test("Escape puts the highlight down", async () => {
            const { container } = renderRoadmapGraph(
                [task("a", "Task A"), task("b", "Task B")],
                [{ source: "a", target: "b" }],
            );
            await waitFor(() => expect(screen.getByText("Task B")).toBeInTheDocument());

            fireEvent.click(screen.getByText("Task A").closest(".react-flow__node") as HTMLElement);
            await waitFor(() => expect(isHighlighted("Task A")).toBe(true));

            fireEvent.keyDown(container.querySelector(".react-flow") as HTMLElement, { key: "Escape" });

            await waitFor(() => expect(isHighlighted("Task A")).toBe(false));
            expect(isHighlighted("Task B")).toBe(false);
        });

        test("leaves the highlight where it is at the edge of the graph", async () => {
            const { container } = renderRoadmapGraph(
                [task("a", "Task A"), task("b", "Task B")],
                [{ source: "a", target: "b" }],
            );
            await waitFor(() => expect(screen.getByText("Task B")).toBeInTheDocument());

            fireEvent.click(screen.getByText("Task A").closest(".react-flow__node") as HTMLElement);
            await waitFor(() => expect(isHighlighted("Task A")).toBe(true));

            pressArrow(container, "ArrowLeft");

            await waitFor(() => expect(isHighlighted("Task A")).toBe(true));
        });
    });

    describe("a board holding several projects", () => {
        const OTHER = "House";

        const laneTask = (id: string, name: string): TaskAndState => ({
            task: { name, id, completionState: false, plan: null },
            state: TaskState.UNBLOCKED,
        });

        const goalOf = (name: string): TaskAndState => ({
            task: { name, id: GOAL_ID, completionState: false, plan: null },
            state: TaskState.BLOCKED,
        });

        const twoLanes = (): Board => ({
            lanes: [
                laneFor([laneTask("t1", "Pack"), goalOf("Get to Lisbon")], [{ source: "t1", target: GOAL_ID }]),
                laneFor([laneTask("h1", "Choose paint"), goalOf("Redecorate")], [], {}, OTHER),
            ],
        });

        test("draws every project's tasks, each lane anchored by its own goal", async () => {
            renderBoard(twoLanes());

            await waitFor(() => expect(screen.getByText("Pack")).toBeInTheDocument());
            expect(screen.getByText("Choose paint")).toBeInTheDocument();
            expect(screen.getByText("Get to Lisbon")).toBeInTheDocument();
            expect(screen.getByText("Redecorate")).toBeInTheDocument();
        });

        test("names each lane's project on its goal node, so which lane is which is readable", async () => {
            renderBoard(twoLanes());

            await waitFor(() => expect(screen.getByText(PROJECT)).toBeInTheDocument());
            expect(screen.getByText(OTHER)).toBeInTheDocument();
        });

        test("keeps the two goals apart, since every project names its goal the same way", async () => {
            renderBoard(twoLanes());

            await waitFor(() => expect(screen.getByText("Get to Lisbon")).toBeInTheDocument());
            // Two tasks and two goals: the goals are separate nodes, drawn under
            // ids that carry the project each belongs to.
            expect(document.querySelectorAll(".react-flow__node")).toHaveLength(4);
            expect(goalNodeId(PROJECT)).not.toBe(goalNodeId(OTHER));
        });

        test("says which project the toolbar acts on", async () => {
            renderBoard(twoLanes());

            await waitFor(() => expect(screen.getByText(`Add Task to ${PROJECT}`)).toBeInTheDocument());
        });

        test("adds a task to the project it was told is being worked in", async () => {
            promptForText.mockResolvedValueOnce("Choose a colour");
            renderBoard(twoLanes(), { focusedProject: OTHER });
            await waitFor(() => expect(screen.getByText(`Add Task to ${OTHER}`)).toBeInTheDocument());

            fireEvent.click(screen.getByText(`Add Task to ${OTHER}`));

            await waitFor(() => expect(addTask).toHaveBeenCalledWith(OTHER, "Choose a colour"));
        });

        test("reports the project holding whatever was picked out", async () => {
            const onSelectionProjectChange = jest.fn();
            renderBoard(twoLanes(), { onSelectionProjectChange });
            await waitFor(() => expect(screen.getByText("Choose paint")).toBeInTheDocument());

            fireEvent.click(screen.getByText("Choose paint").closest(".react-flow__node") as HTMLElement);

            await waitFor(() => expect(onSelectionProjectChange).toHaveBeenLastCalledWith(OTHER));
        });

        test("reports nothing picked out while nothing is", async () => {
            const onSelectionProjectChange = jest.fn();
            renderBoard(twoLanes(), { onSelectionProjectChange });

            await waitFor(() => expect(onSelectionProjectChange).toHaveBeenCalledWith(null));
        });

        test("names the task's project when it is selected", async () => {
            const handleSelectTask = jest.fn();
            renderBoard(twoLanes(), { handleSelectTask });
            await waitFor(() => expect(screen.getByText("Choose paint")).toBeInTheDocument());

            fireEvent.click(screen.getByText("Choose paint").closest(".react-flow__node") as HTMLElement);

            expect(handleSelectTask).toHaveBeenCalledWith({ projectKey: OTHER, taskId: "h1" });
        });

        test("deletes a task from the project holding it", async () => {
            const handleRemoveTask = jest.fn();
            renderBoard(twoLanes(), { handleRemoveTask });
            await waitFor(() => expect(screen.getByText("Choose paint")).toBeInTheDocument());

            fireEvent.click(screen.getByText("Choose paint").closest(".react-flow__node") as HTMLElement);
            fireEvent.keyDown(document.querySelector(".react-flow") as HTMLElement, { key: "Delete" });

            expect(handleRemoveTask).toHaveBeenCalledWith({ projectKey: OTHER, taskId: "h1" });
        });

        test("undoes within the project being worked in", async () => {
            const handleUndo = jest.fn();
            renderBoard(twoLanes(), { handleUndo, focusedProject: OTHER });
            await waitFor(() => expect(screen.getByText("Choose paint")).toBeInTheDocument());

            fireEvent.keyDown(document.querySelector(".react-flow") as HTMLElement, { key: "z", ctrlKey: true });

            expect(handleUndo).toHaveBeenCalledWith(OTHER);
        });

        test("pastes into the project being worked in", async () => {
            const handlePasteInto = jest.fn();
            const clipboard = JSON.stringify({ tasks: [{ id: "c", name: "Copied" }], dependencies: [] });
            Object.assign(navigator, { clipboard: { readText: async () => clipboard } });
            renderBoard(twoLanes(), { handlePaste: handlePasteInto, focusedProject: OTHER });
            await waitFor(() => expect(screen.getByText("Choose paint")).toBeInTheDocument());

            fireEvent.keyDown(document.querySelector(".react-flow") as HTMLElement, { key: "v", ctrlKey: true });

            await waitFor(() => expect(handlePasteInto).toHaveBeenCalledWith(OTHER, expect.anything(), []));
        });

        test("drills one lane into a subplan by the project it belongs to", async () => {
            const handleChangeRoadmapContext = jest.fn();
            const withSubplan: TaskAndState = {
                task: {
                    name: "Prepare",
                    id: "h2",
                    completionState: false,
                    plan: { tasksList: [], dependenciesList: [] },
                },
                state: TaskState.UNBLOCKED,
            };
            renderBoard(
                {
                    lanes: [
                        laneFor([laneTask("t1", "Pack"), goalOf("Get to Lisbon")], []),
                        laneFor([withSubplan, goalOf("Redecorate")], [], {}, OTHER),
                    ],
                },
                { handleChangeRoadmapContext },
            );
            await waitFor(() => expect(screen.getByText("Prepare")).toBeInTheDocument());

            fireEvent.doubleClick(screen.getByText("Prepare").closest(".react-flow__node") as HTMLElement);

            expect(handleChangeRoadmapContext).toHaveBeenCalledWith({ projectKey: OTHER, taskId: "h2" });
        });

        test("leaves the empty-state prompt off a board that holds work", async () => {
            renderBoard(twoLanes());

            await waitFor(() => expect(screen.getByText("Pack")).toBeInTheDocument());
            expect(screen.queryByTestId("canvas-empty-state")).not.toBeInTheDocument();
            expect(screen.queryByTestId("board-empty-state")).not.toBeInTheDocument();
        });
    });

    describe("an empty board", () => {
        test("says where projects are chosen", () => {
            renderBoard({ lanes: [] });

            expect(screen.getByTestId("board-empty-state")).toBeInTheDocument();
        });

        test("offers no toolbar, since there is no project for it to act on", () => {
            renderBoard({ lanes: [] });

            expect(screen.queryByText("Add Task")).not.toBeInTheDocument();
            expect(screen.queryByText("Name Goal")).not.toBeInTheDocument();
        });
    });

    describe("creating a task from a selection", () => {
        /**
         * Stands in for the server: adding a task and adding a dependency are
         * separate round trips, and each one comes back as a new roadmap. The
         * dependency is held open until the test releases it, which is the window
         * in which the new task is on the canvas with nothing attached to it.
         */
        const ServerBackedGraph: React.FC<{ releaseConnect: Promise<void> }> = ({ releaseConnect }) => {
            const [tasksList, setTasksList] = React.useState<TaskAndState[]>([
                { task: { name: "Task A", id: "a", completionState: false, plan: null }, state: TaskState.UNBLOCKED },
            ]);
            const [dependenciesList, setDependenciesList] = React.useState<Dependency[]>([]);

            const handleAddTask = async (projectKey: string, name: string): Promise<Task> => {
                const task: Task = { name, id: "new-task-id", completionState: false, plan: null };
                setTasksList((current) => [...current, { task, state: TaskState.UNBLOCKED }]);
                return task;
            };

            // The dependency makes the new task wait on Task A, which the server
            // reports back as a state on the task itself.
            const handleConnect = async (projectKey: string, source: string, target: string) => {
                await releaseConnect;
                setDependenciesList((current) => [...current, { source, target }]);
                setTasksList((current) =>
                    current.map((entry) => (entry.task.id === target ? { ...entry, state: TaskState.BLOCKED } : entry)),
                );
            };

            // The app hands the graph a board that only changes when a plan
            // does, and the graph rebuilds its nodes from every one it is given.
            const board = React.useMemo(
                () => ({ lanes: [laneFor(tasksList, dependenciesList)] }),
                [tasksList, dependenciesList],
            );

            return (
                <ReactFlowProvider>
                    <RoadmapGraph
                        board={board}
                        handleAddTask={handleAddTask}
                        handleConnect={handleConnect}
                        handleSetGoal={setGoal}
                        handleRemoveTask={removeTask}
                        handleRemoveEdge={edgeRemove}
                        handleUpdateEdge={edgeUpdate}
                        handleToggleComplete={toggleComplete}
                        handleChangeRoadmapContext={changeRoadmapContext}
                        handleCreatePlanForTask={createPlanForTask}
                        handleSelectTask={selectTask}
                        showTaskDetails={toggleTaskDetails}
                        showNextTasks={toggleNextTaskDrawer}
                        handlePaste={handlePaste}
                        handleUndo={handleUndo}
                        toggleInbox={toggleInbox}
                        promptForText={promptForText}
                        focusedProject={PROJECT}
                    />
                </ReactFlowProvider>
            );
        };

        test("lays the graph out once the new task's edge has landed", async () => {
            promptForText.mockResolvedValue("New Task");
            let release: () => void = () => {};
            const releaseConnect = new Promise<void>((resolve) => {
                release = resolve;
            });
            const { container } = render(<ServerBackedGraph releaseConnect={releaseConnect} />);

            await waitFor(() => expect(screen.getByText("Task A")).toBeInTheDocument());
            fireEvent.click(screen.getByText("Task A").closest(".react-flow__node") as HTMLElement);

            mockLayoutEdgeCounts.length = 0;
            fireEvent.keyDown(container.querySelector(".react-flow") as HTMLElement, { key: " " });

            // The task arrives first, so it is on the canvas with no edge yet.
            await waitFor(() => expect(screen.getByText("New Task")).toBeInTheDocument());
            release();

            // Where a task belongs follows from what it connects to, so the last
            // word on its position has to be a layout that has seen the edge.
            await waitFor(() => expect(mockLayoutEdgeCounts[mockLayoutEdgeCounts.length - 1]).toBe(1));
        });

        test("shows the new task as blocked once its edge has landed", async () => {
            promptForText.mockResolvedValue("New Task");
            let release: () => void = () => {};
            const releaseConnect = new Promise<void>((resolve) => {
                release = resolve;
            });
            const { container } = render(<ServerBackedGraph releaseConnect={releaseConnect} />);

            await waitFor(() => expect(screen.getByText("Task A")).toBeInTheDocument());
            fireEvent.click(screen.getByText("Task A").closest(".react-flow__node") as HTMLElement);
            fireEvent.keyDown(container.querySelector(".react-flow") as HTMLElement, { key: " " });

            await waitFor(() => expect(screen.getByText("New Task")).toBeInTheDocument());
            release();

            // Laying the graph out over the top of the arriving plan would leave
            // the task coloured as one that is ready to start.
            await waitFor(() =>
                expect(screen.getByText("New Task").closest('div[style*="background"]')).toHaveStyle(
                    `background: ${TASK_BLOCKED_COLOR}`,
                ),
            );
        });
    });
});
