import path from 'path';
import fs from 'fs';

// Add type annotation for parameter and return type
function readFileContentSafe(filePath: string): string | null {
  try {
    // Assuming file paths are relative to CWD where CLI is run
    return fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8');
  } catch (error: unknown) { // Type catch block error as unknown
    // Use type guard
    if (error instanceof Error) {
      console.warn(`  Warning: Could not read file ${filePath} for framework detection: ${error.message}`);
    } else {
      console.warn(`  Warning: Could not read file ${filePath} for framework detection: Unknown error`);
    }
    return null;
  }
}

// Add type annotation for parameter and return type
export function detectFramework(includedFiles: string[]): string {
  console.log('Detecting framework...');
  let detectedFramework: string = 'Unknown';

  // --- Node.js Check ---
  const packageJsonPath = includedFiles.find((f: string) => path.basename(f) === 'package.json'); // Add type for f
  if (packageJsonPath) {
    const content = readFileContentSafe(packageJsonPath);
    if (content) {
      try {
        // Explicitly type packageData and dependencies
        const packageData: any = JSON.parse(content); // Use 'any' for simplicity, or define a PackageJson interface
        const dependencies: { [key: string]: string } = { ...(packageData.dependencies || {}), ...(packageData.devDependencies || {}) };
        if (dependencies.express) detectedFramework = 'Node.js (Express)';
        else if (dependencies.koa) detectedFramework = 'Node.js (Koa)';
        else if (dependencies.fastify) detectedFramework = 'Node.js (Fastify)';
        else if (dependencies['@nestjs/core']) detectedFramework = 'Node.js (NestJS)';
        else detectedFramework = 'Node.js (Unknown Framework)'; // Generic Node.js if specific framework not found
      } catch (error: unknown) { // Type catch block error as unknown
        // Use type guard
        if (error instanceof Error) {
          console.warn(`  Warning: Could not parse ${packageJsonPath}: ${error.message}`);
        } else {
          console.warn(`  Warning: Could not parse ${packageJsonPath}: Unknown error`);
        }
        detectedFramework = 'Node.js (Parse Error)';
      }
    } else {
      detectedFramework = 'Node.js (package.json unreadable)';
    }
  }

  // --- Python Check (only if Node.js not detected) ---
  else if (includedFiles.some((f: string) => f.endsWith('.py'))) { // Add type for f
    detectedFramework = 'Python'; // Default if .py files exist
    const requirementsPath = includedFiles.find((f: string) => path.basename(f) === 'requirements.txt'); // Add type for f
    if (requirementsPath) {
      const content = readFileContentSafe(requirementsPath);
      if (content) {
        if (/^flask\b/im.test(content)) detectedFramework = 'Python (Flask)';
        else if (/^django\b/im.test(content)) detectedFramework = 'Python (Django)';
        else if (/^fastapi\b/im.test(content)) detectedFramework = 'Python (FastAPI)';
        // Add more python framework checks if needed
      }
    }
    // Could also check for manage.py for Django, etc.
  }

  // --- Java Check (Example - needs refinement) ---
  else if (includedFiles.some((f: string) => f.endsWith('.java'))) { // Add type for f
     const pomXmlPath = includedFiles.find((f: string) => path.basename(f) === 'pom.xml'); // Add type for f
     if (pomXmlPath) {
         const content = readFileContentSafe(pomXmlPath);
         if (content && content.includes('spring-boot-starter-web')) {
             detectedFramework = 'Java (Spring Boot)';
         } else {
             detectedFramework = 'Java (Maven)';
         }
     } else {
         // Could check for build.gradle for Gradle projects
         detectedFramework = 'Java';
     }
  }

  // --- Go Check (Example - needs refinement) ---
   else if (includedFiles.some((f: string) => f.endsWith('.go'))) { // Add type for f
       const goModPath = includedFiles.find((f: string) => path.basename(f) === 'go.mod'); // Add type for f
       if (goModPath) {
           const content = readFileContentSafe(goModPath);
           // Check for common web frameworks like gin, echo, fiber
           if (content && /github\.com\/gin-gonic\/gin/.test(content)) detectedFramework = 'Go (Gin)';
           else if (content && /github\.com\/labstack\/echo/.test(content)) detectedFramework = 'Go (Echo)';
           else if (content && /github\.com\/gofiber\/fiber/.test(content)) detectedFramework = 'Go (Fiber)';
           else detectedFramework = 'Go (Modules)';
       } else {
           detectedFramework = 'Go';
       }
   }

  // Add more checks for Ruby, PHP, C#, etc. as needed

  console.log(`Detected framework: ${detectedFramework}`);
  return detectedFramework;
}

// No need for module.exports with ES modules
