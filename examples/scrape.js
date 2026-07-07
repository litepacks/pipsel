import { parse, format, lint } from "../dist/index.js";

const pslSource = `
source_url: @url
extracted_at: @timestamp

title: "h1" | text | trim

categories[]: ".category-card" {
  name: "h2.cat-title" | text | trim
  link: "a" | attr("href")

  products[]: ".product-item" {
    title: ".prod-name" | text | trim | fallback("Unknown")
    price?: ".prod-price" | text | trim | float
  }
}
`;

async function main() {
  console.log("--- AST ---");
  const ast = parse(pslSource);
  console.log(JSON.stringify(ast, null, 2));

  console.log("\n--- LINTING ---");
  const diagnostics = lint(pslSource);
  console.log("Diagnostics:", diagnostics);

  console.log("\n--- FORMATTING ---");
  const formatted = format(pslSource);
  console.log(formatted);
}

main().catch(console.error);
