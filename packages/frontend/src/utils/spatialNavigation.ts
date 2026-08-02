/** Which way the keyboard is moving across the canvas. */
export type Direction = "left" | "right" | "up" | "down";

/** A task's place on the canvas, as a single point. */
export interface TaskPoint {
    id: string;
    x: number;
    y: number;
}

// How much a task off to the side counts against it. At 2, a task straight
// ahead is preferred to one the same distance away but half as far sideways.
const SIDEWAYS_WEIGHT = 2;

/** How far a point is along the way being travelled, in canvas units. */
const along = (point: TaskPoint, direction: Direction): number => {
    switch (direction) {
        case "right":
            return point.x;
        case "left":
            return -point.x;
        case "down":
            return point.y;
        case "up":
            return -point.y;
    }
};

/** How far a point sits to either side of the way being travelled. */
const across = (point: TaskPoint, direction: Direction): number =>
    direction === "left" || direction === "right" ? point.y : point.x;

/**
 * The task to move to from `fromId`, or null when there is nothing that way.
 *
 * Candidates are the tasks that lie in the given direction at all. The one
 * chosen is the nearest of those, with sideways distance weighed more heavily
 * than distance ahead, so a task straight ahead beats one further off to one
 * side. Starting from nothing selected picks the task furthest back along the
 * way being travelled, which is the one a person pressing that key is heading
 * away from.
 */
export const nextTaskInDirection = (
    points: TaskPoint[],
    fromId: string | null,
    direction: Direction,
): string | null => {
    const from = fromId === null ? undefined : points.find((point) => point.id === fromId);

    if (!from) {
        let entry: TaskPoint | null = null;
        points.forEach((point) => {
            if (!entry || along(point, direction) < along(entry, direction)) {
                entry = point;
            }
        });
        return entry === null ? null : (entry as TaskPoint).id;
    }

    let bestId: string | null = null;
    let bestScore = Infinity;

    points.forEach((point) => {
        if (point.id === from.id) {
            return;
        }
        const ahead = along(point, direction) - along(from, direction);
        if (ahead <= 0) {
            return;
        }
        const sideways = Math.abs(across(point, direction) - across(from, direction));
        const score = ahead + SIDEWAYS_WEIGHT * sideways;
        if (score < bestScore) {
            bestScore = score;
            bestId = point.id;
        }
    });

    return bestId;
};
