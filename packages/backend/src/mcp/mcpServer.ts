import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GOAL_ID, MCP_AUTHOR, Task } from "@blossom/common";
import { ProjectStore, UndoBlockedError } from "../state/projectStore";
import { checkName, checkNames, MAX_NAME_CHARS } from "./nameRules";

const TREE_EXPLANATION =
    `The project is a recursive tree: the root goal has a plan containing tasks, and any task may itself ` +
    `contain a nested plan of subtasks. Tasks are addressed by their id. The special id "${GOAL_ID}" refers ` +
    `to the root goal; dependencies inside a plan may target "${GOAL_ID}" or the id of the task that owns ` +
    `the plan to indicate the edge feeds directly into that plan's goal. A dependency {source, target} means ` +
    `the source task must finish before the target can start.`;

// How many top-level tasks a plan should hold before grouping into subgoals.
const MAX_TOP_LEVEL_TASKS = 8;

// One line naming every tool, so a client can see the whole surface without a
// discovery round-trip per tool.
const TOOLS_SUMMARY =
    `**Tools:** Read with get_project_state (the whole tree and inbox in one call), get_roadmap (one ` +
    `plan level), and get_next_tasks (what is currently actionable). Write with set_goal; add_task, ` +
    `add_tasks, update_task, move_task, set_task_completion, delete_task, create_subplan; ` +
    `add_dependency, add_dependencies, remove_dependency; add_inbox_idea, add_inbox_ideas, ` +
    `remove_inbox_idea, promote_inbox_idea, promote_inbox_ideas; undo_last_change.`;

// A dependency on a subgoal constrains everything inside it, which is where
// over-constrained roadmaps come from, so the inheritance is spelled out.
const DEPENDENCY_GUIDANCE =
    `**Dependencies between subgoals:** A dependency between two subgoal tasks asserts that every task ` +
    `inside the target waits for every task inside the source. Before adding an edge between two ` +
    `subgoals, check each child of the target: if any child could genuinely start earlier, the edge ` +
    `belongs on the specific children that need it - or that child belongs at a different level. Prefer ` +
    `leaf-to-leaf edges over subgoal-to-subgoal edges whenever only some of the target's children ` +
    `actually depend on the source.`;

// Framed as a falsifiable test: a get_next_tasks result only reveals an
// over-constrained plan to a reader who predicted what should be in it.
const VERIFICATION_GUIDANCE =
    `**Verifying the plan:** Review the whole tree with a single get_project_state call. Then test the ` +
    `dependencies: list the tasks you would expect the user could genuinely start today, and call ` +
    `get_next_tasks. Anything on your list that is missing from the result is over-constrained - find ` +
    `the too-coarse edge blocking it and move that edge onto the specific children that need it.`;

// The server refuses names it cannot render and warns about the rest, so this
// says what a good name looks like and leaves the checking to the tools.
const NAMING_GUIDANCE =
    `**Naming:** A name is a label on a roadmap node: one short imperative action of at most ` +
    `${MAX_NAME_CHARS} characters - "Sign software engineering offer", "Book venue" - and longer ones are ` +
    `refused. Everything else belongs in the description, which can be as long as needed: the specifics, ` +
    `measures, deadlines, constraints, acceptance criteria and rationale from the conversation.`;

