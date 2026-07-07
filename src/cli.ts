import { Command } from "commander";
import * as fs from "fs/promises";
import { parse, execute, format, lint } from "./index.js";

const program = new Command();

program
  .name("pipsel")
  .description("CLI for Pipsel DSL compiler")
  .version("1.0.0");

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

program
  .command("run <file> [url]")
  .description("Executes the DSL rule file against HTML (from URL or stdin)")
  .action(async (file, url) => {
    try {
      const pslContent = await fs.readFile(file, "utf-8");
      
      // Lint first
      const diagnostics = lint(pslContent);
      if (diagnostics.some(d => d.severity === "error")) {
        console.error("Cannot execute: Fix PSL lint/syntax errors first.");
        process.exit(1);
      }

      let html = "";
      if (url) {
        // Fetch from URL
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch URL ${url}: ${res.statusText}`);
        }
        html = await res.text();
      } else {
        // Read from stdin
        html = await readStdin();
        if (!html.trim()) {
          console.error("Error: Please provide a URL or pipe HTML content via stdin.");
          process.exit(1);
        }
      }

      const ast = parse(pslContent);
      const result = execute(ast, { html, url });
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(`Execution error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("fmt <file>")
  .description("Formats the specified .psl file in-place")
  .action(async (file) => {
    try {
      const content = await fs.readFile(file, "utf-8");
      const formatted = format(content);
      await fs.writeFile(file, formatted, "utf-8");
      console.log(`Formatted ${file} successfully.`);
    } catch (err: any) {
      console.error(`Formatting error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("lint <file>")
  .description("Lints the specified .psl file")
  .action(async (file) => {
    try {
      const content = await fs.readFile(file, "utf-8");
      const diagnostics = lint(content);
      if (diagnostics.length === 0) {
        console.log(`No issues found in ${file}.`);
        process.exit(0);
      }

      let hasErrors = false;
      for (const diag of diagnostics) {
        const severityStr = diag.severity.toUpperCase();
        console.error(
          `[${severityStr}] line ${diag.line}, col ${diag.column}: ${diag.message}`
        );
        if (diag.severity === "error") {
          hasErrors = true;
        }
      }

      if (hasErrors) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    } catch (err: any) {
      console.error(`Linting error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
export { program };
