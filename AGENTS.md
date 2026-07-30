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

## Installing New Dependencies

If you need to install any new dependencies, prefer to install the dependency in the subpackage that needs it. For example, run `yarn workspace @blossom/<name of package> add <dependency name>` in the root directory of the repository.

## Updating and Fixing Unit Tests

If I ask you to fix failing unit tests:

1. First run the tests by running `yarn workspace @blossom<name of package> test --watchAll=false` from the root directory of the repository.
2. Look through the test output to understand the failures
3. Look at the corresponding file for the code under test (e.g. if App.test.tsx is where the failure occurred, the code under test should be in App.tsx)
4. Summarize your understanding of how the functionality in the module is meant to work.
5. Make changes (either in the code under test or the test itself) to ensure that the unit tests pass and that they test the desired behavior.

## Code Style

This project uses Prettier for code formatting. Please ensure that your code adheres to the rules defined in the [.prettierrc](../.prettierrc) file in the root of the repository.
