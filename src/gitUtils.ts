import { execSync } from 'child_process';
import path from 'path';
// fs is unused, remove import
// import fs from 'fs';

export const PATCH_FILE_NAME: string = 'openapi_changes.patch';

// Add type annotation for parameter and return type
function isGitRepository(dir: string): boolean {
  try {
    // Check for .git directory or run git rev-parse --is-inside-work-tree
    execSync('git rev-parse --is-inside-work-tree', { cwd: dir, stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// Add type annotation for parameter and return type (string | null)
export function generatePatch(outputDir: string): string | null {
  // absoluteOutputDir is unused, remove it
  // const absoluteOutputDir = path.resolve(outputDir);
  const repoRoot: string = process.cwd(); // Assuming CLI runs from repo root

  if (!isGitRepository(repoRoot)) {
    console.warn('Warning: Not a git repository. Skipping patch generation.');
    return null; // Indicate patch wasn't generated
  }

  console.log(`Generating git patch for changes in ${outputDir}...`);

  try {
    // Stage the entire output directory relative to the repo root
    console.log(`  Staging directory: ${outputDir}`);
    execSync(`git add "${outputDir}"`, { cwd: repoRoot, stdio: 'inherit' }); // Show output/errors

    // Generate the patch file
    const patchFilePath: string = path.join(repoRoot, PATCH_FILE_NAME);
    console.log(`  Generating patch file: ${PATCH_FILE_NAME}`);
    execSync(`git diff --staged > "${patchFilePath}"`, { cwd: repoRoot, stdio: 'inherit' });

    console.log(`Successfully generated patch file: ${patchFilePath}`);
    return patchFilePath; // Return the path to the generated patch

  } catch (error: unknown) { // Type catch block error as unknown
    // Use type guard
    if (error instanceof Error) {
      console.error('Error during git patch generation:', error.message);
    } else {
      console.error('Error during git patch generation:', 'Unknown error');
    }

    // Attempt to unstage changes if patch generation failed after staging
    try {
      console.log(`  Attempting to unstage ${outputDir} due to error...`);
      execSync(`git reset HEAD -- "${outputDir}"`, { cwd: repoRoot, stdio: 'ignore' });
    } catch (resetError: unknown) { // Type catch block error as unknown
      // Use type guard
      if (resetError instanceof Error) {
        console.error('  Failed to unstage changes:', resetError.message);
      } else {
        console.error('  Failed to unstage changes:', 'Unknown error');
      }
    }
    // Re-throw original error after attempting reset
    if (error instanceof Error) {
      throw new Error(`Failed to generate git patch: ${error.message}`);
    } else {
      throw new Error(`Failed to generate git patch: Unknown error`);
    }
  }
}

// No need for module.exports with ES modules
