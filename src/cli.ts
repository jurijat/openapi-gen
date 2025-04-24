#!/usr/bin/env node

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
// import path from 'path'; // path is unused, remove import
import readline from "readline"; // For user confirmation

// Import core modules using ES module syntax
// Note: These will show errors until the corresponding files are updated to use 'export'
import { loadConfig } from "./config";
import { scanRepository } from "./fileScanner";
import { detectFramework } from "./frameworkDetector";
import { detectApis } from "./apiDetector"; // Import the new detector
import { planFileStructure } from "./llmPlanner";
import { generateSchemaFiles } from "./llmGenerator";
import { writeSchemaFiles } from "./fileWriter";
import { mergeSchemaFiles } from "./schemaMerger"; // Import the schema merger
import { generatePatch, PATCH_FILE_NAME } from "./gitUtils";

// Define an interface for the expected argv structure based on yargs options
// Export the interface so it can be used by other modules (like config.ts)
export interface Argv {
  [x: string]: unknown;
  outputDir: string;
  outputFile: string;
  ignoreFile: string;
  retryAttempts: number;
  temperatureIncrement: number;
  initialTemperature: number;
  apiKey: string | undefined; // Can be undefined if not provided
  apiBase: string | undefined; // Can be undefined if not provided
  apiBaseModel: string | undefined; // Can be undefined if not provided
  consolidatedOutput: string | undefined; // Can be undefined if not provided
  yes: boolean;
  _: (string | number)[];
  $0: string;
}

// --- Argument Parsing ---
// Explicitly type argv using the interface
const argv = yargs(hideBin(process.argv))
  .options({
    "output-dir": {
      alias: "o",
      type: "string",
      description: "Directory to output the OpenAPI schema files",
      default: "openapi",
    },
    "output-file": {
      alias: "f",
      type: "string",
      description: "Name of the main OpenAPI entry file",
      default: "schema.yaml",
    },
    "ignore-file": {
      alias: "i",
      type: "string",
      description: "Custom ignore file (gitignore syntax)",
      default: ".openapigenignore",
    },
    "retry-attempts": {
      type: "number",
      description: "Number of retry attempts for LLM calls",
      default: 3,
    },
    "temperature-increment": {
      type: "number",
      description: "Temperature increment per retry attempt",
      default: 0.1,
    },
    "initial-temperature": {
      type: "number",
      description: "Initial temperature for LLM calls",
      default: 0,
    },
    "api-key": {
      type: "string",
      description: "AI API Key (overrides .env)",
    },
    "api-base": {
      type: "string",
      description: "AI API Base URL (overrides .env)",
    },
    "api-base-model": {
      type: "string",
      description: "AI Base model (overrides .env)",
    },
    "consolidated-output": {
      type: "string",
      description:
        "Name of the consolidated JSON output file (e.g., openapi-v3.json)",
      default: "openapi-v3.json",
    },

    yes: {
      alias: "y",
      type: "boolean",
      description: "Skip user confirmation prompt",
      default: false,
    },
  })
  .usage("Usage: $0 [options]")
  .help()
  .alias("help", "h")
  .strict() // Enforce validation
  .parseSync() as Argv; // Use parseSync and cast to Argv

