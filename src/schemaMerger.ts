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

// Interface for tracking component schemas
interface ComponentRegistry {
  schemas: Map<string, any>;
  responses: Map<string, any>;
  parameters: Map<string, any>;
  examples: Map<string, any>;
  requestBodies: Map<string, any>;
  headers: Map<string, any>;
  securitySchemes: Map<string, any>;
  links: Map<string, any>;
  callbacks: Map<string, any>;
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

    // Create a registry for components to help with circular references
    const componentRegistry: ComponentRegistry = {
      schemas: new Map<string, any>(),
      responses: new Map<string, any>(),
      parameters: new Map<string, any>(),
      examples: new Map<string, any>(),
      requestBodies: new Map<string, any>(),
      headers: new Map<string, any>(),
      securitySchemes: new Map<string, any>(),
      links: new Map<string, any>(),
      callbacks: new Map<string, any>(),
    };

    for (const filePath of generatedFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const schema = yaml.load(content);
        const absolutePath = path.resolve(filePath);
        const relativePath = path.relative(mainFileDir, filePath);

        // Store multiple path variations to make reference resolution more robust
        const fileRef: FileReference = {
          absolutePath,
          relativePath,
          content: schema,
        };

        // Store with multiple path variations for more robust reference resolution
        fileMap.set(absolutePath, fileRef);
        fileMap.set(filePath, fileRef); // Original path
        fileMap.set(`./${relativePath}`, fileRef); // Relative with ./
        fileMap.set(relativePath, fileRef); // Relative without ./

        // Handle paths with or without file extension
        if (relativePath.endsWith(".yaml") || relativePath.endsWith(".yml")) {
          const pathWithoutExt = relativePath.substring(
            0,
            relativePath.lastIndexOf(".")
          );
          fileMap.set(pathWithoutExt, fileRef);
          fileMap.set(`./${pathWithoutExt}`, fileRef);
        }

        // Pre-register components if this is a component file
        registerComponents(filePath, schema, componentRegistry);

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
      mainFileDir,
      componentRegistry
    );

    // 5. Normalize the schema to ensure all components are properly defined
    console.log("Normalizing schema...");
    const normalizedSchema = normalizeSchema(resolvedSchema, componentRegistry);

    // 6. Write the consolidated schema to a JSON file
    console.log("Writing consolidated schema...");
    const jsonOutput = JSON.stringify(normalizedSchema, null, 2);
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
 * Register components from a file in the component registry
 */
function registerComponents(
  filePath: string,
  schema: any,
  registry: ComponentRegistry
): void {
  // Skip if not an object or doesn't match component pattern
  if (typeof schema !== "object" || schema === null) {
    return;
  }

  // Extract component name from file path
  const fileName = path.basename(filePath);
  const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf("."));

  // Check if this is a component file based on path
  const isComponentFile = filePath.includes("/components/");
  if (!isComponentFile) {
    return;
  }

  // Determine component type from path
  let componentType: keyof ComponentRegistry | null = null;

  if (filePath.includes("/components/schemas/")) {
    componentType = "schemas";
  } else if (filePath.includes("/components/responses/")) {
    componentType = "responses";
  } else if (filePath.includes("/components/parameters/")) {
    componentType = "parameters";
  } else if (filePath.includes("/components/examples/")) {
    componentType = "examples";
  } else if (filePath.includes("/components/requestBodies/")) {
    componentType = "requestBodies";
  } else if (filePath.includes("/components/headers/")) {
    componentType = "headers";
  } else if (filePath.includes("/components/securitySchemes/")) {
    componentType = "securitySchemes";
  } else if (filePath.includes("/components/links/")) {
    componentType = "links";
  } else if (filePath.includes("/components/callbacks/")) {
    componentType = "callbacks";
  }

