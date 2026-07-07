# Pipsel

A Node.js and TypeScript DSL (Domain Specific Language) for extracting structured data from HTML. It uses a GraphQL-like hierarchical structure combined with Unix pipe-style value transformations.

## Features

- **GraphQL-like Hierarchical Field Structure**: Clean declarations for simple fields, nested objects, and arrays.
- **Unix-style Pipe Transformations**: Chain extractors and transformers using `|`.
- **Built-in Linter & Formatter**: Static analysis diagnostics and code formatting APIs and CLI commands.
- **Native ESM Support**: Built for modern TypeScript/Node.js ES modules.

## Installation

```bash
npm install pipsel
```

---

## Pipsel DSL Specification

Pipsel syntax is JSON-like but optimized for HTML parsing.

### 1. Basic Fields
Extract elements and convert/clean values.
```psl
title: "h1" | text | trim
```

### 2. Optional Fields
Fields marked with `?` are optional. If they cannot be found in the DOM (or evaluate to `null`), they are completely omitted/ignored from the final output JSON. Required fields (without `?`) will remain in the output JSON with an explicit `null` value.
```psl
discount?: ".discount" | text | trim
```

### 3. Fallbacks
Define custom values for cases where selectors don't match or evaluate to empty values.
```psl
title: "h1" | text | trim | fallback("Untitled Product")
```

### 4. List Blocks
Retrieve array items relative to parent selectors.
```psl
products[]: ".product-card" {
  name: ".title" | text | trim
  price: ".price" | text | trim | float
  url: "a" | attr("href")
}
```

### 5. Nested Lists
Scopes are recursively resolved.
```psl
categories[]: ".category" {
  name: "h2" | text | trim

  products[]: ".product" {
    title: ".title" | text | trim
    price: ".price" | text | trim | float
  }
}
```

### 6. Meta Variables
Assign current runtime parameters to fields without selectors:
- `@url`: The URL currently being executed.
- `@timestamp`: The ISO timestamp of the extraction execution.
- `@paginate`: Placeholder meta parameter for pagination.

```psl
source_url: @url
extracted_at: @timestamp
```

---

## Built-in Pipe Functions

| Pipe Function | Arguments | Description |
|---|---|---|
| `text` | None | Extract text content from the selected element. |
| `html` | None | Extract outer/inner HTML content from the selected element. |
| `attr` | `(name: string)` | Extract the value of the specified element attribute. |
| `trim` | None | Trim whitespace around string values. |
| `replace` | `(from: string, to: string)` | Replace all occurrences of `from` with `to`. |
| `regex` | `(pattern: string)` | Match values against regex. Returns first capture group (or full match). |
| `split` | `(separator: string)` | Split string values into arrays. |
| `int` | None | Parse values into integers. |
| `float` | None | Parse values into floating-point numbers. |
| `fallback` | `(value: any)` | Use specified fallback value if current value is null, undefined, or empty. |
| `filter` | `(pattern: string)` | Filter items (arrays or strings) that match the regex pattern. |

---

## Programmatic API
You can parse, lint, and format DSL programs programmatically.

```typescript
import { parse, format, lint } from "pipsel";

const dslSource = `
  title: "h1" | text | trim
  price?: ".price" | text | float
`;

// 1. Linting (Checks syntax, argument count, duplicate fields, etc.)
const diagnostics = lint(dslSource);
console.log(diagnostics); // [] (No issues)

// 2. Formatting (Pretty-prints DSL code)
const formatted = format(dslSource);
console.log(formatted);

// 3. Parsing (Produces an Abstract Syntax Tree)
const ast = parse(dslSource);
console.log(JSON.stringify(ast, null, 2));
```

---

## CLI Usage

Pipsel includes a CLI to validate and format PSL rules from your shell:

### Format a Rules File
Formats the `.psl` file in-place with normalized indentations and spacing.
```bash
pipsel fmt rules.psl
```

### Lint a Rules File
Diagnoses any issues in the `.psl` script (exits with non-zero code on errors).
```bash
pipsel lint rules.psl
```

---

## Development

Run unit tests:
```bash
npm run test
```

Build the package:
```bash
npm run build
```

---

## License

MIT