// Sent as server instructions on connect, so any MCP client steers the LLM
// through the same goal-clarification -> ideation -> planning flow. The user
// watches the roadmap and inbox update live in the web UI, so changes should be
// made through tools as the conversation progresses, not batched at the end.
const SERVER_INSTRUCTIONS =
    `You are a project planning assistant helping the user define a goal and build a project roadmap. ` +
    `Assume the user may lack experience and needs suggestions and guidance. The user is watching the ` +
    `roadmap and inbox update live in a web UI, so apply changes with tools as you go.\n\n` +
    `${TREE_EXPLANATION}\n\n` +
    `${TOOLS_SUMMARY}\n\n` +
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
    `non-obvious ones. Exclude tasks about finding instructions or recipes. Park candidates in the inbox ` +
    `with add_inbox_idea or add_inbox_ideas when you want the user to review or prune them before they ` +
    `reach the roadmap; go straight to add_task or add_tasks when the user has already agreed the scope, ` +
    `or has handed you a specification to work from.\n\n` +
    `**Phase 3: Plan Structuring.** When the user is ready to organize (or asks for a plan), turn agreed ` +
    `ideas into tasks (promote_inbox_idea or add_task), each with a short imperative name and a ` +
    `description that captures the specifics from the conversation. If a plan level grows beyond about ` +
    `${MAX_TOP_LEVEL_TASKS} tasks, group related tasks into subgoals: create a task per subgoal with a ` +
    `subplan (add_task with withSubplan: true), and add the related tasks inside it via add_task with ` +
    `parentId. Then add dependencies with add_dependency or add_dependencies - within each subplan and ` +
    `at the top level - so the roadmap forms a directed acyclic graph; use "${GOAL_ID}" as the target ` +
    `for tasks that feed the goal directly.\n\n` +
    `${DEPENDENCY_GUIDANCE}\n\n` +
    `${VERIFICATION_GUIDANCE}\n\n` +
    `${NAMING_GUIDANCE}\n\n` +
    `**Checking your work:** Every tool that changes something echoes back what it changed, names and all. ` +
    `Read those echoes: they are how you catch a task built from the wrong text before the rest of the ` +
    `roadmap is hung off it.\n\n` +
    `**Tone:** Non-conversational. Do not parrot the user. Ask exactly one question per turn while ` +
    `clarifying. Saving, opening, and creating projects is user-only in the web UI - never attempt it.`;

const textResult = (value: unknown) => {
    return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
};

const errorResult = (error: unknown) => {
    return { content: [{ type: "text" as const, text: String(error) }], isError: true };
};

// Warnings ride along with a successful write. An empty list is left out so a
// clean call reads as cleanly as it went.
const withWarnings = <T extends object>(value: T, warnings: string[]) => {
    return warnings.length > 0 ? { ...value, warnings } : value;
};

// How two idea texts are compared when deciding whether one repeats the other.
const normalizeText = (text: string): string => text.trim().replace(/\s+/g, " ").toLowerCase();

const NAME_PARAM = z
    .string()
    .describe(
        `Short label - one imperative action of at most ${MAX_NAME_CHARS} characters on a single line, ` +
            `not a noun phrase, a question or a sentence. Longer names are refused.`,
    );

const DESCRIPTION_PARAM = z
    .string()
    .optional()
    .describe("Full detail: specifics, acceptance criteria, measures, deadlines and why it is necessary");

const IDEA_ID_PARAM = z
    .string()
    .optional()
    .describe("Id of the inbox idea, as returned by add_inbox_idea and get_project_state");