  if (componentType) {
    registry[componentType].set(fileNameWithoutExt, schema);
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
  componentRegistry: ComponentRegistry,
  refMap = new Map<string, string>() // Maps external refs to internal component refs
): any {
  // Create a deep clone of the schema to avoid modifying the original
  const result = deepClone(schema);

  // Process the cloned schema
  return processNode(result, fileMap, basePath, componentRegistry, refMap);
}

/**
 * Process a node in the schema, resolving any references
 */
function processNode(
  node: any,
  fileMap: Map<string, FileReference>,
  basePath: string,
  componentRegistry: ComponentRegistry,
  refMap = new Map<string, string>(),
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
      processNode(
        item,
        fileMap,
        basePath,
        componentRegistry,
        refMap,
        visited,
        depth + 1
      )
    );
  }

  // Handle objects with $ref
  if (node.$ref && typeof node.$ref === "string") {
    return resolveReference(
      node.$ref,
      fileMap,
      basePath,
      componentRegistry,
      refMap,
      visited,
      depth
    );
  }

  // Process each property of the object
  const result: any = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] = processNode(
      value,
      fileMap,
      basePath,
      componentRegistry,
      refMap,
      visited,
      depth + 1
    );
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
  componentRegistry: ComponentRegistry,
  refMap: Map<string, string>,
  visited = new Set<string>(),
  depth = 0
): any {
  // Handle internal references (keep them as is)
  if (ref.startsWith("#")) {
    return { $ref: ref };
  }

  // Check if we've already mapped this reference to a component
  if (refMap.has(ref)) {
    const internalRef = refMap.get(ref);
    if (internalRef) {
      return { $ref: internalRef };
    }
  }

  // Check for circular references
  if (visited.has(ref)) {
    console.warn(`Warning: Circular reference detected for ${ref}`);

    // Try to extract component name from the reference
    const componentName = extractComponentName(ref);
    if (componentName) {
      // Create an internal reference to the component
      const internalRef = `#/components/schemas/${componentName}`;
      return { $ref: internalRef };
    }

    // Fallback if we can't extract a component name
    return {
      type: "object",
      description: `Circular reference to ${ref} - replaced with placeholder`,
    };
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

      // Try without file extension
      if (!fileRef && (ref.endsWith(".yaml") || ref.endsWith(".yml"))) {
        const refWithoutExt = ref.substring(0, ref.lastIndexOf("."));
        fileRef = fileMap.get(refWithoutExt);

        if (!fileRef) {
          fileRef = fileMap.get(`./${refWithoutExt}`);
        }
      }
    }
  }

  // If we found the referenced file
  if (fileRef) {
    console.log(`  Resolved reference: ${ref} (depth: ${depth})`);

    // Get the content and process it recursively
    const referencedContent = deepClone(fileRef.content);
    const refBasePath = path.dirname(fileRef.absolutePath);

    // Extract component name for registration
    const componentName = extractComponentName(ref);

    // Process the referenced content to resolve any nested references
    const resolvedContent = processNode(
      referencedContent,
      fileMap,
      refBasePath,
      componentRegistry,
      refMap,
      new Set([...visited]), // Clone the visited set
      depth + 1
    );

    // If this is a component, register it and return a reference
    if (componentName) {
      // Register in component registry
      componentRegistry.schemas.set(componentName, resolvedContent);

      // Create an internal reference
      const internalRef = `#/components/schemas/${componentName}`;

      // Map the external ref to this internal ref for future occurrences
      refMap.set(ref, internalRef);

      // Return the internal reference
      return { $ref: internalRef };
    }

    // Otherwise return the resolved content directly
    return resolvedContent;
  }

  // If we couldn't resolve the reference, log a warning
  console.warn(`Warning: Could not resolve reference to ${ref}`);

  // Try to extract component name from the reference
  const componentName = extractComponentName(ref);
  if (componentName) {
    // Create a placeholder schema
    const placeholderSchema = {
      type: "object",
      description: `Unresolved reference to ${ref}`,
      properties: {},
    };

    // Register in component registry
    componentRegistry.schemas.set(componentName, placeholderSchema);

    // Create an internal reference
    const internalRef = `#/components/schemas/${componentName}`;

    // Return the internal reference
    return { $ref: internalRef };
  }

  // Fallback to keeping the original reference
  return { $ref: ref };
}

/**
 * Extract component name from a reference path
 */
