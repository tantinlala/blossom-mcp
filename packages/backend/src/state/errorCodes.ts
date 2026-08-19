import { CommandErrorCode } from "@blossom/common";
import { InvalidProjectNameError, ProjectNotFoundError } from "../models/project";
import {
    IdeaNotFoundError,
    InvalidBatchError,
    InvalidDependencyError,
    InvalidIndexError,
    InvalidMoveError,
    TaskNotFoundError,
    UndoBlockedError,
    VersionConflictError,
} from "./projectStore";
import {
    AmbiguousProjectError,
    NoAssistantProjectError,
    ProjectAlreadyOpenError,
    ProjectNotOpenError,
} from "./workspace";
import { InvalidCommandError, UnknownCommandError } from "./commands";

/**
 * What a failure means, in the one vocabulary both transports speak. HTTP
 * statuses alone would not do it: several distinct failures share a 409, so a
 * client reading only the status cannot tell a stale precondition from an undo
 * it is not allowed to make.
 */
const errorCode = (error: unknown): CommandErrorCode => {
    if (
        error instanceof TaskNotFoundError ||
        error instanceof IdeaNotFoundError ||
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectNotOpenError
    ) {
        return "not-found";
    }
    if (error instanceof UnknownCommandError) {
        return "unknown-command";
    }
    if (error instanceof VersionConflictError) {
        return "conflict";
    }
    if (error instanceof UndoBlockedError) {
        return "undo-blocked";
    }
    if (
        error instanceof InvalidCommandError ||
        error instanceof InvalidProjectNameError ||
        error instanceof InvalidDependencyError ||
        error instanceof InvalidMoveError ||
        error instanceof InvalidIndexError ||
        error instanceof InvalidBatchError ||
        error instanceof ProjectAlreadyOpenError ||
        error instanceof AmbiguousProjectError ||
        error instanceof NoAssistantProjectError
    ) {
        return "invalid";
    }
    return "internal";
};

const Status = {
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL: 500,
};

/** The HTTP status that carries a given failure. */
const errorStatus = (error: unknown): number => {
    switch (errorCode(error)) {
        case "not-found":
            return Status.NOT_FOUND;
        case "invalid":
        case "unknown-command":
            return Status.BAD_REQUEST;
        case "conflict":
        case "undo-blocked":
            return Status.CONFLICT;
        default:
            return Status.INTERNAL;
    }
};

export { errorCode, errorStatus, Status };
