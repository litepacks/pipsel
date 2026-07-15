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

### 3. Nullish Coalescing (Selector Fallbacks)
Resolve selectors sequentially. If a selector doesn't match any DOM elements, the engine falls back to the next selector.
```psl
title: "h1" ?? ".alternative-title" | text | trim
```

### 4. Fallbacks
Define custom values for cases where selectors don't match or evaluate to empty values.
```psl
title: "h1" | text | trim | fallback("Untitled Product")
```

### 5. List Blocks
Retrieve array items relative to parent selectors. List blocks can either extract arrays of nested objects:
```psl
products[]: ".product-card" {
  name: ".title" | text | trim
  price: ".price" | text | trim | float
  url: "a" | attr("href")
}
```
Or flat primitive list arrays (e.g., lists of strings, numbers, or booleans) directly by appending standard pipeline pipes:
```psl
tags[]: ".tags a" | text | trim | lowercase
prices[]: ".product-price" | text | float
```

### 6. Nested Lists
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

### 7. Meta Variables
Assign current runtime parameters to fields without selectors:
- `@url`: The URL currently being executed.
- `@timestamp`: The ISO timestamp of the extraction execution.
- `@paginate`: Placeholder meta parameter for pagination.

```psl
source_url: @url
extracted_at: @timestamp
```

### 8. Smart Naming Match Resolver
If a website uses dynamic/unpredictable CSS classes, or you want to write more resilient rules, use the smart semantic match resolver:
```psl
title: @match("title") | text | trim
price: @match("price") | text | float
```
The engine deterministically scores DOM elements looking for matches in `id`, `class`, `data-testid`, `data-test`, `data-cy`, `aria-label`, `name`, `itemprop`, and `role` attributes, including plural/synonym matches (e.g. `price` matches `.amount` or `.cost`).

---

## Built-in Pipe Functions

| Pipe Function | Arguments | Description |
|---|---|---|
| `text` | None | Extract text content from the selected element. |
| `html` | None | Extract outer/inner HTML content from the selected element. |
| `attr` | `(name: string)` | Extract the value of the specified element attribute. |
| `trim` | None | Trim whitespace around string values. |
| `trim_start` / `trim_end` | None | Trim whitespace from the start or end of string values (aliases: `trimStart`, `trimEnd`). |
| `lowercase` / `lower` | None | Convert string values to lowercase. |
| `uppercase` / `upper` | None | Convert string values to uppercase. |
| `titlecase` / `title` | None | Convert string values to Title Case. |
| `slugify` | None | Convert string values into clean, URL-safe slugs. |
| `clean` | None | Collapse multiple whitespace/newlines into a single space. |
| `prefix` | `(value: string)` | Prepend prefix string value. |
| `suffix` | `(value: string)` | Append suffix string value. |
| `substring` / `slice` | `(start: number, end?: number)` | Extract portion of a string between start and end indices. |
| `replace` | `(from: string, to: string)` | Replace all occurrences of `from` with `to`. |
| `regex` | `(pattern: string)` | Match values against regex. Returns first capture group (or full match). |
| `split` | `(separator: string)` | Split string values into arrays. |
| `int` | None | Parse values into integers. |
| `float` | None | Parse values into floating-point numbers. |
| `abs` | None | Returns the absolute value of a number. |
| `round` | `(decimals?: number)` | Rounds a number to specified decimal places (default 0). |
| `ceil` / `floor` | None | Rounds a number up (ceil) or down (floor). |
| `add` / `subtract` | `(value: number)` | Adds or subtracts a numeric value. |
| `multiply` / `divide` | `(value: number)` | Multiplies or divides by a numeric value. |
| `min` / `max` | None | Returns the minimum or maximum of a numeric array. |
| `sum` / `avg` | None | Returns the sum or average of a numeric array (alias: `average`). |
| `bool` / `boolean` | None | Converts values to booleans. Absent selector elements evaluate to `false`. |
| `fallback` | `(value: any)` | Use specified fallback value if current value is null, undefined, or empty. |
| `filter` | `(pattern: string)` | Filter items (arrays or strings) that match the regex pattern. |
| `url_parse` / `urlParse` | None | Parse URL string into a structured object containing properties: `href`, `protocol`, `hostname`, `port`, `pathname`, `search`, `hash`, `origin`, and `params` (query parameters key-value object). |
| `url_protocol` / `urlProtocol` | None | Extract the protocol (scheme) from a URL string (e.g., `https:`). |
| `url_hostname` / `urlHostname` | None | Extract the hostname/domain from a URL string (e.g., `example.com`). |
| `url_port` / `urlPort` | None | Extract the port number from a URL string. |
| `url_pathname` / `urlPathname` / `url_path` / `urlPath` | None | Extract the path component from a URL string (e.g., `/pathname`). |
| `url_search` / `urlSearch` / `url_query` / `urlQuery` | None | Extract the query string from a URL string (e.g., `?q=test`). |
| `url_hash` / `urlHash` | None | Extract the hash/fragment component from a URL string (e.g., `#section`). |
| `url_origin` / `urlOrigin` | None | Extract the origin from a URL string (e.g., `https://example.com`). |
| `url_param` / `urlParam` | `(name: string)` | Extract the value of the specified query parameter from a URL string. |
| `url_resolve` / `urlResolve` / `url_join` / `urlJoin` | `(base?: string)` | Resolve a relative URL against a base URL (defaults to context `@url`). |
| `unique` | `(key?: string)` | Retain unique values in an array. For primitive arrays, uses Set. For object arrays, checks uniqueness by the specified `key`. |
| `json_parse` / `jsonParse` / `json` | None | Parse a JSON string into a structured JavaScript object or array. |
| `>`, `<`, `>=`, `<=`, `==`, `=`, `!=` | `(value: any)` | Compare the pipeline value against the argument (numerically or lexically). Returns a boolean. |
| `required` | `(message?: string)` | Throw a runtime validation error if the pipeline value is null, undefined, empty string, or an empty list. Supports custom error message. |

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

### Explain a Rules File
Prints a visual tree representation of each field's pipeline in the `.psl` file.
```bash
pipsel explain rules.psl
```
Example output:
```
title
└── h1
    ├── text
    └── trim

price
└── .price
    ├── text
    ├── replace("$","")
    └── float
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
