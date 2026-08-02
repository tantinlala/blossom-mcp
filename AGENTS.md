# Rules

## Answering Questions

When I ask a question about code, do not edit the code. Instead, provide a response that explains the code or answers the question. If you need to provide an example, create a new code block with the example code.

## Implementing New Functionality

For brand new features, prefer to implement new functionality in its own module file and update existing application code to use the new module.

For minor changes, just modify existing application code.

After implementing new functionality, do the following in order:

1. Check first whether there are existing unit test files corresponding to the files that you changed.
2. If there are existing unit test files, update those files to reflect changes that you've implemented.
3. If no unit test files exist, create new unit test file(s) for what you've implemented.
4. After updating / creating unit tests, run the tests and fix any test failures. You can run tests by running `yarn workspace @blossom/<name of package> test --watchAll=false` from the root directory of the repository.
5. When significant changes to the application architecture are made, update relevant documentation inside the [docs](../docs) folder after having confirmed that the implemented functionality works as intended. Do not document minor changes e.g. style changes.
6. Summarize what you have done in a changelog.md file in the root of the repository. Newest changes should be at the top of the file.

## Describe Only What Exists

Documentation, comments, and tests describe the code as it is now. Never describe it by contrast with something it is not.

**The test to apply to every sentence you write:** if a reader had never seen any other version of this code, any other way of building it, or any other tool, would the sentence still make sense and still be useful? If it only lands for someone who knows what came before or what the alternative was, cut it and say the positive thing instead.

### Never contrast with an alternative

This holds for **every** alternative, not only features this app once had. A browser API, a library, another approach, a rejected design, a hypothetical — all of them are out. The reader is here to learn what the code does.

Banned connectives, wherever the other side of the comparison is not a thing this code currently does: `rather than`, `instead of`, `in place of`, `as opposed to`, `unlike`, `no longer`, `used to`, `previously`, `formerly`, `now also`, `still`, `there is no`, `is not supported`, `does not have`, `ported from`, `carried over from`, `replaces`.

Worked example. This is wrong, even though `window.confirm` is a browser API and not something the app ever shipped:

```ts
/** Asks the user a yes/no question, in the app rather than through a browser dialog. */
```

The reader does not need to know what this is not. Write:

```ts
/** Asks the user a yes/no question and resolves to their answer. */
```

Where a design choice genuinely needs justifying, justify it in terms of what happens, not what was avoided. "Deliberately non-blocking, since the trigger is usually somebody else's activity" is fine. "…because an `alert()` would freeze the tab" is not: it invites the reader to think the code once did that.

### Never appeal to history

There is no earlier version as far as the code is concerned. Do not write "used to", "previously", "no longer works this way", "was replaced by", "ported from", "carried over from". A reader cannot check a claim about a version they cannot see, and it rots the moment the code moves again.

### Never test for absence

Do not assert that a removed feature is gone. Delete the tests that covered it, and delete the setup that only served it — stubs, mocks, fixtures, `beforeEach` lines. Test names state present behaviour: `submits on Enter`, not `submits on Enter, as the native prompt did`.

### Delete rather than orphan

Types, props, helpers, constants, CSS, and test utilities that existed only to serve removed functionality get deleted, not left unused.

### Two things that are legitimate

- **Contrasting two things that both exist here now.** "Snapshots bypass the version guard that `state` frames are subject to" is fine: both frame types are real and a reader meets both.
- **Runtime conditions.** "The task no longer exists", "the row no longer holds the expected text" describe state at run time, not a past release.

### Scope

The changelog is the one exception: it is a historical record, so it says what changed and what was removed.

When you remove anything, sweep the whole repository for references to it before you call the work done — not just the files you edited, and not just source: docs, comments, test names and test setup all count. Grep for the feature's name, for the names of anything it was built out of, and for the banned connectives above. Search for the bare word, not a phrase: "ported from" misses "they port".

Prove the sweep ran before trusting a clean result. A grep whose file list came out empty, or whose flags the local `grep`/`xargs` rejected, prints nothing and looks exactly like a repository with nothing to find. Check it finds a string you know is there.

## Installing New Dependencies

If you need to install any new dependencies, prefer to install the dependency in the subpackage that needs it. For example, run `yarn workspace @blossom/<name of package> add <dependency name>` in the root directory of the repository.

## Updating and Fixing Unit Tests

If I ask you to fix failing unit tests:

1. First run the tests by running `yarn workspace @blossom<name of package> test --watchAll=false` from the root directory of the repository.
2. Look through the test output to understand the failures
3. Look at the corresponding file for the code under test (e.g. if App.test.tsx is where the failure occurred, the code under test should be in App.tsx)
4. Summarize your understanding of how the functionality in the module is meant to work.
5. Make changes (either in the code under test or the test itself) to ensure that the unit tests pass and that they test the desired behavior.

## Version Control

Never stage, commit, push, or otherwise write to git history on your own initiative. This includes `git add`, `git commit`, `git push`, `git rebase`, branch creation, and anything that opens or updates a pull request. Finishing a task, getting the tests green, and addressing review feedback are none of them reasons to commit.

Do these only when I ask for them in that message, and do only what I asked: "commit" does not imply push, and "push" does not imply opening a PR.

When work is finished, leave the changes in the working tree and tell me what changed. I will decide what gets committed and when.

Read-only git commands — `git status`, `git diff`, `git log`, `git show` — are always fine.

## Code Style

This project uses Prettier for code formatting. Please ensure that your code adheres to the rules defined in the [.prettierrc](../.prettierrc) file in the root of the repository.
