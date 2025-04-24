# OpenAPI Generator CLI - Code Structure Plan

This document outlines the proposed module structure for the Node.js CLI tool that generates OpenAPI schemas from a repository.

## Core Modules

1.  **`src/cli.js` (Entry Point)**
    *   **Responsibilities:**
        *   Sets up the Node.js environment (shebang).
        *   Imports and configures `yargs` for command-line argument parsing.
        *   Defines CLI arguments (`--output-dir`, `--output-file`, `--ignore-file`, `--retry-attempts`, etc.).
        *   Loads configuration using the `config` module.
        *   Orchestrates the main workflow by calling other modules in sequence:
            *   Scan repository (`fileScanner`).
            *   Detect framework (`frameworkDetector`).
            *   Prompt user for confirmation.
            *   Interact with LLM for planning (`llmPlanner`).
            *   Interact with LLM for generation (`llmGenerator`).
            *   Write schema files (`fileWriter`).
            *   Generate git patch (`gitUtils`).
        *   Handles top-level errors and displays user feedback/results.

2.  **`src/config.js`**
    *   **Responsibilities:**
        *   Loads environment variables from a `.env` file using `dotenv`.
        *   Provides functions to access configuration values (API Key, API Base URL).
        *   Allows overriding `.env` values with corresponding CLI arguments.
        *   Exports configuration settings (e.g., API key, base URL, retry attempts, temperature settings).

3.  **`src/fileScanner.js`**
    *   **Responsibilities:**
        *   Recursively scans the current working directory or a specified target directory.
        *   Reads and parses `.gitignore` rules.
        *   Reads and parses custom ignore rules from the file specified by `--ignore-file` (default: `.openapigenignore`).
        *   Filters the list of files based on both sets of ignore rules.
        *   Reads the content of all allowed files.
        *   Concatenates the content into a single string or buffer (the "repomix").
        *   Exports a function that returns the list of included file paths and the combined "repomix" content.

4.  **`src/frameworkDetector.js`**
    *   **Responsibilities:**
        *   Analyzes the list of included file paths (provided by `fileScanner`).
        *   Looks for common indicators of frameworks/languages (e.g., `package.json`, `pom.xml`, `requirements.txt`, common file extensions like `.py`, `.java`, `.js`, `.go`).
        *   Implements heuristics to determine the most likely primary framework/language.
        *   Exports a function that takes the file list and returns the detected framework name (e.g., "Node.js/Express", "Python/Flask", "Java/Spring"). Returns `null` or "Unknown" if detection fails.

5.  **`src/llmPlanner.js`**
    *   **Responsibilities:**
        *   Constructs the prompt for the LLM to plan the OpenAPI file structure. Includes "repomix", detected framework, and output file/dir constraints.
        *   Communicates with the OpenAI-compatible API endpoint (using details from `config`).
        *   Handles API requests and responses for the planning phase.
        *   Parses the LLM response to extract the list of required file paths.
        *   Implements basic validation and error handling for the planning response.
        *   Exports a function that takes the "repomix" and framework, and returns the list of planned file paths.

6.  **`src/llmGenerator.js`**
    *   **Responsibilities:**
        *   Iterates through the list of planned file paths provided by `llmPlanner`.
        *   For each file path:
            *   Constructs the prompt for the LLM to generate the specific file's YAML content. Includes "repomix", framework, full file plan, and the target file path.
            *   Manages the request loop with retries and temperature adjustments based on `config`.
            *   Communicates with the OpenAI-compatible API endpoint.
            *   Validates the received YAML content using `js-yaml`.
            *   Handles API errors and retry logic.
        *   Exports a function that takes the "repomix", framework, and file plan, and returns a map of `filePath` to generated YAML content. Throws an error if any file generation fails permanently.

7.  **`src/fileWriter.js`**
    *   **Responsibilities:**
        *   Takes the map of file paths and generated YAML content from `llmGenerator`.
        *   Takes the target output directory from `config`/CLI args.
        *   Ensures the output directory (and any necessary subdirectories based on the file paths) exists, creating them if needed (`fs.mkdirSync` with `recursive: true`).
        *   Writes each generated YAML content to its corresponding file path within the output directory.
        *   Handles potential file system errors.
        *   Exports a function to perform the writing operation.

8.  **`src/gitUtils.js`**
    *   **Responsibilities:**
        *   Uses Node.js `child_process.execSync` to run `git` commands.
        *   Stages the entire output directory (`git add [outputDir]`).
        *   Generates the patch file (`git diff --staged > openapi_changes.patch`).
        *   Includes error handling for cases where the target directory is not a git repository or `git` commands fail.
        *   Exports functions for staging and creating the patch.

## Utility Modules (Optional)

*   **`src/utils/logger.js`**: Simple logging utility for consistent console output (info, warnings, errors).
*   **`src/utils/ignoreParser.js`**: Logic specifically for parsing `.gitignore` style patterns, potentially using an existing library.

This structure promotes separation of concerns and makes the codebase easier to understand, maintain, and test.