function extractComponentName(ref: string): string | null {
  // Handle paths like '../components/schemas/ErrorResponse.yaml'
  if (ref.includes("/components/schemas/")) {
    const match = ref.match(/\/components\/schemas\/([^\/\.]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Handle simple file names like 'ErrorResponse.yaml'
  const fileName = path.basename(ref);
  if (fileName) {
    const parts = fileName.split(".");
    return parts[0] || null; // Return null if split results in empty string
  }

  return null;
}

/**
 * Normalize the schema to ensure all components are properly defined
 * and fix common OpenAPI validation issues
 */
function normalizeSchema(schema: any, registry: ComponentRegistry): any {
  // Create a deep clone to avoid modifying the original
  const result = deepClone(schema);

  // Ensure components section exists
  if (!result.components) {
    result.components = {};
  }

  // Ensure schemas section exists
  if (!result.components.schemas) {
    result.components.schemas = {};
  }

  // Fix paths that incorrectly reference components
  if (result.paths) {
    for (const [pathKey, pathValue] of Object.entries(result.paths)) {
      // Check if this path is just a reference
      if (
        typeof pathValue === "object" &&
        pathValue !== null &&
        "$ref" in pathValue
      ) {
        const refValue = pathValue.$ref as string;

        // If it references a component schema
        if (refValue.startsWith("#/components/schemas/")) {
          const schemaName = refValue.substring("#/components/schemas/".length);
          const schemaObj = registry.schemas.get(schemaName);

          if (schemaObj) {
            // Replace the reference with the actual path item
            result.paths[pathKey] = schemaObj;

            // Remove this from components.schemas since it's a path item, not a schema
            registry.schemas.delete(schemaName);
          }
        }
      }
    }
  }

  // Fix invalid component names (e.g., {id})
  const invalidNameRegex = /[^A-Za-z0-9\-\._]/g;
  const schemasToRename = new Map<string, any>();

  for (const [name, schemaObj] of registry.schemas.entries()) {
    if (invalidNameRegex.test(name)) {
      // Create a valid name by replacing invalid characters
      const validName = name.replace(invalidNameRegex, "_");
      schemasToRename.set(validName, schemaObj);

      // Update any references to this component in the schema
      updateReferences(
        result,
        `#/components/schemas/${name}`,
        `#/components/schemas/${validName}`
      );
    } else {
      // Keep valid names as they are
      result.components.schemas[name] = schemaObj;
    }
  }

  // Add the renamed schemas
  for (const [validName, schemaObj] of schemasToRename.entries()) {
    result.components.schemas[validName] = schemaObj;
  }

  // Add other component types if they have entries
  for (const [type, map] of Object.entries(registry)) {
    if (type === "schemas") continue; // Already handled

    const typeMap = map as Map<string, any>;
    if (typeMap.size > 0) {
      if (!result.components[type]) {
        result.components[type] = {};
      }

      for (const [name, obj] of typeMap.entries()) {
        // Ensure valid component names
        const validName = name.replace(invalidNameRegex, "_");
        result.components[type][validName] = obj;
      }
    }
  }

  // Fix path operations that are incorrectly nested under components.schemas
  for (const [schemaName, schemaObj] of Object.entries(
    result.components.schemas
  )) {
    // Check if this "schema" is actually a path item with operations
    if (typeof schemaObj === "object" && schemaObj !== null) {
      const hasOperations = [
        "get",
        "post",
        "put",
        "delete",
        "options",
        "head",
        "patch",
        "trace",
      ].some((op) => op in schemaObj);

      if (hasOperations) {
        // This is a path item, not a schema
        // Find any paths that reference this schema
        let pathFound = false;

        if (result.paths) {
          for (const [pathKey, pathValue] of Object.entries(result.paths)) {
            if (
              typeof pathValue === "object" &&
              pathValue !== null &&
              "$ref" in pathValue &&
              pathValue.$ref === `#/components/schemas/${schemaName}`
            ) {
              // Replace the reference with the actual path item
              result.paths[pathKey] = schemaObj;
              pathFound = true;
            }
          }
        }

        // If we found and fixed a path, remove it from schemas
        if (pathFound) {
          delete result.components.schemas[schemaName];
        }
      }
    }
  }

  return result;
}

/**
 * Update all references in a schema from oldRef to newRef
 */
function updateReferences(schema: any, oldRef: string, newRef: string): void {
  if (typeof schema !== "object" || schema === null) {
    return;
  }

  if (Array.isArray(schema)) {
    for (const item of schema) {
      updateReferences(item, oldRef, newRef);
    }
    return;
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key === "$ref" && value === oldRef) {
      schema[key] = newRef;
    } else if (typeof value === "object" && value !== null) {
      updateReferences(value, oldRef, newRef);
    }
  }
}

/**
 * Create a deep clone of an object
 */
function deepClone(obj: any): any {
  return JSON.parse(JSON.stringify(obj));
}
