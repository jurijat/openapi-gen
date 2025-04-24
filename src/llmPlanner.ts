import axios, { AxiosError } from "axios"; // Import AxiosError type
import path from "path";
import { AppConfig } from "./config"; // Import AppConfig interface

// Define structure for LLM API response (adjust based on actual API)
interface LlmApiResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
  // Add other potential fields if needed
}

// Helper function for making LLM API calls
// Add type annotations for parameters and return type
export async function callLlmApi(
  config: AppConfig,
  prompt: string,
  temperature: number
): Promise<string> {
  if (!config.apiKey) {
    throw new Error(
      "API Key is missing. Please provide AI_API_KEY in .env or via --api-key."
    );
  }

  const apiUrl: string = config.apiBaseUrl!; // Default if not set

  try {
    // Explicitly type the response using LlmApiResponse
    const response = await axios.post<LlmApiResponse>(
      apiUrl,
      {
        model: config.apiBaseModel || "gpt-4o", // Use configured model or default
        messages: [{ role: "user", content: prompt }],
        temperature: temperature,
        // max_tokens: 1000, // Consider adding token limits if needed
      },
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 60000, // 60 second timeout
      }
    );
    // Check response structure more carefully
    if (response.data?.choices?.[0]?.message?.content) {
      return response.data.choices[0].message.content.trim();
    } else {
      console.error("Invalid response structure received:", response.data);
      throw new Error("Invalid response structure from LLM API");
    }
  } catch (error: unknown) {
    // Type catch block error as unknown
    let errorMessage: string;
    // Use type guard for AxiosError
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError; // Cast for easier access
      if (axiosError.response) {
        // Include more details from the API error response if available
        errorMessage = `API Error (${
          axiosError.response.status
        }): ${JSON.stringify(axiosError.response.data)}`;
      } else if (axiosError.request) {
        errorMessage = "API Error: No response received from server.";
      } else {
        // Should not happen with AxiosError, but handle just in case
        errorMessage = axiosError.message;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = "An unknown error occurred during the API call.";
    }
    console.error(`LLM API call failed: ${errorMessage}`);
    throw new Error(`LLM API call failed: ${errorMessage}`);
  }
}

// Add type annotations for parameters and return type
export async function planFileStructure(
  config: AppConfig,
  repomixContent: string,
  detectedFramework: string
): Promise<string[]> {
  console.log("Planning OpenAPI file structure with LLM...");

  // Limit repomix size to avoid overly large prompts (e.g., ~200k chars)
  const maxRepomixLength: number = 200000;
  let truncatedRepomix = repomixContent; // Use a different variable for the potentially truncated content
  if (repomixContent.length > maxRepomixLength) {
    console.warn(
      `Warning: Repomix content truncated to ${maxRepomixLength} characters for LLM planning prompt.`
    );
    truncatedRepomix = repomixContent.substring(0, maxRepomixLength);
  }

  const prompt: string = `Based on the following ${detectedFramework} codebase snippet:\n\n\`\`\`\n${truncatedRepomix}\n\`\`\`\n\nPropose a list of relative file paths for YAML files required to represent the complete OpenAPI 3.x schema using $ref. The main file must be '${path.join(
    config.outputDir,
    config.outputFile
  )}'. Organize component files logically within the '${
    config.outputDir
  }' directory (e.g., '${config.outputDir}/components/schemas/User.yaml', '${
    config.outputDir
  }/paths/users.yaml'). Provide *only* the list of relative file paths, one path per line, starting with the main file. Do not include any other text, explanations, or formatting.`;

  console.log("Sending planning prompt to LLM..."); // Less verbose logging

  try {
    // Use initial temperature for planning, no retries here for simplicity (can add later if needed)
    const responseContent: string = await callLlmApi(
      config,
      prompt,
      config.initialTemperature
    );

    // Parse the response - expecting one file path per line
    const plannedFiles: string[] = responseContent
      .split("\n")
      .map((line: string) => line.trim()) // Add type for line
      .filter(
        (line: string) =>
          line.length > 0 && (line.endsWith(".yaml") || line.endsWith(".yml"))
      ); // Add type for line, Basic validation

    if (plannedFiles.length === 0) {
      throw new Error("LLM did not return any valid file paths for the plan.");
    }

    // Ensure the main file is first, as requested
    const mainFilePath: string = path.join(config.outputDir, config.outputFile);
    if (!plannedFiles.includes(mainFilePath)) {
      console.warn(
        `Warning: LLM plan did not include the main file '${mainFilePath}'. Adding it to the beginning.`
      );
      plannedFiles.unshift(mainFilePath);
    } else if (plannedFiles[0] !== mainFilePath) {
      console.warn(
        `Warning: Main file '${mainFilePath}' was not first in the LLM plan. Reordering.`
      );
      plannedFiles.sort((a: string, b: string) =>
        a === mainFilePath ? -1 : b === mainFilePath ? 1 : 0
      ); // Add types for a, b
    }

    console.log("LLM proposed file structure:", plannedFiles);
    return plannedFiles;
  } catch (error: unknown) {
    // Type catch block error as unknown
    // Use type guard
    if (error instanceof Error) {
      console.error(`Error during LLM planning phase: ${error.message}`);
    } else {
      console.error(`Error during LLM planning phase: Unknown error`);
    }
    throw error; // Re-throw to be caught by main CLI logic
  }
}

// No need for module.exports with ES modules
