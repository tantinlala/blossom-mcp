// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";

/**
 * Gives the test DOM a pointer event class, so a fired pointer event carries the
 * coordinates and the button pressed through to the handlers under test.
 */
class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
    }
}

window.PointerEvent = TestPointerEvent as unknown as typeof window.PointerEvent;
