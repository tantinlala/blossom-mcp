import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GOAL_ID, Task } from "@blossom/common";
import { createMcpServer } from "./mcpServer";
import { ProjectStore } from "../state/projectStore";

const EXPECTED_TOOLS = [
    "get_project_state",
    "get_roadmap",
    "get_next_tasks",
    "set_goal",
    "add_task",
    "add_tasks",
    "update_task",
    "move_task",
    "move_tasks",
    "set_task_completion",
    "delete_task",
    "delete_tasks",
    "create_subplan",
    "add_dependency",
    "add_dependencies",
    "remove_dependency",
    "add_inbox_idea",
    "add_inbox_ideas",
    "remove_inbox_idea",
    "remove_inbox_ideas",
    "promote_inbox_idea",
    "promote_inbox_ideas",
    "undo_last_change",
];

// Every tool that changes the project. Each has to hand back what it changed,
// so a caller can tell a write that did what it meant from one that did not.
const MUTATING_TOOLS = EXPECTED_TOOLS.filter((name) => !name.startsWith("get_"));

describe("mcpServer", () => {
    let store: ProjectStore;
    let server: McpServer;
    let client: Client;

    const connect = async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        server = createMcpServer(store);
        client = new Client({ name: "test", version: "1.0" });
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    };

    const callTool = async (name: string, args: Record<string, unknown> = {}) => {
        return (await client.callTool({ name, arguments: args })) as any;
    };

    const parseResult = (result: any) => JSON.parse(result.content[0].text);

    beforeEach(() => {
        store = new ProjectStore();
    });

    afterEach(async () => {
        await client.close();
        await server.close();
    });

    it("should list every tool", async () => {
        await connect();

        const result = await client.listTools();

        const toolNames = result.tools.map((tool) => tool.name);
        expect(toolNames).toHaveLength(EXPECTED_TOOLS.length);
        expect(toolNames.sort()).toEqual([...EXPECTED_TOOLS].sort());
    });

    it("should provide workflow instructions on connect", async () => {
        await connect();

        const instructions = client.getInstructions();

        expect(instructions).toContain("Phase 1: Goal Clarification");
        expect(instructions).toContain("Phase 2: Task Identification");
        expect(instructions).toContain("Phase 3: Plan Structuring");
        expect(instructions).toContain("user-only");
    });

    it("should leave the move into plan structuring to the user", async () => {
        await connect();

        const instructions = client.getInstructions();

        expect(instructions).toContain("The user decides when this phase starts");
        expect(instructions).toContain("wait for their answer");
    });

    it("should steer names to short imperative actions with detail in descriptions", async () => {
        await connect();

        const instructions = client.getInstructions();

        expect(instructions).toContain("**Naming:**");
        expect(instructions).toContain("one short imperative action");
        expect(instructions).toContain("description");
    });

    it("should offer the inbox as a review step, not a required one", async () => {
        await connect();

        const instructions = client.getInstructions();

        expect(instructions).toContain("when you want the user to review or prune them");
        expect(instructions).toContain("go straight to add_task");
    });

    it("should keep the inbox current by clearing ideas the conversation has made obsolete", async () => {
        await connect();

        const instructions = client.getInstructions();

        expect(instructions).toContain("read the inbox back");
        expect(instructions).toContain("obsolete or redundant");
        expect(instructions).toContain("remove_inbox_ideas");
    });

    it("should ask exactly one question per turn through both conversational phases", async () => {
        await connect();

        const instructions = client.getInstructions();

        expect(instructions).toContain("End every turn of goal clarification and task identification with");
        expect(instructions).toContain("exactly one question");
    });

    it("should tell the caller to read what the write tools echo back", async () => {
        await connect();

        const instructions = client.getInstructions();

        expect(instructions).toContain("echoes back what it changed");
    });

    it("should list every tool in the instructions", async () => {
        await connect();

        const instructions = client.getInstructions()!;

        expect(instructions).toContain("**Tools:**");
        for (const toolName of EXPECTED_TOOLS) {
            expect(instructions).toContain(toolName);
        }
    });

    it("should explain that a dependency between subgoals constrains everything inside them", async () => {
        await connect();

        const instructions = client.getInstructions();

        expect(instructions).toContain("**Dependencies and subplans:**");
        expect(instructions).toContain("every task inside the target waits for every task inside the source");
        expect(instructions).toContain("leaf-to-leaf");
    });

    it("should gate subplans on the entry/exit test and size-trigger the search", async () => {
        await connect();

        const instructions = client.getInstructions();

        expect(instructions).toContain("connects two siblings in the same plan");
        expect(instructions).toContain("outgrows about 12 tasks");
        expect(instructions).toContain("single entry point and a single exit point");
        expect(instructions).toContain("move those tasks out of the group");
        expect(instructions).toContain("themes stay flat");
    });

    it("should frame verification as predicting get_next_tasks over the whole tree", async () => {
        await connect();

        const instructions = client.getInstructions();

        expect(instructions).toContain("**Verifying the plan:**");
        expect(instructions).toContain("single get_project_state call");
        expect(instructions).toContain("missing from the result is over-constrained");
    });

    it("should describe the name/description split on the mutating tools", async () => {
        await connect();

        const result = await client.listTools();
        const byName = new Map(result.tools.map((tool) => [tool.name, tool]));

        for (const toolName of ["set_goal", "add_task", "update_task"]) {
            const schema = byName.get(toolName)!.inputSchema as any;
            expect(schema.properties.name.description).toContain("imperative action");
            expect(schema.properties.description.description).toMatch(/detail/i);
        }
    });

    it("should document ideaId as the way to address an inbox entry, and index as deprecated", async () => {
        await connect();

        const result = await client.listTools();
        const byName = new Map(result.tools.map((tool) => [tool.name, tool]));

        for (const toolName of ["remove_inbox_idea", "promote_inbox_idea"]) {
            const schema = byName.get(toolName)!.inputSchema as any;
            expect(schema.properties.ideaId.description).toContain("Id of the inbox idea");
            expect(schema.properties.index.description).toContain("DEPRECATED");
        }

        expect(byName.get("get_project_state")!.description).toContain("newest first");
    });

    it("should expose the plan-project and generate-visual-roadmap prompts", async () => {
        await connect();

        const result = await client.listPrompts();
        const promptNames = result.prompts.map((prompt) => prompt.name).sort();
        expect(promptNames).toEqual(["generate-visual-roadmap", "plan-project"]);

        const planProject = await client.getPrompt({ name: "plan-project" });
        const planProjectText = (planProject.messages[0].content as any).text;
        expect(planProjectText).toContain("get_project_state");
        expect(planProjectText).toContain("clarifying question");

        const visualRoadmap = await client.getPrompt({ name: "generate-visual-roadmap" });
        const visualRoadmapText = (visualRoadmap.messages[0].content as any).text;
        expect(visualRoadmapText).toContain("get_project_state");
        expect(visualRoadmapText).toContain("get_next_tasks");
        expect(visualRoadmapText).toContain("withSubplan");
    });

    it("should gate plan structuring on the user in the plan-project prompt", async () => {
        await connect();

        const planProject = await client.getPrompt({ name: "plan-project" });
        const planProjectText = (planProject.messages[0].content as any).text;
        expect(planProjectText).toContain("only once I have asked for it");
        expect(planProjectText).toContain("wait for my answer");
    });

    it("should carry the inbox pruning and one-question cadence into the plan-project prompt", async () => {
        await connect();

        const planProject = await client.getPrompt({ name: "plan-project" });
        const planProjectText = (planProject.messages[0].content as any).text;
        expect(planProjectText).toContain("clearing out the ones our conversation has made obsolete");
        expect(planProjectText).toContain("End every turn of both with exactly one question");
    });

    it("should keep each prompt to a condensed statement of the workflow", async () => {
        await connect();

        const planProject = await client.getPrompt({ name: "plan-project" });
        const visualRoadmap = await client.getPrompt({ name: "generate-visual-roadmap" });

        // The full workflow rides in on the server instructions; a prompt is a
        // kickoff message, so each stays within a few sentences.
        expect((planProject.messages[0].content as any).text.length).toBeLessThan(700);
        expect((visualRoadmap.messages[0].content as any).text.length).toBeLessThan(1100);
    });

    describe("get_project_state", () => {
        it("should return the full project state as JSON", async () => {
            await connect();
            store.setGoal("My Goal");
            store.addIdea("idea 1");

            const result = await callTool("get_project_state");

            expect(result.isError).toBeFalsy();
            const state = parseResult(result);
            expect(state.goal.id).toBe(GOAL_ID);
            expect(state.goal.name).toBe("My Goal");
            expect(state.inbox).toEqual([{ id: expect.any(String), text: "idea 1" }]);
            expect(state.version).toBe(store.getVersion());
        });
    });

    describe("get_roadmap", () => {
        it("should return one level of the plan for the root goal by default", async () => {
            await connect();
            store.setGoal("My Goal");
            const task1 = store.addTask(GOAL_ID, "Task 1");
            const task2 = store.addTask(task1.id, "Nested");
            store.addDependency(task1.id, GOAL_ID);

            const roadmap = parseResult(await callTool("get_roadmap"));

            expect(roadmap.id).toBe(GOAL_ID);
            expect(roadmap.tasks).toHaveLength(1);
            expect(roadmap.tasks[0]).toEqual(
                expect.objectContaining({ id: task1.id, name: "Task 1", hasSubplan: true }),
            );
            expect(roadmap.dependencies).toEqual([{ source: task1.id, target: GOAL_ID }]);

            const subRoadmap = parseResult(await callTool("get_roadmap", { taskId: task1.id }));
            expect(subRoadmap.tasks).toEqual([expect.objectContaining({ id: task2.id, hasSubplan: false })]);
        });

        it("should return an error for an unknown task", async () => {
            await connect();

            const result = await callTool("get_roadmap", { taskId: "unknown" });

            expect(result.isError).toBe(true);
        });
    });

    describe("get_next_tasks", () => {
        it("should return only unblocked leaf tasks", async () => {
            await connect();
            store.setGoal("Goal");
            const task1 = store.addTask(GOAL_ID, "Task 1");
            const task2 = store.addTask(GOAL_ID, "Task 2");
            store.addDependency(task1.id, task2.id);
            store.addDependency(task2.id, GOAL_ID);

            const nextTasks = parseResult(await callTool("get_next_tasks"));

            expect(nextTasks.map((task: Task) => task.id)).toEqual([task1.id]);
        });
    });

    describe("set_goal", () => {
        it("should set the goal and return the new version", async () => {
            await connect();

            const result = parseResult(await callTool("set_goal", { name: "New Goal", description: "Desc" }));

            expect(result.version).toBe(store.getVersion());
            const state = store.getState();
            expect(state.goal.name).toBe("New Goal");
            expect(state.goal.description).toBe("Desc");
            expect(state.goal.plan).not.toBeNull();
        });
    });

    describe("add_task", () => {
        it("should add a task to the root goal by default and return its id", async () => {
            await connect();
            store.setGoal("Goal");

            const result = parseResult(await callTool("add_task", { name: "Task 1" }));

            expect(result.taskId).toBeDefined();
            const task = store.findTask(result.taskId);
            expect(task).not.toBeNull();
            expect(task!.name).toBe("Task 1");
        });

        it("should add a nested task via parentId", async () => {
            await connect();
            store.setGoal("Goal");
            const parent = store.addTask(GOAL_ID, "Parent");

            const result = parseResult(await callTool("add_task", { name: "Child", parentId: parent.id }));

            expect(store.findTask(parent.id)!.plan!.tasksList[0].id).toBe(result.taskId);
        });

        it("should return isError for an unknown parent", async () => {
            await connect();

            const result = await callTool("add_task", { name: "Task", parentId: "unknown" });

            expect(result.isError).toBe(true);
        });

        it("should create a subgoal task and its subplan in one call", async () => {
            await connect();
            store.setGoal("Goal");

            const result = parseResult(await callTool("add_task", { name: "Run the launch", withSubplan: true }));

            expect(result.hasSubplan).toBe(true);
            expect(store.findTask(result.taskId)!.plan).toEqual({ tasksList: [], dependenciesList: [] });

            const child = parseResult(await callTool("add_task", { name: "Draft copy", parentId: result.taskId }));
            expect(child.hasSubplan).toBe(false);
            expect(store.findTask(result.taskId)!.plan!.tasksList.map((task: Task) => task.id)).toEqual([child.taskId]);
        });

        it("should create subplans for the drafts marked withSubplan in a batch", async () => {
            await connect();
            store.setGoal("Goal");

            const result = parseResult(
                await callTool("add_tasks", {
                    tasks: [{ name: "Run the launch", withSubplan: true }, { name: "Draft copy" }],
                }),
            );

            expect(result.tasks.map((task: any) => task.hasSubplan)).toEqual([true, false]);
            expect(store.findTask(result.tasks[0].taskId)!.plan).toEqual({ tasksList: [], dependenciesList: [] });
        });
    });

    describe("set_task_completion and delete_task", () => {
        it("should mark a task complete and delete it", async () => {
            await connect();
            store.setGoal("Goal");
            const task = store.addTask(GOAL_ID, "Task 1");

            await callTool("set_task_completion", { taskId: task.id, completed: true });
            expect(store.findTask(task.id)!.completionState).toBe(true);

            await callTool("delete_task", { taskId: task.id });
            expect(store.findTask(task.id)).toBeNull();
        });

        it("should return isError for unknown tasks", async () => {
            await connect();
            store.setGoal("Goal");

            expect((await callTool("set_task_completion", { taskId: "unknown", completed: true })).isError).toBe(true);
            expect((await callTool("delete_task", { taskId: "unknown" })).isError).toBe(true);
        });
    });

    describe("add_dependency", () => {
        it("should add a valid dependency between siblings", async () => {
            await connect();
            store.setGoal("Goal");
            const task1 = store.addTask(GOAL_ID, "Task 1");
            const task2 = store.addTask(GOAL_ID, "Task 2");

            const result = await callTool("add_dependency", { sourceId: task1.id, targetId: task2.id });

            expect(result.isError).toBeFalsy();
            expect(store.getState().goal.plan!.dependenciesList).toEqual([{ source: task1.id, target: task2.id }]);
        });

        it("should return isError for a self-dependency", async () => {
            await connect();
            store.setGoal("Goal");
            const task = store.addTask(GOAL_ID, "Task 1");

            const result = await callTool("add_dependency", { sourceId: task.id, targetId: task.id });

            expect(result.isError).toBe(true);
            expect(store.getState().goal.plan!.dependenciesList).toHaveLength(0);
        });

        it("should return isError for a cycle", async () => {
            await connect();
            store.setGoal("Goal");
            const task1 = store.addTask(GOAL_ID, "Task 1");
            const task2 = store.addTask(GOAL_ID, "Task 2");
            store.addDependency(task1.id, task2.id);

            const result = await callTool("add_dependency", { sourceId: task2.id, targetId: task1.id });

            expect(result.isError).toBe(true);
        });

        it("should return isError for an unknown source", async () => {
            await connect();
            store.setGoal("Goal");
            const task = store.addTask(GOAL_ID, "Task 1");

            const result = await callTool("add_dependency", { sourceId: "unknown", targetId: task.id });

            expect(result.isError).toBe(true);
        });

        it("should name both ends and their plans when an edge crosses plans", async () => {
            await connect();
            store.setGoal("Goal");
            const stageC = store.addTask(GOAL_ID, "Stage C", undefined, true);
            const stageD = store.addTask(GOAL_ID, "Stage D", undefined, true);
            const dressCodes = store.addTask(stageC.id, "Check restaurant dress codes");
            const pack = store.addTask(stageD.id, "Pack from the itinerary");

            const result = await callTool("add_dependency", { sourceId: dressCodes.id, targetId: pack.id });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain(
                '"Check restaurant dress codes" -> "Pack from the itinerary" crosses plans',
            );
            expect(result.content[0].text).toContain('the source is in the subplan of "Stage C"');
            expect(result.content[0].text).toContain('the target is in the subplan of "Stage D"');
            expect(result.content[0].text).toContain("add the edge between the tasks whose subplans hold them");
        });
    });

    describe("inbox tools", () => {
        it("should add an idea and return its id", async () => {
            await connect();

            const result = parseResult(await callTool("add_inbox_idea", { text: "idea 1" }));

            expect(result).toEqual({
                ideaId: expect.any(String),
                text: "idea 1",
                duplicate: false,
                version: store.getVersion(),
            });
            expect(store.getState().inbox).toEqual([{ id: result.ideaId, text: "idea 1" }]);
        });

        it("should return the existing id for an idea the inbox already holds", async () => {
            await connect();
            const first = parseResult(await callTool("add_inbox_idea", { text: "Book the venue" }));

            const second = parseResult(await callTool("add_inbox_idea", { text: "  book the   VENUE " }));

            expect(second).toEqual({
                ideaId: first.ideaId,
                text: "Book the venue",
                duplicate: true,
                version: store.getVersion(),
            });
            expect(store.getState().inbox).toHaveLength(1);
        });

        it("should remove an idea by id and say which it was", async () => {
            await connect();
            const idea = parseResult(await callTool("add_inbox_idea", { text: "idea 1" }));

            const result = parseResult(await callTool("remove_inbox_idea", { ideaId: idea.ideaId }));

            expect(result).toEqual({
                ideaId: idea.ideaId,
                text: "idea 1",
                removed: true,
                version: store.getVersion(),
            });
            expect(store.getState().inbox).toEqual([]);
        });

        it("should still accept the deprecated index", async () => {
            await connect();
            store.addIdea("idea 1");

            await callTool("remove_inbox_idea", { index: 0 });

            expect(store.getState().inbox).toEqual([]);
        });

        it("should let ideaId win when an index is sent as well", async () => {
            await connect();
            const first = store.addIdea("first");
            store.addIdea("second");

            const result = parseResult(await callTool("remove_inbox_idea", { ideaId: first.id, index: 0 }));

            expect(result.text).toBe("first");
            expect(store.getState().inbox.map((idea) => idea.text)).toEqual(["second"]);
        });

        it("should remove several ideas at once, saying which each was", async () => {
            await connect();
            const added = ["a", "b", "c"].map((text) => store.addIdea(text));

            const result = parseResult(await callTool("remove_inbox_ideas", { ideaIds: [added[2].id, added[0].id] }));

            expect(result.ideas).toEqual([
                { ideaId: added[2].id, text: "c", removed: true },
                { ideaId: added[0].id, text: "a", removed: true },
            ]);
            expect(store.getState().inbox.map((idea) => idea.text)).toEqual(["b"]);
        });

        it("should remove no idea at all when one id in the batch is unknown", async () => {
            await connect();
            const idea = store.addIdea("keep me");

            const result = await callTool("remove_inbox_ideas", { ideaIds: [idea.id, "gone"] });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("gone");
            expect(store.getState().inbox.map((idea) => idea.text)).toEqual(["keep me"]);
        });

        it("should add several ideas at once, keeping the order supplied", async () => {
            await connect();

            const result = parseResult(await callTool("add_inbox_ideas", { texts: ["a", "b", "a", "c"] }));

            expect(result.ideas.map((idea: any) => idea.text)).toEqual(["a", "b", "a", "c"]);
            expect(result.ideas.map((idea: any) => idea.duplicate)).toEqual([false, false, true, false]);
            expect(result.ideas[2].ideaId).toBe(result.ideas[0].ideaId);
            expect(store.getState().inbox.map((idea) => idea.text)).toEqual(["c", "b", "a"]);
        });

        it("should promote an inbox idea to a task and echo the task", async () => {
            await connect();
            store.setGoal("Goal");
            const idea = store.addIdea("promote me");

            const result = parseResult(await callTool("promote_inbox_idea", { ideaId: idea.id }));

            expect(result).toEqual({
                taskId: expect.any(String),
                name: "promote me",
                parentId: GOAL_ID,
                version: store.getVersion(),
            });
            const state = store.getState();
            expect(state.inbox).toEqual([]);
            expect(state.goal.plan!.tasksList[0].id).toBe(result.taskId);
        });

        it("should give the task its final name and description in the one call", async () => {
            await connect();
            store.setGoal("Goal");
            const idea = store.addIdea("we should probably sort out the venue at some point");

            const result = parseResult(
                await callTool("promote_inbox_idea", {
                    ideaId: idea.id,
                    name: "Book venue",
                    description: "Seats 80, within 20 minutes of the station",
                }),
            );

            expect(result.name).toBe("Book venue");
            const task = store.findTask(result.taskId)!;
            expect(task.name).toBe("Book venue");
            expect(task.description).toBe("Seats 80, within 20 minutes of the station");
        });

        it("should build each task from the idea whose id was passed, promoted in any order", async () => {
            await connect();
            store.setGoal("Goal");
            const texts = Array.from({ length: 12 }, (unused, position) => `idea ${position}`);
            const added: { ideaId: string; text: string }[] = [];
            for (const text of texts) {
                added.push(parseResult(await callTool("add_inbox_idea", { text })));
            }
            // A deterministic shuffle: nothing is promoted in the order it was
            // added, and neither oldest-first nor newest-first would pass.
            const shuffled = [7, 0, 11, 3, 9, 1, 5, 10, 2, 8, 4, 6].map((position) => added[position]);

            for (const idea of shuffled) {
                const result = parseResult(await callTool("promote_inbox_idea", { ideaId: idea.ideaId }));
                expect(result.name).toBe(idea.text);
                expect(store.findTask(result.taskId)!.name).toBe(idea.text);
            }

            expect(store.getState().inbox).toEqual([]);
        });

        it("should fail loudly for an idea that was already promoted, rather than take its neighbour", async () => {
            await connect();
            store.setGoal("Goal");
            const kept = store.addIdea("keep me");
            const promoted = store.addIdea("promote me");
            await callTool("promote_inbox_idea", { ideaId: promoted.id });

            const result = await callTool("promote_inbox_idea", { ideaId: promoted.id });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain(promoted.id);
            expect(store.getState().inbox).toEqual([{ id: kept.id, text: "keep me" }]);
        });

        it("should return isError for an unknown idea id or an invalid index", async () => {
            await connect();

            expect((await callTool("remove_inbox_idea", { ideaId: "never existed" })).isError).toBe(true);
            expect((await callTool("remove_inbox_idea", { index: 3 })).isError).toBe(true);
            expect((await callTool("promote_inbox_idea", { index: 0 })).isError).toBe(true);
        });

        it("should promote several ideas at once, pairing each task with the idea asked for", async () => {
            await connect();
            store.setGoal("Goal");
            const parent = store.addTask(GOAL_ID, "Parent");
            const added = ["a", "b", "c"].map((text) => store.addIdea(text));

            const result = parseResult(
                await callTool("promote_inbox_ideas", {
                    promotions: [
                        { ideaId: added[2].id, name: "Do C" },
                        { ideaId: added[0].id, parentId: parent.id },
                        { ideaId: added[1].id },
                    ],
                }),
            );

            expect(result.tasks).toEqual([
                { taskId: expect.any(String), name: "Do C", parentId: GOAL_ID },
                { taskId: expect.any(String), name: "a", parentId: parent.id },
                { taskId: expect.any(String), name: "b", parentId: GOAL_ID },
            ]);
            expect(store.getState().inbox).toEqual([]);
        });

        it("should apply no promotion at all when one idea in the batch is unknown", async () => {
            await connect();
            store.setGoal("Goal");
            const idea = store.addIdea("a");

            const result = await callTool("promote_inbox_ideas", {
                promotions: [{ ideaId: idea.id }, { ideaId: "gone" }],
            });

            expect(result.isError).toBe(true);
            expect(store.getState().inbox).toEqual([{ id: idea.id, text: "a" }]);
            expect(store.getState().goal.plan!.tasksList).toHaveLength(0);
        });
    });

    describe("echoing what was changed", () => {
        // Left deliberately as a loop over every mutating tool: a tool added
        // later that reports nothing but a counter fails here without anyone
        // remembering to come back and add a case for it.
        it("should never answer a write with the version alone", async () => {
            await connect();
            store.setGoal("Ship it");
            const first = store.addTask(GOAL_ID, "Draft copy");
            const second = store.addTask(GOAL_ID, "Print flyers");
            const third = store.addTask(GOAL_ID, "Fold flyers");
            const parent = store.addTask(GOAL_ID, "Run the launch");
            store.createSubplan(parent.id);
            store.addDependency(first.id, second.id);
            const ideas = ["a", "b", "c", "d"].map((text) => store.addIdea(text));

            const args: Record<string, Record<string, unknown>> = {
                set_goal: { name: "Ship it" },
                add_task: { name: "Sort the printing" },
                add_tasks: { tasks: [{ name: "Sort the printing" }] },
                update_task: { taskId: first.id, name: "Draft the copy" },
                move_task: { taskId: first.id, newParentId: parent.id },
                move_tasks: { moves: [{ taskId: first.id, newParentId: GOAL_ID }] },
                set_task_completion: { taskId: second.id, completed: true },
                delete_task: { taskId: second.id },
                delete_tasks: { taskIds: [third.id] },
                create_subplan: { taskId: parent.id },
                add_dependency: { sourceId: parent.id, targetId: GOAL_ID },
                add_dependencies: { dependencies: [{ sourceId: parent.id, targetId: GOAL_ID }] },
                remove_dependency: { sourceId: parent.id, targetId: GOAL_ID },
                add_inbox_idea: { text: "something new" },
                add_inbox_ideas: { texts: ["something else new"] },
                remove_inbox_idea: { ideaId: ideas[0].id },
                remove_inbox_ideas: { ideaIds: [ideas[3].id] },
                promote_inbox_idea: { ideaId: ideas[1].id },
                promote_inbox_ideas: { promotions: [{ ideaId: ideas[2].id }] },
                undo_last_change: {},
            };

            for (const toolName of MUTATING_TOOLS) {
                const result = await callTool(toolName, args[toolName]);

                expect(result.isError).toBeFalsy();
                const keys = Object.keys(parseResult(result)).filter((key) => key !== "version");
                expect({ toolName, keys }).toEqual({ toolName, keys: expect.arrayContaining([expect.any(String)]) });
            }
        });

        it("should name both ends of a dependency it stores", async () => {
            await connect();
            store.setGoal("Ship it");
            const first = store.addTask(GOAL_ID, "Draft copy");
            const second = store.addTask(GOAL_ID, "Print flyers");

            const added = parseResult(await callTool("add_dependency", { sourceId: first.id, targetId: second.id }));
            const goalward = parseResult(await callTool("add_dependency", { sourceId: second.id, targetId: GOAL_ID }));

            expect(added).toEqual({
                sourceId: first.id,
                sourceName: "Draft copy",
                targetId: second.id,
                targetName: "Print flyers",
                version: expect.any(Number),
            });
            expect(goalward.targetName).toBe("Ship it");
        });

        it("should echo the target id as addressed when it names the plan's own task", async () => {
            await connect();
            store.setGoal("Ship it");
            const parent = store.addTask(GOAL_ID, "Run the launch");
            const child = store.addTask(parent.id, "Draft copy");

            const result = parseResult(await callTool("add_dependency", { sourceId: child.id, targetId: parent.id }));

            expect(result).toEqual({
                sourceId: child.id,
                sourceName: "Draft copy",
                targetId: parent.id,
                targetName: "Run the launch",
                version: expect.any(Number),
            });
            // The edge itself stores as the plan's goal sentinel.
            expect(store.findTask(parent.id)!.plan!.dependenciesList).toEqual([{ source: child.id, target: GOAL_ID }]);
        });
    });

    describe("batch tools", () => {
        it("should add tasks in the order supplied and echo each one", async () => {
            await connect();
            store.setGoal("Goal");
            const parent = store.addTask(GOAL_ID, "Parent");

            const result = parseResult(
                await callTool("add_tasks", {
                    tasks: [
                        { name: "Draft copy" },
                        { name: "Print flyers", parentId: parent.id, description: "150gsm" },
                        { name: "Post flyers" },
                    ],
                }),
            );

            expect(result.tasks).toEqual([
                { taskId: expect.any(String), name: "Draft copy", parentId: GOAL_ID, hasSubplan: false },
                { taskId: expect.any(String), name: "Print flyers", parentId: parent.id, hasSubplan: false },
                { taskId: expect.any(String), name: "Post flyers", parentId: GOAL_ID, hasSubplan: false },
            ]);
            expect(store.findTask(result.tasks[1].taskId)!.description).toBe("150gsm");
        });

        it("should add no task when one parent in the batch is unknown", async () => {
            await connect();
            store.setGoal("Goal");

            const result = await callTool("add_tasks", {
                tasks: [{ name: "Draft copy" }, { name: "Print flyers", parentId: "nope" }],
            });

            expect(result.isError).toBe(true);
            expect(store.getState().goal.plan!.tasksList).toHaveLength(0);
        });

        it("should add dependencies in the order supplied", async () => {
            await connect();
            store.setGoal("Ship it");
            const first = store.addTask(GOAL_ID, "Draft copy");
            const second = store.addTask(GOAL_ID, "Print flyers");

            const result = parseResult(
                await callTool("add_dependencies", {
                    dependencies: [
                        { sourceId: first.id, targetId: second.id },
                        { sourceId: second.id, targetId: GOAL_ID },
                    ],
                }),
            );

            expect(result.dependencies).toEqual([
                { sourceId: first.id, sourceName: "Draft copy", targetId: second.id, targetName: "Print flyers" },
                { sourceId: second.id, sourceName: "Print flyers", targetId: GOAL_ID, targetName: "Ship it" },
            ]);
        });

        it("should apply no dependency at all when the batch would close a cycle, and name it", async () => {
            await connect();
            store.setGoal("Ship it");
            const first = store.addTask(GOAL_ID, "Draft copy");
            const second = store.addTask(GOAL_ID, "Print flyers");
            const third = store.addTask(GOAL_ID, "Post flyers");

            const result = await callTool("add_dependencies", {
                dependencies: [
                    { sourceId: first.id, targetId: second.id },
                    { sourceId: second.id, targetId: third.id },
                    { sourceId: third.id, targetId: first.id },
                ],
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('"Post flyers" -> "Draft copy" would create a cycle');
            expect(result.content[0].text).toContain("Draft copy -> Print flyers -> Post flyers -> Draft copy");
            expect(store.getState().goal.plan!.dependenciesList).toEqual([]);
        });
    });

    describe("move_task", () => {
        it("should move a task into another task's plan and echo where it landed", async () => {
            await connect();
            store.setGoal("Goal");
            const parent = store.addTask(GOAL_ID, "Parent");
            const moving = store.addTask(GOAL_ID, "Moving");

            const result = parseResult(await callTool("move_task", { taskId: moving.id, newParentId: parent.id }));

            expect(result).toEqual({
                taskId: moving.id,
                name: "Moving",
                parentId: parent.id,
                version: store.getVersion(),
            });
            expect(store.findTask(parent.id)!.plan!.tasksList.map((task) => task.id)).toEqual([moving.id]);
        });

        it("should return isError for a move into the task's own descendant", async () => {
            await connect();
            store.setGoal("Goal");
            const parent = store.addTask(GOAL_ID, "Parent");
            const child = store.addTask(parent.id, "Child");

            const result = await callTool("move_task", { taskId: parent.id, newParentId: child.id });

            expect(result.isError).toBe(true);
            expect(store.getState().goal.plan!.tasksList.map((task) => task.id)).toEqual([parent.id]);
        });
    });

    describe("move_tasks and delete_tasks", () => {
        it("should move several tasks in one call, landing them in batch order", async () => {
            await connect();
            store.setGoal("Goal");
            const stage = store.addTask(GOAL_ID, "Stage A", undefined, true);
            const added = ["a", "b", "c"].map((name) => store.addTask(GOAL_ID, name));

            const result = parseResult(
                await callTool("move_tasks", {
                    moves: [
                        { taskId: added[2].id, newParentId: stage.id },
                        { taskId: added[0].id, newParentId: stage.id },
                    ],
                }),
            );

            expect(result.tasks).toEqual([
                { taskId: added[2].id, name: "c", parentId: stage.id },
                { taskId: added[0].id, name: "a", parentId: stage.id },
            ]);
            expect(store.findTask(stage.id)!.plan!.tasksList.map((task) => task.name)).toEqual(["c", "a"]);
        });

        it("should move no task at all when one move in the batch fails", async () => {
            await connect();
            store.setGoal("Goal");
            const stage = store.addTask(GOAL_ID, "Stage A", undefined, true);
            const moving = store.addTask(GOAL_ID, "Moving");

            const result = await callTool("move_tasks", {
                moves: [
                    { taskId: moving.id, newParentId: stage.id },
                    { taskId: "nope", newParentId: stage.id },
                ],
            });

            expect(result.isError).toBe(true);
            expect(store.findTask(stage.id)!.plan!.tasksList).toHaveLength(0);
            expect(store.getState().goal.plan!.tasksList.map((task) => task.name)).toEqual(["Stage A", "Moving"]);
        });

        it("should delete several tasks in one call, saying which each was", async () => {
            await connect();
            store.setGoal("Goal");
            const added = ["a", "b", "c"].map((name) => store.addTask(GOAL_ID, name));

            const result = parseResult(await callTool("delete_tasks", { taskIds: [added[2].id, added[0].id] }));

            expect(result.tasks).toEqual([
                { taskId: added[2].id, name: "c", deleted: true },
                { taskId: added[0].id, name: "a", deleted: true },
            ]);
            expect(store.getState().goal.plan!.tasksList.map((task) => task.name)).toEqual(["b"]);
        });

        it("should delete no task at all when one id in the batch is unknown", async () => {
            await connect();
            store.setGoal("Goal");
            const task = store.addTask(GOAL_ID, "Task");

            const result = await callTool("delete_tasks", { taskIds: [task.id, "nope"] });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("nope");
            expect(store.findTask(task.id)).not.toBeNull();
        });
    });

    describe("name rules", () => {
        it("should refuse a name too long to render on a node", async () => {
            await connect();
            store.setGoal("Goal");

            const result = await callTool("add_task", {
                name: "Book a venue that seats eighty people within twenty minutes of the station",
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("40 characters");
            expect(result.content[0].text).toContain("description");
            expect(store.getState().goal.plan!.tasksList).toHaveLength(0);
        });

        it("should refuse a name containing a line break", async () => {
            await connect();
            store.setGoal("Goal");

            const result = await callTool("add_task", { name: "Book venue\nSeats 80" });

            expect(result.isError).toBe(true);
            expect(store.getState().goal.plan!.tasksList).toHaveLength(0);
        });

        it("should warn about a name that joins two actions, and still add it", async () => {
            await connect();
            store.setGoal("Goal");

            const result = parseResult(await callTool("add_task", { name: "Book venue and print flyers" }));

            expect(result.warnings).toEqual([expect.stringContaining("two tasks")]);
            expect(store.findTask(result.taskId)!.name).toBe("Book venue and print flyers");
        });

        it("should let a subgoal's name span several things without a warning", async () => {
            await connect();
            store.setGoal("Goal");

            const container = parseResult(
                await callTool("add_task", { name: "Lock dates and budget", withSubplan: true }),
            );
            const batch = parseResult(
                await callTool("add_tasks", {
                    tasks: [
                        { name: "Cover home and work", withSubplan: true },
                        { name: "Book venue and print flyers" },
                    ],
                }),
            );

            expect(container.warnings).toBeUndefined();
            expect(batch.warnings).toEqual([expect.stringContaining("two tasks")]);
        });

        it("should let the goal's name span several things without a warning", async () => {
            await connect();

            const result = parseResult(await callTool("set_goal", { name: "Lock dates and budget" }));

            expect(result.warnings).toBeUndefined();
        });

        it("should read an updated name against whether the task holds a subplan", async () => {
            await connect();
            store.setGoal("Goal");
            const subgoal = store.addTask(GOAL_ID, "Container", undefined, true);
            const leaf = store.addTask(GOAL_ID, "Leaf task");

            const subgoalResult = parseResult(
                await callTool("update_task", { taskId: subgoal.id, name: "Cover home and work" }),
            );
            const leafResult = parseResult(
                await callTool("update_task", { taskId: leaf.id, name: "Book venue and print flyers" }),
            );

            expect(subgoalResult.warnings).toBeUndefined();
            expect(leafResult.warnings).toEqual([expect.stringContaining("two tasks")]);
        });

        it("should warn about a question and about a bare single word", async () => {
            await connect();
            store.setGoal("Goal");

            const question = parseResult(await callTool("add_task", { name: "Which venue?" }));
            const bareNoun = parseResult(await callTool("add_task", { name: "Venue" }));

            expect(question.warnings).toEqual([expect.stringContaining("question")]);
            expect(bareNoun.warnings).toEqual([expect.stringContaining("single word")]);
        });

        it("should leave warnings out of a clean write", async () => {
            await connect();
            store.setGoal("Goal");

            const result = parseResult(await callTool("add_task", { name: "Book venue" }));

            expect(result.warnings).toBeUndefined();
        });

        it("should apply the same rules to promoted ideas and batches", async () => {
            await connect();
            store.setGoal("Goal");
            const idea = store.addIdea("venue");

            const promoted = parseResult(await callTool("promote_inbox_idea", { ideaId: idea.id, name: "Venue" }));
            const batch = await callTool("add_tasks", {
                tasks: [{ name: "Book venue" }, { name: "Book a venue that seats eighty people near the station" }],
            });

            expect(promoted.warnings).toEqual([expect.stringContaining("single word")]);
            expect(batch.isError).toBe(true);
            expect(store.getState().goal.plan!.tasksList.map((task) => task.name)).toEqual(["Venue"]);
        });
    });

    describe("undo_last_change", () => {
        it("should undo the last change and report whether anything was undone", async () => {
            await connect();
            store.addIdea("idea");

            const result = parseResult(await callTool("undo_last_change"));
            expect(result.undone).toBe(true);
            expect(store.getState().inbox).toEqual([]);

            const secondResult = parseResult(await callTool("undo_last_change"));
            expect(secondResult.undone).toBe(false);
        });
    });
});