// --- Main Execution Logic ---
async function main() {
  console.log("Starting OpenAPI Generator...");

  try {
    // 1. Load Configuration
    const config = loadConfig(argv); // Pass parsed args to config loader
    // TODO: Ensure config object is fully populated after implementing loadConfig
    console.log("Effective config:", config); // Debug log

    // 2. Scan Repository
    const { includedFiles, repomixContent } = scanRepository(
      process.cwd(),
      config.ignoreFile,
      config.outputDir
    );
    if (includedFiles.length === 0) {
      console.log("No files found to process based on ignore rules. Exiting.");
      return;
    }
    // TODO: Handle potential errors from scanRepository

    // 3. Detect Framework
    const detectedFramework = detectFramework(includedFiles);
    // TODO: Handle potential errors from detectFramework

    // 4. API Detection using LLM
    const apiDetectionResult = await detectApis(
      config,
      repomixContent,
      detectedFramework
    );
    console.log("\n--- API Detection Result ---");
    console.log(`APIs Detected: ${apiDetectionResult.hasApis ? "Yes" : "No"}`);
    if (apiDetectionResult.hasApis) {
      console.log(`  Type: ${apiDetectionResult.apiType || "Unknown"}`);
      console.log(
        `  Approx. Endpoints: ${apiDetectionResult.endpointCount ?? "N/A"}`
      );
      console.log(
        `  Key Resources: ${
          apiDetectionResult.keyResources?.join(", ") || "N/A"
        }`
      );
      console.log(
        `  Auth Mechanism: ${apiDetectionResult.authMechanism || "N/A"}`
      );
    }
    console.log(
      `  Confidence: ${(apiDetectionResult.confidence * 100).toFixed(0)}%`
    );
    console.log(`  Reasoning: ${apiDetectionResult.reasoning}`);
    console.log("---------------------------");

    // Exit if no APIs are detected
    if (!apiDetectionResult.hasApis) {
      console.log("No APIs detected in the codebase. Exiting.");
      return;
    }

    // 5. User Confirmation for Schema Generation
    console.log("\n--- Schema Generation ---");
    console.log(`Detected Framework: ${detectedFramework}`);
    console.log(`Files included: ${includedFiles.length}`);
    console.log(`Output Directory: ${config.outputDir}`);
    console.log(`Output Directory: ${config.outputDir}`);
    console.log(`Main Schema File: ${config.outputFile}`);
    console.log("-------------------------");

    if (!argv.yes) {
      const proceed = await askForConfirmation(
        "Proceed with OpenAPI schema generation? (y/N): "
      );
      if (!proceed) {
        console.log("Operation cancelled by user.");
        return;
      }
    }

    // 6. LLM Planning (Schema Structure)
    const plannedFiles = await planFileStructure(
      config,
      repomixContent,
      detectedFramework
    );
    // TODO: Handle potential errors from planFileStructure

    // 7. LLM Generation (Individual Files)
    const generatedContentMap = await generateSchemaFiles(
      config,
      repomixContent,
      detectedFramework,
      plannedFiles
    );
    // TODO: Handle potential errors from generateSchemaFiles

    // 8. Write Schema Files
    writeSchemaFiles(config.outputDir, generatedContentMap);
    // TODO: Handle potential errors from writeSchemaFiles

    // 9. Merge Schema Files into a consolidated JSON file
    if (config.consolidatedOutput) {
      console.log(
        `\nGenerating consolidated schema file: ${config.consolidatedOutput}`
      );
      const mergeResult = await mergeSchemaFiles(
        config,
        Array.from(generatedContentMap.keys())
      );
      if (mergeResult.success) {
        console.log(
          `Successfully created consolidated schema: ${mergeResult.consolidatedFilePath}`
        );
      } else {
        console.warn(`Warning: Failed to create consolidated schema file.`);
      }
    }

    // 10. Generate Git Patch
    const patchFilePath = generatePatch(config.outputDir);
    // TODO: Handle potential errors from generatePatch (e.g., null return)

    // 10. Completion Message
    console.log("\n✅ OpenAPI schema generation process complete!");
    if (patchFilePath) {
      console.log(`   Staged changes saved to: ${PATCH_FILE_NAME}`);
    } else {
      console.log(`   Schema files written to: ${config.outputDir}`);
      console.log(
        "   (Skipped patch generation as this is not a git repository or an error occurred)"
      );
    }
  } catch (error) {
    // Type guard for error message
    if (error instanceof Error) {
      console.error("\n❌ An error occurred:", error.message);
    } else {
      console.error("\n❌ An unknown error occurred:", error);
    }
    // console.error(error.stack); // Optional: more detailed stack trace
    process.exit(1); // Exit with error code
  }
}

// Helper for user confirmation
function askForConfirmation(question: string): Promise<boolean> {
  // Add type for question and return Promise
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      // Add type for answer
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// --- Run Main Function ---
main();
