import dotenv from "dotenv";
import path from "path";
import { Argv } from "./cli"; // Import the Argv interface from cli.ts

// Define an interface for the config object
export interface AppConfig {
  apiKey: string | null;
  apiBaseUrl: string | null;
  apiBaseModel: string | null;
  outputDir: string;
  outputFile: string;
  ignoreFile: string;
  retryAttempts: number;
  temperatureIncrement: number;
  initialTemperature: number;
  consolidatedOutput: string | null; // Name of the consolidated JSON output file
}

// Load .env file from the current working directory (where the CLI is run)
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Add type annotation for argv and return type
export function loadConfig(argv: Argv): AppConfig {
  console.log("Loading configuration...");

  // Explicitly type the config object
  const config: AppConfig = {
    // API details: Prioritize CLI args, then .env, then defaults/null
    apiKey: argv.apiKey || process.env.AI_API_KEY || null,
    apiBaseUrl: argv.apiBase || process.env.AI_BASE_URL || null,
    apiBaseModel: argv.apiBaseModel || process.env.AI_BASE_MODEL || "gpt-4o", // Add default model

    // Other settings from argv (which have defaults set in yargs)
    outputDir: argv.outputDir,
    outputFile: argv.outputFile,
    ignoreFile: argv.ignoreFile,
    retryAttempts: argv.retryAttempts,
    temperatureIncrement: argv.temperatureIncrement,
    initialTemperature: argv.initialTemperature,
    // Handle the consolidated output option (kebab-case to camelCase conversion)
    consolidatedOutput: (argv["consolidated-output"] as string) || null,
  };

  // Basic validation/warning for API key
  if (!config.apiKey) {
    console.warn(
      "Warning: AI_API_KEY not found in .env file or provided via --api-key."
    );
    // Depending on whether the LLM step is reached, this might become an error later.
  }
  if (!config.apiBaseUrl) {
    console.warn(
      "Warning: AI_API_BASE not found in .env file or provided via --api-base."
    );
    // We might default this later in the LLM modules if null
  }

  console.log("Configuration loaded.");
  // console.log('Effective config:', config); // Optional: Debug logging

  return config;
}

// No need for module.exports with ES modules
