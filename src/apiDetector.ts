import { AppConfig } from "./config";
import { callLlmApi } from "./llmPlanner"; // Reuse the API call helper

// Define the expected structure of the LLM's JSON response
export interface ApiDetectionResult {
  hasApis: boolean;
  apiType: string | null;
  endpointCount: number | null;
  keyResources: string[] | null;
  authMechanism: string | null;
  confidence: number; // 0-1 scale
  reasoning: string;
}

// Function to call the LLM for API detection
export async function detectApis(
  config: AppConfig,
  repomixContent: string,
  detectedFramework: string
): Promise<ApiDetectionResult> {
  console.log("Detecting APIs in the codebase using LLM...");

  // Limit repomix size
  const maxRepomixLength: number = 100000; // Consistent with other LLM calls
  let truncatedRepomix = repomixContent;
  if (repomixContent.length > maxRepomixLength) {
    console.warn(
      `Warning: Repomix content truncated to ${maxRepomixLength} characters for API detection prompt.`
    );
    truncatedRepomix = repomixContent.substring(0, maxRepomixLength);
  }

  const prompt = `Analyze the following codebase for a ${detectedFramework} project:

\`\`\`
${truncatedRepomix}
\`\`\`

Determine if this codebase contains API endpoints. If it does:
1. What type of APIs are present (e.g., REST, GraphQL)?
2. Approximately how many endpoints exist?
3. What are the key resources/entities exposed by these APIs?
4. Are there any obvious authentication/authorization mechanisms mentioned (e.g., JWT, OAuth, API Keys)?

Return your analysis only as pure JSON object without code blocks like \`\`\`json format with the following structure:
{
  "hasApis": boolean,
  "apiType": string | null,
  "endpointCount": number | null,
  "keyResources": string[] | null,
  "authMechanism": string | null,
  "confidence": number, // 0-1 scale of confidence in this assessment
  "reasoning": string // Brief explanation of your assessment
}`;

  try {
    // Use a moderate temperature for analysis
    const rawResponse = await callLlmApi(config, prompt, 0.3);

    // --- Add logic to strip Markdown code fences for JSON ---
    // Regex to find ```json ... ``` or ``` ... ```, capturing the content inside
    const codeBlockRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/;
    const match = rawResponse.match(codeBlockRegex);

    // Use optional chaining to safely access the captured group
    const jsonContent = match?.[1];
    // Use the captured content if available, otherwise use the raw response
    const cleanedJsonString: string = jsonContent
      ? jsonContent.trim()
      : rawResponse.trim();
    // --- End of stripping logic ---

    // Attempt to parse the cleaned JSON response
    const result: ApiDetectionResult = JSON.parse(cleanedJsonString);

    // Basic validation of the parsed structure
    if (
      typeof result.hasApis !== "boolean" ||
      typeof result.confidence !== "number"
    ) {
      throw new Error(
        "LLM response for API detection is missing required fields or has incorrect types."
      );
    }

    console.log("API detection complete.");
    return result;
  } catch (error: unknown) {
    console.error(`Error during LLM API detection phase.`);
    if (error instanceof SyntaxError) {
      console.error("Failed to parse LLM response as JSON.");
    }
    // Log specific error message if available
    if (error instanceof Error) {
      console.error(error.message);
      throw new Error(`API detection failed: ${error.message}`);
    } else {
      throw new Error(`API detection failed: Unknown error`);
    }
  }
}
