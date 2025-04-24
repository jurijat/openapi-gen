import fs from 'fs';
import path from 'path';

// Import the type definition from llmGenerator
import { GeneratedContentMap } from './llmGenerator';

// Add type annotations for parameters and return type (void)
export function writeSchemaFiles(outputDir: string, generatedContentMap: GeneratedContentMap): void {
  console.log(`Writing schema files to directory: ${outputDir}`);

  // Explicitly type filePath and content in the loop
  for (const [filePath, content] of generatedContentMap.entries()) {
    // Note: filePath is already relative to the project root and includes outputDir
    const absolutePath = path.resolve(filePath); // Ensure we have the full path
    const dirname = path.dirname(absolutePath);

    try {
      // Ensure the directory exists
      fs.mkdirSync(dirname, { recursive: true });

      // Write the file
      fs.writeFileSync(absolutePath, content, 'utf8');
      console.log(`  Successfully wrote: ${filePath}`);

    } catch (error: unknown) { // Type catch block error as unknown
      // Use type guard
      if (error instanceof Error) {
        console.error(`Failed to write file: ${filePath}`, error.message);
        throw new Error(`Failed to write ${filePath}: ${error.message}`);
      } else {
        console.error(`Failed to write file: ${filePath}`, 'Unknown error');
        throw new Error(`Failed to write ${filePath}: Unknown error`);
      }
    }
  }

  console.log('Finished writing all schema files.');
}

// No need for module.exports with ES modules
