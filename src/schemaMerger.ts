import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { AppConfig } from "./config";

// Define the return type for the merged schema
export interface MergedSchemaResult {
  consolidatedFilePath: string;
  success: boolean;
}

// Interface for tracking file references
interface FileReference {
  absolutePath: string;
  relativePath: string;
  content: any;
}

/**
 * Merges multiple OpenAPI YAML files with $ref links into a single consolidated JSON file
 * with all references fully resolved and inlined
 */
export async function mergeSchemaFiles(
  config: AppConfig,
  generatedFiles: string[]
): Promise<MergedSchemaResult> {
  console.log("Merging schema files into a consolidated OpenAPI document...");

  // Default consolidated output filename
  const consolidatedFileName = config.consolidatedOutput || "openapi-v3.json";
  const consolidatedFilePath = path.join(
    config.outputDir,
    consolidatedFileName
  );

  try {
    // 1. Read the main schema file (should be first in the list)
    const mainFilePath = generatedFiles[0];
    if (!mainFilePath) {
      throw new Error("No main schema file found in the generated files list");
    }

    console.log(`Using ${mainFilePath} as the main schema file`);

    // 2. Load all schema files into memory with both absolute and relative paths
    console.log("Loading all schema files...");
    const fileMap = new Map<string, FileReference>();
    const mainFileDir = path.dirname(mainFilePath);

    for (const filePath of generatedFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const schema = yaml.load(content);
        const absolutePath = path.resolve(filePath);

        // Store multiple path variations to make reference resolution more robust
        const fileRef: FileReference = {
          absolutePath,
          relativePath: path.relative(mainFileDir, filePath),
          content: schema,
        };

        // Store with both absolute and relative paths as keys
        fileMap.set(absolutePath, fileRef);
        fileMap.set(filePath, fileRef); // Original path
        fileMap.set(`./${path.relative(mainFileDir, filePath)}`, fileRef); // Relative with ./
        fileMap.set(path.relative(mainFileDir, filePath), fileRef); // Relative without ./

        console.log(`  Loaded: ${filePath}`);
      } catch (error) {
        console.warn(
          `  Warning: Could not read or parse ${filePath}, skipping`
        );
      }
    }

    // 3. Get the main schema
    const mainFileRef = fileMap.get(mainFilePath);
    if (!mainFileRef) {
      throw new Error("Failed to load main schema file");
    }
    const mainSchema = mainFileRef.content;

    // 4. Resolve all references in the main schema
    console.log("Resolving all references...");
    const resolvedSchema = resolveAllReferences(
      mainSchema,
      fileMap,
      mainFileDir
    );

    // 5. Write the consolidated schema to a JSON file
    console.log("Writing consolidated schema...");
    const jsonOutput = JSON.stringify(resolvedSchema, null, 2);
    fs.writeFileSync(consolidatedFilePath, jsonOutput, "utf8");

    console.log(
      `Successfully created consolidated schema: ${consolidatedFilePath}`
    );
    return {
      consolidatedFilePath,
      success: true,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error merging schema files: ${error.message}`);
    } else {
      console.error("Unknown error during schema merging");
    }
    return {
      consolidatedFilePath,
      success: false,
    };
  }
}

/**
 * Recursively resolves all $ref references in an OpenAPI schema object,
 * fully inlining all external references
 */
function resolveAllReferences(
  schema: any,
  fileMap: Map<string, FileReference>,
  basePath: string,
  visited = new Set<string>(),
  depth = 0
): any {
  // Create a deep clone of the schema to avoid modifying the original
  const result = deepClone(schema);

  // Process the cloned schema
  return processNode(result, fileMap, basePath, visited, depth);
}

/**
 * Process a node in the schema, resolving any references
 */
function processNode(
  node: any,
  fileMap: Map<string, FileReference>,
  basePath: string,
  visited = new Set<string>(),
  depth = 0
): any {
  // Base case: not an object or null
  if (typeof node !== "object" || node === null) {
    return node;
  }

  // Handle arrays
  if (Array.isArray(node)) {
    return node.map((item) =>
      processNode(item, fileMap, basePath, visited, depth + 1)
    );
  }

  // Handle objects with $ref
  if (node.$ref && typeof node.$ref === "string") {
    return resolveReference(node.$ref, fileMap, basePath, visited, depth);
  }

  // Process each property of the object
  const result: any = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] = processNode(value, fileMap, basePath, visited, depth + 1);
  }

  return result;
}

/**
 * Resolve a single reference
 */
function resolveReference(
  ref: string,
  fileMap: Map<string, FileReference>,
  basePath: string,
  visited = new Set<string>(),
  depth = 0
): any {
  // Handle internal references (keep them as is)
  if (ref.startsWith("#")) {
    return { $ref: ref };
  }

  // Check for circular references
  if (visited.has(ref)) {
    console.warn(`Warning: Circular reference detected for ${ref}`);
    return { description: `Circular reference to ${ref}` };
  }

  // Mark as visited
  visited.add(ref);

  // Try to resolve the reference
  // First, check if it's a direct match in our file map
  let fileRef = fileMap.get(ref);

  // If not found, try resolving as a path relative to basePath
  if (!fileRef) {
    const resolvedPath = path.resolve(basePath, ref);
    fileRef = fileMap.get(resolvedPath);

    // If still not found, try other path variations
    if (!fileRef) {
      // Try with ./ prefix
      if (!ref.startsWith("./")) {
        fileRef = fileMap.get(`./${ref}`);
      }

      // Try without ./ prefix
      if (!fileRef && ref.startsWith("./")) {
        fileRef = fileMap.get(ref.substring(2));
      }
    }
  }

  // If we found the referenced file
  if (fileRef) {
    console.log(`  Resolved reference: ${ref} (depth: ${depth})`);

    // Get the content and process it recursively
    const referencedContent = deepClone(fileRef.content);
    const refBasePath = path.dirname(fileRef.absolutePath);

    // Process the referenced content to resolve any nested references
    return processNode(
      referencedContent,
      fileMap,
      refBasePath,
      new Set([...visited]), // Clone the visited set
      depth + 1
    );
  }

  // If we couldn't resolve the reference, keep it as is
  console.warn(`Warning: Could not resolve reference to ${ref}`);
  return { $ref: ref };
}

/**
 * Create a deep clone of an object
 */
function deepClone(obj: any): any {
  return JSON.parse(JSON.stringify(obj));
}
