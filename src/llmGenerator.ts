import yaml from "js-yaml";
import { callLlmApi } from "./llmPlanner"; // Import the helper
import { AppConfig } from "./config"; // Import AppConfig interface

// Define and export return type
export type GeneratedContentMap = Map<string, string>;

// Add type annotations for parameters and return type
export async function generateSchemaFiles(
  config: AppConfig,
  repomixContent: string,
  detectedFramework: string,
  plannedFiles: string[]
): Promise<GeneratedContentMap> {
  console.log("Generating individual OpenAPI files with LLM...");
  const generatedContentMap: GeneratedContentMap = new Map();

  // Limit repomix size for generation prompts as well
  const maxRepomixLength: number = 100000; // Same limit as planner for consistency
  let truncatedRepomix = repomixContent; // Use a different variable for the potentially truncated content
  if (repomixContent.length > maxRepomixLength) {
    console.warn(
      `Warning: Repomix content truncated to ${maxRepomixLength} characters for LLM generation prompts.`
    );
    truncatedRepomix = repomixContent.substring(0, maxRepomixLength);
  }

  for (const filePath of plannedFiles) {
    console.log(`Generating content for: ${filePath}`);
    let success: boolean = false;
    let lastError: Error | null = null; // Type lastError

    for (let attempt = 0; attempt < config.retryAttempts; attempt++) {
      const currentTemperature: number =
        config.initialTemperature + attempt * config.temperatureIncrement;
      console.log(
        `  Attempt ${attempt + 1}/${
          config.retryAttempts
        } with temperature ${currentTemperature.toFixed(2)}`
      );

      // Construct the prompt for the LLM generator for this specific file
      const prompt: string = `Given the full ${detectedFramework} codebase context snippet below:
      \n\n\`\`\`\n${truncatedRepomix}\n\`\`\`\n\n
      
      And the planned OpenAPI file structure:\n
      ${plannedFiles.join("\n")}\n\n
      
      Generate *only* the valid OpenAPI 3.x YAML content WITHOUT CODE BLOCKS for the specific file: '${filePath}'. 
      
      Ensure it uses relative '$ref' appropriately to link to other planned files (e.g., '$ref: ./components/schemas/User.yaml'). 
      
      Output *only* the raw YAML content for '${filePath}'. 
      
      Do not include explanations OR CODE BLOCKS, comments outside the YAML, or markdown formatting.`;

      try {
        // Make API call using the helper (callLlmApi already uses config.apiBaseModel)
        const rawResponse: string = await callLlmApi(
          config,
          prompt,
          currentTemperature
        );

        // --- Add logic to strip Markdown code fences ---
        // Regex to find ```yaml ... ``` or ``` ... ```, capturing the content inside
        const codeBlockRegex = /^```(?:yaml|yml)?\s*([\s\S]*?)\s*```$/;
        const match = rawResponse.match(codeBlockRegex);

        // Use optional chaining to safely access the captured group
        const yamlContent = match?.[1];
        // Use the captured content if available, otherwise use the raw response
        const cleanedYaml: string = yamlContent
          ? yamlContent.trim()
          : rawResponse.trim();
        // --- End of stripping logic ---

        // Basic check if response looks like YAML before parsing
        if (!cleanedYaml || !cleanedYaml.includes(":")) {
          // Log the cleaned response for debugging if it fails the basic check
          console.error(
            "Cleaned response does not appear to be valid YAML:",
            cleanedYaml
          );
          throw new Error(
            "LLM response (after cleaning) does not appear to be valid YAML."
          );
        }

        // Validate YAML using the cleaned content
        yaml.load(cleanedYaml); // Throws error on invalid YAML

        console.log(
          `  Successfully generated and validated YAML for ${filePath}`
        );
        // Store the *cleaned* YAML content
        generatedContentMap.set(filePath, cleanedYaml);
        success = true;
        break; // Exit retry loop on success
      } catch (error: unknown) {
        // Type catch block error as unknown
        // Don't log the full error object here, callLlmApi already logs details
        // Use type guard
        if (error instanceof Error) {
          console.error(
            `  Attempt ${attempt + 1} failed for ${filePath}: ${error.message}`
          );
          lastError = error; // Store the error object
        } else {
          console.error(
            `  Attempt ${attempt + 1} failed for ${filePath}: Unknown error`
          );
          lastError = new Error("Unknown error during generation"); // Create a generic error
        }
        // Add a small delay before retrying? (Optional)
        // await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (!success) {
      console.error(
        `Failed to generate content for ${filePath} after ${config.retryAttempts} attempts.`
      );
      // Include last error message if available
      throw new Error(
        `Failed to generate ${filePath}. Last error: ${
          lastError?.message || "Unknown error"
        }`
      );
    }
  }

  console.log("Finished generating all schema files.");
  return generatedContentMap;
}

// No need for module.exports with ES modules
