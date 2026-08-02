import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GOAL_ID, MCP_AUTHOR, Task } from "@blossom/common";
import { ProjectStore, UndoBlockedError } from "../state/projectStore";

const TREE_EXPLANATION =
    `The project is a recursive tree: the root goal has a plan containing tasks, and any task may itself ` +
    `contain a nested plan of subtasks. Tasks are addressed by their id. The special id "${GOAL_ID}" refers ` +
    `to the root goal; dependencies inside a plan may use "${GOAL_ID}" as a target to indicate the edge feeds ` +
    `directly into that plan's goal. A dependency {source, target} means the source task must finish before ` +
    `the target can start.`;

// How many top-level tasks a plan should hold before grouping into subgoals,
// carried over from the original Planner.
const MAX_TOP_LEVEL_TASKS = 8;

// Roughly what fits on one or two lines of a roadmap node before the box grows
// and the graph becomes hard to read.
const MAX_NAME_CHARS = 40;

// Names are rendered inside fixed-width roadmap nodes, so long ones blow the
// node up and swamp the graph. All the detail belongs in the description, which
// the UI shows in the task details drawer instead.
const NAMING_GUIDANCE =
    `**Naming:** Every goal and task name must start with a verb in the imperative and read as one ` +
    `actionable item - "Sign software engineering offer", "Rewrite resume", "Book venue" - never a bare ` +
    `noun phrase ("Resume", "Venue"), a status ("Resume done"), a question, or a full sentence. Names are ` +
    `labels on a graph node: aim for at most ${MAX_NAME_CHARS} characters (about 3-6 words) and never let ` +
    `one run past a single short line. If a name needs "and", it is two tasks. Put all the substance - the ` +
    `specifics, measures, deadlines, constraints, acceptance criteria and rationale from the conversation - ` +
    `in the description field instead, which can be as long as needed. For example, prefer the name ` +
    `"Sign software engineering offer" with the description "At a mid-size, remote-friendly product company ` +
    `within 4 months, with at least a 20% total-comp increase" over cramming all of that into the name. ` +
    `When you promote an inbox idea whose text reads as a full sentence or a bare noun, follow up with ` +
    `update_task to rewrite the name as a short imperative action and move the detail into the description.`;

// Workflow guidance ported from the original Ideator/Planner system prompts.
// Sent as server instructions on connect, so any MCP client steers the LLM
// through the same goal-clarification -> ideation -> planning flow the old
// built-in chat used. The user watches the roadmap and inbox update live in
// the web UI, so changes should be made through tools as the conversation
// progresses, not batched at the end.
const SERVER_INSTRUCTIONS =
    `You are a project planning assistant helping the user define a goal and build a project roadmap. ` +
    `Assume the user may lack experience and needs suggestions and guidance. The user is watching the ` +
    `roadmap and inbox update live in a web UI, so apply changes with tools as you go.\n\n` +
    `${TREE_EXPLANATION}\n\n` +
    `Follow this workflow:\n\n` +
    `**Phase 1: Goal Clarification.** Call get_project_state first to see where things stand. If the goal ` +
    `is empty or vague, refine it to be specific, measurable, achievable, and relevant by asking clarifying ` +
    `questions - one question at a time. Focus on WHAT and WHY, not HOW. Do not ask about steps, tools, ` +
    `materials, or anything easily searched for. Offer suggestions or examples when appropriate. Keep the ` +
    `goal current with set_goal as your understanding improves - the measures, deadlines and constraints ` +
    `you uncover go in the goal's description, not its name.\n\n` +
    `**Phase 2: Task Identification.** After a few exchanges, transition to identifying tasks. Proactively ` +
    `suggest tasks comprehensively, including ones the user may not think of (preparation, obtaining ` +
    `materials or tools, prerequisite skills, cleanup). Explain WHY each task is necessary, especially ` +
    `non-obvious ones. Exclude tasks about finding instructions or recipes. Record candidate tasks in the ` +
    `inbox with add_inbox_idea so the user can review them, each phrased as a short imperative action ` +
    `since an idea's text becomes the task name when it is promoted; do not re-add ideas already present ` +
    `in the inbox or covered by existing tasks.\n\n` +
    `**Phase 3: Plan Structuring.** When the user is ready to organize (or asks for a plan), turn agreed ` +
    `ideas into tasks (promote_inbox_idea or add_task), each with a short imperative name and a ` +
    `description that captures the specifics from the conversation. If a plan level grows beyond about ${MAX_TOP_LEVEL_TASKS} tasks, group related tasks ` +
    `into subgoals: create a task per subgoal, give it a subplan (create_subplan), and add the related ` +
    `tasks inside it via add_task with parentId. Then add dependencies with add_dependency - within each ` +
    `subplan and at the top level - so the roadmap forms a directed acyclic graph; use "${GOAL_ID}" as the ` +
    `target for tasks that feed the goal directly. Verify the result with get_roadmap and get_next_tasks.\n\n` +
    `${NAMING_GUIDANCE}\n\n` +
    `**Tone:** Non-conversational. Do not parrot the user. Ask exactly one question per turn while ` +
    `clarifying. Saving, opening, and creating projects is user-only in the web UI - never attempt it.`;

