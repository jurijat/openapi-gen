import fs from 'fs';
import path from 'path';
import ignore, { Ignore } from 'ignore'; // Import 'Ignore' type if available, otherwise use 'any'

// Define return type for scanRepository
export interface ScanResult {
  includedFiles: string[];
  repomixContent: string;
}

// Function to read ignore file content safely
function readIgnoreFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error: unknown) { // Type catch block error as unknown
    // Use type guard
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // File not found is okay
      return '';
    }
    // Other errors should be reported
    if (error instanceof Error) {
      console.warn(`Warning: Could not read ignore file ${filePath}: ${error.message}`);
    } else {
      console.warn(`Warning: Could not read ignore file ${filePath}: Unknown error`);
    }
    return '';
  }
}

// Add type annotations for parameters and return type
export function scanRepository(rootDir: string, customIgnoreFileName: string, outputDir: string): ScanResult {
  console.log(`Scanning repository at ${rootDir}, ignoring via .gitignore and ${customIgnoreFileName}...`);

  // Explicitly type ig using the imported type or any
  const ig: Ignore = ignore();

  // 1. Add default ignores
  ig.add(['.git', 'node_modules', outputDir + '/**', customIgnoreFileName, 'openapi_changes.patch']); // Ignore output dir, self, patch file

  // 2. Add rules from .gitignore
  const gitignorePath = path.join(rootDir, '.gitignore');
  const gitignoreContent = readIgnoreFile(gitignorePath);
  if (gitignoreContent) {
    console.log('  Applying .gitignore rules...');
    ig.add(gitignoreContent);
  }

  // 3. Add rules from custom ignore file
  const customIgnorePath = path.join(rootDir, customIgnoreFileName);
  const customIgnoreContent = readIgnoreFile(customIgnorePath);
  if (customIgnoreContent) {
    console.log(`  Applying ${customIgnoreFileName} rules...`);
    ig.add(customIgnoreContent);
  }

  const includedFiles: string[] = []; // Explicitly type as string array
  let repomixContent: string = '';
  const maxFileSize: number = 1024 * 1024; // 1MB limit per file (to prevent huge binaries)

  // Recursive function to walk the directory
  function walkDir(currentDir: string): void { // Add type for parameter
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      // Get path relative to the root for ignore checking
      const relativePath = path.relative(rootDir, fullPath);

      // Check if the path should be ignored
      if (ig.ignores(relativePath)) {
        // console.log(`Ignoring: ${relativePath}`); // Debug logging
        continue;
      }

      if (entry.isDirectory()) {
        walkDir(fullPath); // Recurse into subdirectories
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > maxFileSize) {
             console.warn(`  Skipping large file: ${relativePath} (${(stats.size / (1024*1024)).toFixed(2)} MB)`);
             continue;
          }
          // Check file content for binary data (basic check)
          const buffer = fs.readFileSync(fullPath);
          // Simple check: look for null bytes, common in binary files
          if (buffer.includes(0)) {
             console.warn(`  Skipping likely binary file: ${relativePath}`);
             continue;
          }

          const content: string = buffer.toString('utf8'); // Assume UTF-8
          includedFiles.push(relativePath);
          repomixContent += `--- File: ${relativePath} ---\n\n${content}\n\n`; // Add separator and content

        } catch (error: unknown) { // Type catch block error as unknown
            // Use type guard
            if (error instanceof Error) {
              console.warn(`  Warning: Could not read file ${relativePath}: ${error.message}`);
            } else {
              console.warn(`  Warning: Could not read file ${relativePath}: Unknown error`);
            }
        }
      }
    }
  }

  // Start walking from the root directory
  try {
      walkDir(rootDir);
  } catch (error: unknown) { // Type catch block error as unknown
      // Use type guard
      if (error instanceof Error) {
        console.error(`Error scanning directory ${rootDir}: ${error.message}`);
        throw new Error(`Directory scanning failed: ${error.message}`);
      } else {
        console.error(`Error scanning directory ${rootDir}: Unknown error`);
        throw new Error(`Directory scanning failed: Unknown error`);
      }
  }


  console.log(`Found ${includedFiles.length} files to include in repomix.`);

  return {
    includedFiles,
    repomixContent,
  };
}

// No need for module.exports with ES modules
