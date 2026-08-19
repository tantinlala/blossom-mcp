import { renderHook, act } from "@testing-library/react";
import { useInbox } from "./useInbox";
import { WorkspaceManager } from "../utils/WorkspaceManager";
import { APIClient } from "../utils/APIClient";
import { GOAL_ID, InboxIdea, ProjectState, Task, ViewState } from "@blossom/common";

jest.mock("../utils/APIClient");

const TRIP = "Trip";
const HOUSE = "House";

// The server's inbox entries, with ids standing in for the ones it generates.
const ideas = (...texts: string[]): InboxIdea[] => texts.map((text, position) => ({ id: `idea-${position}`, text }));

const emptyGoal = (): Task => ({
    name: "Goal",
    id: GOAL_ID,
    completionState: false,
    plan: { tasksList: [], dependenciesList: [] },
});

const makeState = (version = 1, inbox: InboxIdea[] = [], key = TRIP): ProjectState => ({
    version,
    key,
    savedToDisk: true,
    goal: emptyGoal(),
    inbox,
});

const makeView = (...projects: ProjectState[]): ViewState => ({ projects, assistantProject: null });

describe("useInbox", () => {
    let workspace: WorkspaceManager;
    let mockedAPIClient: jest.Mocked<APIClient>;
    let mockApplyProject: jest.Mock;
    let mockNotify: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        // Every write needs the plan level a project is drilled into, which the
        // real view-model derives; it does no I/O, so it is used as it is.
        workspace = new WorkspaceManager();
        workspace.applyView(makeView(makeState(1, [], TRIP), makeState(1, [], HOUSE)));
        mockedAPIClient = new APIClient() as jest.Mocked<APIClient>;
        mockedAPIClient.lastFailure.mockReturnValue(null);
        mockApplyProject = jest.fn();
        mockNotify = jest.fn();
    });

    const render = () =>
        renderHook(() =>
            useInbox({
                apiClient: mockedAPIClient,
                workspace,
                applyProject: mockApplyProject,
                notify: mockNotify,
            }),
        );

    /** Adopts one project's inbox, the way a pushed change for it arrives. */
    const arrive = (result: any, entries: InboxIdea[], key = TRIP) =>
        act(() => result.current.applyRemoteInbox(key, entries));

    /** Adopts the whole board's inboxes, the way a snapshot arrives. */
    const arriveView = (result: any, view: ViewState) => act(() => result.current.applyInboxView(view));

    const textsFor = (result: any, key = TRIP): string[] =>
        result.current.ideaGroups.find((group: any) => group.projectKey === key)?.ideas.map((idea: any) => idea.text) ??
        [];

    it("initializes with no lists at all", () => {
        const { result } = render();

        expect(result.current.ideaGroups).toEqual([]);
        expect(result.current.totalIdeaCount).toBe(0);
    });

    describe("adopting the server's lists", () => {
        it("keeps one list per project on the board, in lane order", () => {
            const { result } = render();

            arriveView(result, makeView(makeState(1, ideas("pack"), TRIP), makeState(1, ideas("paint"), HOUSE)));

            expect(result.current.ideaGroups.map((group) => group.projectKey)).toEqual([TRIP, HOUSE]);
            expect(textsFor(result, HOUSE)).toEqual(["paint"]);
            expect(result.current.totalIdeaCount).toBe(2);
        });

        it("applies one project's list without disturbing another's", () => {
            const { result } = render();
            arriveView(result, makeView(makeState(1, ideas("pack"), TRIP), makeState(1, ideas("paint"), HOUSE)));

            arrive(result, ideas("pack", "book flights"), TRIP);

            expect(textsFor(result, TRIP)).toEqual(["pack", "book flights"]);
            expect(textsFor(result, HOUSE)).toEqual(["paint"]);
        });

        it("takes on a project whose list arrives before the whole board does", () => {
            const { result } = render();

            arrive(result, ideas("paint"), HOUSE);

            expect(result.current.ideaGroups.map((group) => group.projectKey)).toEqual([HOUSE]);
        });
    });

    describe("writing, each naming the project it lands in", () => {
        it("addIdea posts an empty idea to the project asked for", async () => {
            const state = makeState(2, ideas(""), HOUSE);
            mockedAPIClient.addIdea.mockResolvedValue(state);
            const { result } = render();

            await act(async () => result.current.addIdea(HOUSE));

            expect(mockedAPIClient.addIdea).toHaveBeenCalledWith(HOUSE, "");
            expect(mockApplyProject).toHaveBeenCalledWith(state);
        });

        it("reports the failure and reads that project back when the write is unexplained", async () => {
            mockedAPIClient.addIdea.mockResolvedValue(undefined);
            const fresh = makeState(9, ideas("from server"));
            mockedAPIClient.getView.mockResolvedValue(makeView(fresh));
            const { result } = render();

            await act(async () => result.current.addIdea(TRIP));

            expect(mockNotify).toHaveBeenCalledWith("That did not work. Refreshing the project.");
            expect(mockedAPIClient.getView).toHaveBeenCalledWith([TRIP]);
            expect(mockApplyProject).toHaveBeenCalledWith(fresh);
        });

        it("leaves a refused write to be repaired centrally rather than reading it back", async () => {
            mockedAPIClient.addIdea.mockResolvedValue(undefined);
            mockedAPIClient.lastFailure.mockReturnValue({
                code: "conflict",
                message: "Someone got there first",
                state: makeState(4),
            });
            const { result } = render();

            await act(async () => result.current.addIdea(TRIP));

            expect(mockedAPIClient.getView).not.toHaveBeenCalled();
            expect(mockNotify).not.toHaveBeenCalled();
        });

        it("deleteIdea works out the project from the idea, guarded by the text it expects", async () => {
            mockedAPIClient.removeIdea.mockResolvedValue(makeState(2, [], HOUSE));
            const { result } = render();
            arriveView(result, makeView(makeState(1, ideas("pack"), TRIP), makeState(1, ideas("paint"), HOUSE)));

            await act(async () => result.current.deleteIdea("idea-0"));

            // Both projects number their ideas from zero; the id settles which
            // list it came from, and the first list holding it wins.
            expect(mockedAPIClient.removeIdea).toHaveBeenCalledWith(TRIP, "idea-0", "pack");
        });

        it("does nothing for an idea no list holds", async () => {
            const { result } = render();

            await act(async () => result.current.deleteIdea("never-existed"));

            expect(mockedAPIClient.removeIdea).not.toHaveBeenCalled();
        });

        it("addTaskToContextAndRemove promotes into the plan level that project is drilled into", async () => {
            mockedAPIClient.promoteIdea.mockResolvedValue(makeState(2, [], HOUSE));
            const { result } = render();
            arrive(result, ideas("paint"), HOUSE);

            await act(async () => result.current.addTaskToContextAndRemove("idea-0"));

            expect(mockedAPIClient.promoteIdea).toHaveBeenCalledWith(HOUSE, "idea-0", GOAL_ID, "paint");
        });

        it("addAllIdeasToPlan promotes one project's whole list in a single request", async () => {
            mockedAPIClient.promoteAllIdeas.mockResolvedValue(makeState(2, [], HOUSE));
            const { result } = render();
            arriveView(result, makeView(makeState(1, ideas("pack"), TRIP), makeState(1, ideas("paint"), HOUSE)));

            await act(async () => result.current.addAllIdeasToPlan(HOUSE));

            expect(mockedAPIClient.promoteAllIdeas).toHaveBeenCalledTimes(1);
            expect(mockedAPIClient.promoteAllIdeas).toHaveBeenCalledWith(HOUSE, GOAL_ID);
        });

        it("addAllIdeasToPlan does nothing for a project whose list is empty", async () => {
            const { result } = render();
            arrive(result, [], TRIP);

            await act(async () => result.current.addAllIdeasToPlan(TRIP));

            expect(mockedAPIClient.promoteAllIdeas).not.toHaveBeenCalled();
        });
    });

    describe("typing", () => {
        it("overlays the typed text locally without hitting the API", () => {
            const { result } = render();
            arrive(result, ideas("first", "second"));

            act(() => result.current.changeIdea("idea-1", "second, edited"));

            expect(textsFor(result)).toEqual(["first", "second, edited"]);
            expect(mockedAPIClient.updateIdea).not.toHaveBeenCalled();
        });

        it("commits the typed text against the value it started from", async () => {
            mockedAPIClient.updateIdea.mockResolvedValue(makeState(2, ideas("first, edited")));
            const { result } = render();
            arrive(result, ideas("first"));
            act(() => result.current.changeIdea("idea-0", "first, edited"));

            await act(async () => result.current.commitIdea("idea-0"));

            expect(mockedAPIClient.updateIdea).toHaveBeenCalledWith(TRIP, "idea-0", "first, edited", "first");
        });

        it("does nothing when there is no pending edit", async () => {
            const { result } = render();
            arrive(result, ideas("first"));

            await act(async () => result.current.commitIdea("idea-0"));

            expect(mockedAPIClient.updateIdea).not.toHaveBeenCalled();
        });

        it("keeps the typed text after a rejected commit so it is not lost", async () => {
            mockedAPIClient.updateIdea.mockResolvedValue(undefined);
            mockedAPIClient.lastFailure.mockReturnValue({
                code: "conflict",
                message: "Someone got there first",
                state: makeState(4, ideas("theirs")),
            });
            const { result } = render();
            arrive(result, ideas("first"));
            act(() => result.current.changeIdea("idea-0", "mine"));

            await act(async () => result.current.commitIdea("idea-0"));

            expect(textsFor(result)).toEqual(["mine"]);
        });

        it("keeps typing intact when a change arrives for a different idea", () => {
            const { result } = render();
            arrive(result, ideas("first", "second"));
            act(() => result.current.changeIdea("idea-1", "second, edited"));

            arrive(result, [
                { id: "idea-0", text: "first, changed by somebody else" },
                { id: "idea-1", text: "second" },
            ]);

            expect(textsFor(result)).toEqual(["first, changed by somebody else", "second, edited"]);
            expect(mockNotify).not.toHaveBeenCalled();
        });

        it("keeps your typing when the idea changes underneath, and says so", () => {
            const { result } = render();
            arrive(result, ideas("first"));
            act(() => result.current.changeIdea("idea-0", "mine"));

            arrive(result, [{ id: "idea-0", text: "theirs" }]);

            expect(textsFor(result)).toEqual(["mine"]);
            expect(mockNotify).toHaveBeenCalledWith(
                "Someone else changed an idea you are editing. Your version will replace theirs.",
            );
        });

        it("commits over the value that landed underneath, having warned about it", async () => {
            mockedAPIClient.updateIdea.mockResolvedValue(makeState(3, ideas("mine")));
            const { result } = render();
            arrive(result, ideas("first"));
            act(() => result.current.changeIdea("idea-0", "mine"));
            arrive(result, [{ id: "idea-0", text: "theirs" }]);

            await act(async () => result.current.commitIdea("idea-0"));

            expect(mockedAPIClient.updateIdea).toHaveBeenCalledWith(TRIP, "idea-0", "mine", "theirs");
        });

        it("leaves an edit alone when somebody adds an idea above it", () => {
            const { result } = render();
            arrive(result, ideas("first"));
            act(() => result.current.changeIdea("idea-0", "mine"));

            arrive(result, [
                { id: "idea-9", text: "added above" },
                { id: "idea-0", text: "first" },
            ]);

            expect(textsFor(result)).toEqual(["added above", "mine"]);
            expect(mockNotify).not.toHaveBeenCalled();
        });

        it("says nothing about a commit of its own coming back from the server", async () => {
            mockedAPIClient.updateIdea.mockResolvedValue(makeState(3, ideas("mine")));
            const { result } = render();
            arrive(result, ideas("first"));
            act(() => result.current.changeIdea("idea-0", "mine"));
            await act(async () => result.current.commitIdea("idea-0"));

            // The reply carries the text the commit just wrote.
            arrive(result, [{ id: "idea-0", text: "mine" }]);

            expect(mockNotify).not.toHaveBeenCalled();
            expect(textsFor(result)).toEqual(["mine"]);
        });

        it("gives up an edit whose idea was removed by somebody else", () => {
            const { result } = render();
            arrive(result, ideas("first", "second"));
            act(() => result.current.changeIdea("idea-0", "mine"));

            arrive(result, [{ id: "idea-1", text: "second" }]);

            expect(textsFor(result)).toEqual(["second"]);
            expect(mockNotify).toHaveBeenCalledWith("An idea you were editing was removed by someone else.");
        });

        it("leaves an edit in another project's inbox untouched", () => {
            const { result } = render();
            arriveView(
                result,
                makeView(makeState(1, ideas("pack"), TRIP), makeState(1, [{ id: "h-1", text: "paint" }], HOUSE)),
            );
            act(() => result.current.changeIdea("h-1", "paint the hall"));

            // Only Trip's list arrives; nothing here bears on House's edit.
            arrive(result, ideas("pack", "book flights"), TRIP);

            expect(textsFor(result, HOUSE)).toEqual(["paint the hall"]);
            expect(mockNotify).not.toHaveBeenCalled();
        });

        it("does not warn about edits that promoting the whole inbox just cleared", async () => {
            mockedAPIClient.promoteAllIdeas.mockResolvedValue(makeState(3, []));
            const { result } = render();
            arrive(result, ideas("first", "second"));
            act(() => result.current.changeIdea("idea-0", "mine"));

            await act(async () => result.current.addAllIdeasToPlan(TRIP));
            arrive(result, []);

            expect(mockNotify).not.toHaveBeenCalled();
        });
    });
});