const textResult = (value: unknown) => {
    return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
};

const errorResult = (error: unknown) => {
    return { content: [{ type: "text" as const, text: String(error) }], isError: true };
};

/**
 * Builds the MCP server through which external chat applications (e.g. Claude
 * Desktop) collaborate on the project plan. All mutations go through the same
 * ProjectStore as the REST API, so every connected web UI is pushed the change
 * as it happens.
 */
const createMcpServer = (store: ProjectStore): McpServer => {
    const server = new McpServer({ name: "blossom", version: "1.0.0" }, { instructions: SERVER_INSTRUCTIONS });

    // Attributes every change made through MCP, so undo can tell the work done
    // here apart from whatever people are doing in the web UI.
    const asMcp = <T>(fn: () => T): T => store.runAs(MCP_AUTHOR, fn);

    // Invocable prompts for clients that surface them (e.g. Claude Desktop);
    // they restate the workflow for users whose client ignores instructions.
    server.registerPrompt(
        "plan-project",
        {
            title: "Plan a project",
            description: "Start or continue the guided goal-clarification and task-ideation workflow.",
        },
        () => ({
            messages: [
                {
                    role: "user" as const,
                    content: {
                        type: "text" as const,
                        text:
                            `Help me plan my project. ${SERVER_INSTRUCTIONS}\n\n` +
                            `Begin by calling get_project_state and either asking your first clarifying ` +
                            `question or, if the goal is already clear, continuing with task identification.`,
                    },
                },
            ],
        }),
    );

    server.registerPrompt(
        "generate-plan",
        {
            title: "Generate the roadmap",
            description: "Organize the current goal, tasks, and inbox ideas into a dependency-ordered roadmap.",
        },
        () => ({
            messages: [
                {
                    role: "user" as const,
                    content: {
                        type: "text" as const,
                        text:
                            `Organize my project into a roadmap now. ${TREE_EXPLANATION}\n\n` +
                            `${NAMING_GUIDANCE}\n\n` +
                            `Call get_project_state, then: (1) promote agreed inbox ideas into tasks, each ` +
                            `with a short imperative name and a description capturing conversation specifics; (2) if a plan level has more than ` +
                            `about ${MAX_TOP_LEVEL_TASKS} tasks, group related tasks into subgoal tasks with ` +
                            `subplans; (3) add dependencies within each subplan and at the top level so the ` +
                            `roadmap forms a DAG, using "${GOAL_ID}" as the target for tasks feeding the goal ` +
                            `directly; (4) verify with get_roadmap and get_next_tasks and summarize the result.`,
                    },
                },
            ],
        }),
    );

    // ----------------------------------------------------------------- reads

    server.registerTool(
        "get_project_state",
        {
            description:
                `Get the full current project state: version counter, active project name, the complete goal ` +
                `tree and the inbox of raw ideas. ${TREE_EXPLANATION}`,
        },
        async () => textResult(store.getState()),
    );

    server.registerTool(
        "get_roadmap",
        {
            description:
                `Get a single level of the plan: the tasks and dependencies directly inside one task's plan. ` +
                `Defaults to the root goal. Tasks with hasSubplan=true contain a nested plan you can inspect by ` +
                `calling this tool with their id. ${TREE_EXPLANATION}`,
            inputSchema: {
                taskId: z.string().optional().describe(`Task id whose plan to inspect (defaults to "${GOAL_ID}")`),
            },
        },
        async ({ taskId }) => {
            const task = store.findTask(taskId ?? GOAL_ID);
            if (!task) {
                return errorResult(`Task not found: ${taskId}`);
            }
            return textResult({
                id: task.id,
                name: task.name,
                description: task.description,
                completionState: task.completionState,
                tasks: (task.plan?.tasksList ?? []).map((t: Task) => ({
                    id: t.id,
                    name: t.name,
                    description: t.description,
                    completionState: t.completionState,
                    hasSubplan: t.plan !== null,
                })),
                dependencies: task.plan?.dependenciesList ?? [],
            });
        },
    );

    server.registerTool(
        "get_next_tasks",
        {
            description:
                "List the tasks that are currently actionable: incomplete leaf tasks whose dependencies are " +
                "all complete.",
        },
        async () => textResult(store.getNextTasks()),
    );

    // ------------------------------------------------------------- mutations

    server.registerTool(
        "set_goal",
        {
            description:
                `Set the project goal's name and optionally its description. The name is a label on a ` +
                `roadmap node: start it with an imperative verb, keep it under about ${MAX_NAME_CHARS} ` +
                `characters, and put the measures, deadlines and constraints in the description.`,
            inputSchema: {
                name: z
                    .string()
                    .describe(
                        `Short goal label - starts with an imperative verb and reads as one actionable ` +
                            `item, at most about ${MAX_NAME_CHARS} characters, not a noun phrase or a sentence`,
                    ),
                description: z
                    .string()
                    .optional()
                    .describe("Full goal detail: specifics, measures, deadlines, constraints and rationale"),
            },
        },
        async ({ name, description }) => {
            asMcp(() => store.setGoal(name, description));
            return textResult({ version: store.getVersion() });
        },
    );

    server.registerTool(
        "add_task",
        {
            description:
                `Add a new task. By default it is added to the root goal's plan; pass parentId to add it ` +
                `inside another task's subplan. Returns the created task's id. The name is a label on a ` +
                `roadmap node: start it with an imperative verb so it reads as one actionable item, keep ` +
                `it under about ${MAX_NAME_CHARS} characters, and put the detail in the description.`,
            inputSchema: {
                name: z
                    .string()
                    .describe(
                        `Short task label - starts with an imperative verb and reads as one actionable ` +
                            `item, at most about ${MAX_NAME_CHARS} characters, not a noun phrase or a sentence`,
                    ),
                description: z
                    .string()
                    .optional()
                    .describe("Full task detail: specifics, acceptance criteria and why it is necessary"),
                parentId: z.string().optional().describe(`Parent task id (defaults to "${GOAL_ID}")`),
            },
        },
        async ({ name, description, parentId }) => {
            try {
                const task = asMcp(() => store.addTask(parentId ?? GOAL_ID, name, description));
                return textResult({ taskId: task.id, version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "update_task",
        {
            description:
                `Update a task's name and/or description. Use this to rewrite a name as a short imperative ` +
                `action - for example after promoting an inbox idea whose text reads as a full sentence or a ` +
                `bare noun - moving the detail into the description.`,
            inputSchema: {
                taskId: z.string(),
                name: z
                    .string()
                    .optional()
                    .describe(
                        `Short task label - starts with an imperative verb and reads as one actionable ` +
                            `item, at most about ${MAX_NAME_CHARS} characters, not a noun phrase or a sentence`,
                    ),
                description: z
                    .string()
                    .optional()
                    .describe("Full task detail: specifics, acceptance criteria and why it is necessary"),
            },
        },
        async ({ taskId, name, description }) => {
            try {
                asMcp(() => store.updateTask(taskId, { name, description }));
                return textResult({ version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "set_task_completion",
        {
            description:
                "Mark a task complete or incomplete. Parent tasks automatically become complete when all " +
                "their subtasks are complete.",
            inputSchema: {
                taskId: z.string(),
                completed: z.boolean(),
            },
        },
        async ({ taskId, completed }) => {
            try {
                asMcp(() => store.setTaskCompletion(taskId, completed));
                return textResult({ version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "delete_task",
        {
            description: "Delete a task (and its entire subplan) plus any dependencies referencing it.",
            inputSchema: { taskId: z.string() },
        },
        async ({ taskId }) => {
            try {
                asMcp(() => store.removeTask(taskId));
                return textResult({ version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "create_subplan",
        {
            description: "Give a task an empty subplan so subtasks can be added inside it with add_task(parentId).",
            inputSchema: { taskId: z.string() },
        },
        async ({ taskId }) => {
            try {
                asMcp(() => store.createSubplan(taskId));
                return textResult({ version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "add_dependency",
        {
            description:
                `Add a dependency: the source task must finish before the target can start. Source and target ` +
                `must be siblings in the same plan, or the target may be "${GOAL_ID}" to feed the plan's goal. ` +
                `Cycles are rejected.`,
            inputSchema: {
                sourceId: z.string(),
                targetId: z.string(),
            },
        },
        async ({ sourceId, targetId }) => {
            try {
                asMcp(() => store.addDependency(sourceId, targetId));
                return textResult({ version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "remove_dependency",
        {
            description: "Remove the dependency from sourceId to targetId.",
            inputSchema: {
                sourceId: z.string(),
                targetId: z.string(),
            },
        },
        async ({ sourceId, targetId }) => {
            try {
                asMcp(() => store.removeDependency(sourceId, targetId));
                return textResult({ version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "add_inbox_idea",
        {
            description:
                "Add a raw idea string to the project inbox. Ideas are unstructured candidate tasks that can " +
                "later be promoted to real tasks.",
            inputSchema: { text: z.string() },
        },
        async ({ text }) => {
            asMcp(() => store.addIdea(text));
            return textResult({ version: store.getVersion() });
        },
    );

    server.registerTool(
        "remove_inbox_idea",
        {
            description: "Remove the inbox idea at the given zero-based index.",
            inputSchema: { index: z.number().int() },
        },
        async ({ index }) => {
            try {
                asMcp(() => store.removeIdea(index));
                return textResult({ version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "promote_inbox_idea",
        {
            description:
                `Convert the inbox idea at the given zero-based index into a task (removing it from the inbox). ` +
                `Pass parentId to place it inside a task's subplan; defaults to the root goal's plan. The idea ` +
                `text becomes the task name, so unless it already reads as a short imperative action, follow ` +
                `up with update_task to rewrite it and move the detail into the description.`,
            inputSchema: {
                index: z.number().int(),
                parentId: z.string().optional(),
            },
        },
        async ({ index, parentId }) => {
            try {
                const task = asMcp(() => store.promoteIdea(index, parentId));
                return textResult({ taskId: task.id, version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "undo_last_change",
        {
            description:
                "Undo the most recent change to the project, provided that change was made through this MCP " +
                "server. If somebody working in the web UI has changed the project since, the undo is " +
                "refused, so their work is never silently reverted.",
        },
        async () => {
            try {
                return textResult({ undone: asMcp(() => store.undo()), version: store.getVersion() });
            } catch (error) {
                if (error instanceof UndoBlockedError) {
                    return textResult({ undone: false, reason: error.message, version: store.getVersion() });
                }
                return errorResult(error);
            }
        },
    );

    // Project management — listing, saving, opening, and creating projects — is
    // deliberately NOT exposed over MCP; only the user can do that, from the
    // frontend. MCP therefore only ever touches
    // the active project held in the store.

    return server;
};

export { createMcpServer };
