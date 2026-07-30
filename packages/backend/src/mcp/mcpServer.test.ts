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
    "update_task",
    "set_task_completion",
    "delete_task",
    "create_subplan",
    "add_dependency",
    "remove_dependency",
    "add_inbox_idea",
    "remove_inbox_idea",
    "promote_inbox_idea",
    "undo_last_change",
];

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

    it("should list all 15 tools", async () => {
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

    it("should steer names to short imperative actions with detail in descriptions", async () => {
        await connect();

        const instructions = client.getInstructions();

        expect(instructions).toContain("**Naming:**");
        expect(instructions).toContain("start with a verb in the imperative");
        expect(instructions).toContain("one actionable item");
        expect(instructions).toContain("description field");
    });

    it("should describe the name/description split on the mutating tools", async () => {
        await connect();

        const result = await client.listTools();
        const byName = new Map(result.tools.map((tool) => [tool.name, tool]));

        for (const toolName of ["set_goal", "add_task", "update_task"]) {
            const schema = byName.get(toolName)!.inputSchema as any;
            expect(schema.properties.name.description).toContain("imperative verb");
            expect(schema.properties.name.description).toContain("actionable item");
            expect(schema.properties.description.description).toMatch(/detail/i);
        }

        expect(byName.get("promote_inbox_idea")!.description).toContain("update_task");
    });

    it("should expose the plan-project and generate-plan prompts", async () => {
        await connect();

        const result = await client.listPrompts();
        const promptNames = result.prompts.map((prompt) => prompt.name).sort();
        expect(promptNames).toEqual(["generate-plan", "plan-project"]);

        const planProject = await client.getPrompt({ name: "plan-project" });
        expect((planProject.messages[0].content as any).text).toContain("Phase 1: Goal Clarification");

        expect((planProject.messages[0].content as any).text).toContain("**Naming:**");

        const generatePlan = await client.getPrompt({ name: "generate-plan" });
        expect((generatePlan.messages[0].content as any).text).toContain("get_roadmap");
        expect((generatePlan.messages[0].content as any).text).toContain("**Naming:**");
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
            expect(state.inbox).toEqual(["idea 1"]);
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
    });

    describe("inbox tools", () => {
        it("should add and remove inbox ideas", async () => {
            await connect();

            await callTool("add_inbox_idea", { text: "idea 1" });
            expect(store.getState().inbox).toEqual(["idea 1"]);

            await callTool("remove_inbox_idea", { index: 0 });
            expect(store.getState().inbox).toEqual([]);
        });

        it("should promote an inbox idea to a task", async () => {
            await connect();
            store.setGoal("Goal");
            store.addIdea("promote me");

            const result = parseResult(await callTool("promote_inbox_idea", { index: 0 }));

            expect(result.taskId).toBeDefined();
            const state = store.getState();
            expect(state.inbox).toEqual([]);
            expect(state.goal.plan!.tasksList[0].id).toBe(result.taskId);
            expect(state.goal.plan!.tasksList[0].name).toBe("promote me");
        });

        it("should return isError for an invalid inbox index", async () => {
            await connect();

            expect((await callTool("remove_inbox_idea", { index: 3 })).isError).toBe(true);
            expect((await callTool("promote_inbox_idea", { index: 0 })).isError).toBe(true);
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