const IDEA_INDEX_PARAM = z
    .number()
    .int()
    .optional()
    .describe(
        "DEPRECATED - pass ideaId instead. Zero-based position in the newest-first inbox, which every " +
            "other write to the inbox renumbers. Ignored when ideaId is given.",
    );

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

    // Invocable prompts for clients that surface them (e.g. Claude Desktop).
    // Each carries a condensed statement of the workflow, sized so a client
    // that also applies the server instructions pays for the workflow text
    // once, while one that does not still gets the shape of the flow.
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
                            `Help me plan my project. Clarify the goal first, asking one question per turn ` +
                            `about WHAT and WHY and keeping it current with set_goal; then suggest tasks ` +
                            `comprehensively, parking candidates in the inbox for my review; then structure ` +
                            `them into a dependency-ordered roadmap. Begin by calling get_project_state and ` +
                            `either asking your first clarifying question or, if the goal is already clear, ` +
                            `continuing with task identification.`,
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
                            `Organize my project into a roadmap now. Call get_project_state, then: (1) turn ` +
                            `agreed inbox ideas into tasks with promote_inbox_ideas, giving each its final ` +
                            `name - one imperative action of at most ${MAX_NAME_CHARS} characters - and a ` +
                            `description capturing conversation specifics; (2) if a plan level has more than ` +
                            `about ${MAX_TOP_LEVEL_TASKS} tasks, group related tasks into subgoal tasks with ` +
                            `subplans (add_task with withSubplan: true); (3) add dependencies within each ` +
                            `subplan and at the top level so the roadmap forms a DAG, using "${GOAL_ID}" as ` +
                            `the target for tasks feeding the goal directly and putting edges on the specific ` +
                            `children that need them when only some of a subgoal's children depend on a ` +
                            `source; (4) verify: list the tasks I could genuinely start today, call ` +
                            `get_next_tasks, reconcile the two, then summarize the roadmap from ` +
                            `get_project_state.`,
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
                `tree and the inbox of raw ideas. Each inbox entry is {id, text}; address ideas by that id. ` +
                `The inbox is ordered newest first. ${TREE_EXPLANATION}`,
        },
        async () => textResult(store.getState()),
    );

    server.registerTool(
        "get_roadmap",
        {
            description:
                `Get a single level of the plan: the tasks and dependencies directly inside one task's plan, ` +
                `in the order they were added. Defaults to the root goal. Tasks with hasSubplan=true contain ` +
                `a nested plan you can inspect by calling this tool with their id. ${TREE_EXPLANATION}`,
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
                `Set the project goal's name and optionally its description. Returns the goal as it now ` +
                `stands. The name is a label on a roadmap node; the measures, deadlines and constraints go ` +
                `in the description.`,
            inputSchema: {
                name: NAME_PARAM,
                description: DESCRIPTION_PARAM,
            },
        },
        async ({ name, description }) => {
            try {
                // The goal names the whole project, so spanning several
                // outcomes is its job and earns no "and" warning.
                const warnings = checkName(name, { subgoal: true });
                asMcp(() => store.setGoal(name, description));
                const goal = store.findTask(GOAL_ID)!;
                return textResult(
                    withWarnings(
                        {
                            taskId: GOAL_ID,
                            name: goal.name,
                            description: goal.description,
                            version: store.getVersion(),
                        },
                        warnings,
                    ),
                );
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "add_task",
        {
            description:
                `Add a new task. By default it is added to the root goal's plan; pass parentId to add it ` +
                `inside another task's subplan, and withSubplan: true to create the task with an empty ` +
                `subplan of its own, ready for children. Returns the created task, so you can check the ` +
                `name that landed is the one you meant.`,
            inputSchema: {
                name: NAME_PARAM,
                description: DESCRIPTION_PARAM,
                parentId: z.string().optional().describe(`Parent task id (defaults to "${GOAL_ID}")`),
                withSubplan: z
                    .boolean()
                    .optional()
                    .describe("Create the task with an empty subplan, making it a subgoal container"),
            },
        },
        async ({ name, description, parentId, withSubplan }) => {
            try {
                const warnings = checkName(name, { subgoal: withSubplan ?? false });
                const task = asMcp(() => store.addTask(parentId ?? GOAL_ID, name, description, withSubplan));
                return textResult(
                    withWarnings(
                        {
                            taskId: task.id,
                            name: task.name,
                            parentId: parentId ?? GOAL_ID,
                            hasSubplan: task.plan !== null,
                            version: store.getVersion(),
                        },
                        warnings,
                    ),
                );
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "add_tasks",
        {
            description:
                `Add several tasks in one call and one change. Every parent and every name is checked before ` +
                `anything is written, so the batch lands whole or not at all. The returned tasks are in the ` +
                `order supplied, so you can pair each id with the task you asked for.`,
            inputSchema: {
                tasks: z
                    .array(
                        z.object({
                            name: NAME_PARAM,
                            description: DESCRIPTION_PARAM,
                            parentId: z.string().optional().describe(`Parent task id (defaults to "${GOAL_ID}")`),
                            withSubplan: z
                                .boolean()
                                .optional()
                                .describe("Create the task with an empty subplan, making it a subgoal container"),
                        }),
                    )
                    .describe("Tasks to add, in the order they should appear in their plans"),
            },
        },
        async ({ tasks }) => {
            try {
                const warnings = tasks.flatMap((draft) =>
                    checkName(draft.name, { subgoal: draft.withSubplan ?? false }),
                );
                const added = asMcp(() => store.addTasks(tasks));
                return textResult(
                    withWarnings(
                        {
                            tasks: added.map((task, position) => ({
                                taskId: task.id,
                                name: task.name,
                                parentId: tasks[position].parentId ?? GOAL_ID,
                                hasSubplan: task.plan !== null,
                            })),
                            version: store.getVersion(),
                        },
                        warnings,
                    ),
                );
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "update_task",
        {
            description: "Update a task's name and/or description. Returns the task as it now stands.",
            inputSchema: {
                taskId: z.string(),
                name: NAME_PARAM.optional(),
                description: DESCRIPTION_PARAM,
            },
        },
        async ({ taskId, name, description }) => {
            try {
                // A task that holds a subplan is a subgoal, so its name gets
                // the subgoal reading when the "and" heuristic is applied.
                const subgoal = (store.findTask(taskId)?.plan ?? null) !== null;
                const warnings = name === undefined ? [] : checkName(name, { subgoal });
                asMcp(() => store.updateTask(taskId, { name, description }));
                const task = store.findTask(taskId)!;
                return textResult(
                    withWarnings(
                        {
                            taskId: task.id,
                            name: task.name,
                            description: task.description,
                            version: store.getVersion(),
                        },
                        warnings,
                    ),
                );
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "move_task",
        {
            description:
                `Move a task, and whatever subplan it carries, into another task's plan. Pass "${GOAL_ID}" ` +
                `as newParentId to move it to the top level. Dependencies in the plan it leaves are dropped, ` +
                `since they order it against tasks it is no longer a sibling of. A task cannot be moved ` +
                `inside itself or anything it contains.`,
            inputSchema: {
                taskId: z.string(),
                newParentId: z.string().describe(`Id of the task whose plan it moves into, or "${GOAL_ID}"`),
            },
        },
        async ({ taskId, newParentId }) => {
            try {
                const task = asMcp(() => store.moveTask(taskId, newParentId));
                return textResult({
                    taskId: task.id,
                    name: task.name,
                    parentId: newParentId,
                    version: store.getVersion(),
                });
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
                const task = store.findTask(taskId)!;
                return textResult({
                    taskId: task.id,
                    name: task.name,
                    completionState: task.completionState,
                    version: store.getVersion(),
                });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "delete_task",
        {
            description:
                "Delete a task (and its entire subplan) plus any dependencies referencing it. Returns the " +
                "task that was deleted, so you can confirm it was the one you meant.",
            inputSchema: { taskId: z.string() },
        },
        async ({ taskId }) => {
            try {
                const doomed = store.findTask(taskId);
                const name = doomed?.name;
                asMcp(() => store.removeTask(taskId));
                return textResult({ taskId, name, deleted: true, version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "create_subplan",
        {
            description:
                `Give an existing task an empty subplan so subtasks can be added inside it with ` +
                `add_task(parentId). A task and its subplan can also be created in one step: pass ` +
                `withSubplan: true to add_task or add_tasks.`,
            inputSchema: { taskId: z.string() },
        },
        async ({ taskId }) => {
            try {
                asMcp(() => store.createSubplan(taskId));
                const task = store.findTask(taskId)!;
                return textResult({ taskId: task.id, name: task.name, version: store.getVersion() });
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
                `must be siblings in the same plan; the target may instead be "${GOAL_ID}", or the id of the ` +
                `task that owns the plan, to feed that plan's goal. Cycles are rejected. Returns the ids as ` +
                `you addressed them with both ends named, so you can check the edge that landed is the edge ` +
                `you meant; targetName names the task a goal-feeding edge resolved to.`,
            inputSchema: {
                sourceId: z.string(),
                targetId: z
                    .string()
                    .describe(`Sibling task id, the containing task's id, or "${GOAL_ID}" for the root goal`),
            },
        },
        async ({ sourceId, targetId }) => {
            try {
                const edge = asMcp(() => store.addDependency(sourceId, targetId));
                return textResult({ ...edge, version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "add_dependencies",
        {
            description:
                `Add several dependencies in one call and one change. The whole batch is checked for cycles ` +
                `together before anything is written: if one edge would close a loop, nothing is applied and ` +
                `the error names that edge and the path it closes. The returned edges are in the order ` +
                `supplied, ids as you addressed them, both ends named.`,
            inputSchema: {
                dependencies: z
                    .array(
                        z.object({
                            sourceId: z.string(),
                            targetId: z
                                .string()
                                .describe(
                                    `Sibling task id, the containing task's id, or "${GOAL_ID}" for the root goal`,
                                ),
                        }),
                    )
                    .describe("Dependencies to add, each {sourceId, targetId}"),
            },
        },
        async ({ dependencies }) => {
            try {
                const added = asMcp(() => store.addDependencies(dependencies));
                return textResult({ dependencies: added, version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "remove_dependency",
        {
            description: "Remove the dependency from sourceId to targetId. Returns the edge that was removed.",
            inputSchema: {
                sourceId: z.string(),
                targetId: z.string(),
            },
        },
        async ({ sourceId, targetId }) => {
            try {
                const edge = asMcp(() => store.removeDependency(sourceId, targetId));
                return textResult({ ...edge, removed: true, version: store.getVersion() });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "add_inbox_idea",
        {
            description:
                "Add a raw idea to the project inbox, where the user can review it before it reaches the " +
                "roadmap. Returns the idea's id; address it by that id from then on. An idea whose text " +
                "already sits in the inbox is not added twice - the existing id comes back with " +
                "duplicate: true.",
            inputSchema: { text: z.string() },
        },
        async ({ text }) => {
            const existing = store.findIdeaByText(text);
            if (existing) {
                return textResult({
                    ideaId: existing.id,
                    text: existing.text,
                    duplicate: true,
                    version: store.getVersion(),
                });
            }
            const idea = asMcp(() => store.addIdea(text));
            return textResult({ ideaId: idea.id, text: idea.text, duplicate: false, version: store.getVersion() });
        },
    );

    server.registerTool(
        "add_inbox_ideas",
        {
            description:
                "Add several raw ideas to the inbox in one call and one change. Ideas whose text is already " +
                "in the inbox come back with their existing id and duplicate: true. The returned ideas are " +
                "in the order supplied, so you can pair each id with the text you sent.",
            inputSchema: {
                texts: z.array(z.string()).describe("Idea texts, in the order they were thought of"),
            },
        },
        async ({ texts }) => {
            // Duplicates are settled against the inbox and against the batch's
            // own earlier entries, so sending the same text twice in one call
            // yields one idea, exactly as sending it in two calls would.
            const results = texts.map((text) => ({ ideaId: undefined as string | undefined, text, duplicate: false }));
            const echoesPosition: (number | undefined)[] = texts.map((): number | undefined => undefined);
            const freshPositions: number[] = [];
            const claimed = new Map<string, number>();

            texts.forEach((text, position) => {
                const existing = store.findIdeaByText(text);
                if (existing) {
                    results[position] = { ideaId: existing.id, text: existing.text, duplicate: true };
                    return;
                }
                const key = normalizeText(text);
                const firstOccurrence = key === "" ? undefined : claimed.get(key);
                if (firstOccurrence !== undefined) {
                    results[position].duplicate = true;
                    echoesPosition[position] = firstOccurrence;
                    return;
                }
                if (key !== "") {
                    claimed.set(key, position);
                }
                freshPositions.push(position);
            });

            const added = asMcp(() => store.addIdeas(freshPositions.map((position) => texts[position])));
            added.forEach((idea, order) => {
                results[freshPositions[order]].ideaId = idea.id;
            });
            echoesPosition.forEach((firstOccurrence, position) => {
                if (firstOccurrence !== undefined) {
                    results[position].ideaId = results[firstOccurrence].ideaId;
                }
            });

            return textResult({ ideas: results, version: store.getVersion() });
        },
    );

    server.registerTool(
        "remove_inbox_idea",
        {
            description: "Remove an inbox idea. Returns the idea that was removed, so you can confirm which it was.",
            inputSchema: {
                ideaId: IDEA_ID_PARAM,
                index: IDEA_INDEX_PARAM,
            },
        },
        async ({ ideaId, index }) => {
            try {
                const removed = asMcp(() => store.removeIdea({ ideaId, index }));
                return textResult({
                    ideaId: removed.id,
                    text: removed.text,
                    removed: true,
                    version: store.getVersion(),
                });
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "promote_inbox_idea",
        {
            description:
                `Convert an inbox idea into a task, removing it from the inbox. Pass parentId to place it ` +
                `inside a task's subplan; defaults to the root goal's plan. Give the task its final name and ` +
                `description here: name replaces the idea's text, which is used only when no name is given. ` +
                `Returns the task that was created, so you can check it was built from the idea you meant.`,
            inputSchema: {
                ideaId: IDEA_ID_PARAM,
                index: IDEA_INDEX_PARAM,
                parentId: z.string().optional().describe(`Parent task id (defaults to "${GOAL_ID}")`),
                name: NAME_PARAM.optional().describe(
                    `Final task name. Defaults to the idea's text, which is often not a usable name. ` +
                        `One imperative action of at most ${MAX_NAME_CHARS} characters.`,
                ),
                description: DESCRIPTION_PARAM,
            },
        },
        async ({ ideaId, index, parentId, name, description }) => {
            try {
                const warnings = checkNames([name]);
                const task = asMcp(() =>
                    store.promoteIdea({ ideaId, index }, parentId ?? GOAL_ID, undefined, { name, description }),
                );
                return textResult(
                    withWarnings(
                        {
                            taskId: task.id,
                            name: task.name,
                            parentId: parentId ?? GOAL_ID,
                            version: store.getVersion(),
                        },
                        warnings,
                    ),
                );
            } catch (error) {
                return errorResult(error);
            }
        },
    );

    server.registerTool(
        "promote_inbox_ideas",
        {
            description:
                `Convert several inbox ideas into tasks in one call and one change. Every idea and parent is ` +
                `resolved before anything moves, so the batch lands whole or not at all. The returned tasks ` +
                `are in the order supplied, so you can pair each id with the idea you asked for.`,
            inputSchema: {
                promotions: z
                    .array(
                        z.object({
                            ideaId: IDEA_ID_PARAM,
                            index: IDEA_INDEX_PARAM,
                            parentId: z.string().optional().describe(`Parent task id (defaults to "${GOAL_ID}")`),
                            name: NAME_PARAM.optional().describe("Final task name; defaults to the idea's text"),
                            description: DESCRIPTION_PARAM,
                        }),
                    )
                    .describe("Ideas to promote, each naming one idea by ideaId"),
            },
        },
        async ({ promotions }) => {
            try {
                const warnings = checkNames(promotions.map((promotion) => promotion.name));
                const tasks = asMcp(() => store.promoteIdeas(promotions));
                return textResult(
                    withWarnings(
                        {
                            tasks: tasks.map((task, position) => ({
                                taskId: task.id,
                                name: task.name,
                                parentId: promotions[position].parentId ?? GOAL_ID,
                            })),
                            version: store.getVersion(),
                        },
                        warnings,
                    ),
                );
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
