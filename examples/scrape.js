import { parse, format, lint, execute } from "../dist/index.js";

const pslSource = `
source_url: @url
extracted_at: @timestamp

# 1. Selector fallbacks with coalescing (??) and required check
title: "h1" ?? ".product-title" ?? ".prod-name" | text | trim | required("Title is missing from page!")

# 2. Nested categories and products
categories[]: ".category-card" {
  name: "h2.cat-title" | text | trim
  link: "a" | attr("href")

  products[]: ".product-item" {
    title: ".prod-name" | text | trim | fallback("Unknown")
    price?: ".prod-price" | text | trim | float
    
    # 3. Direct comparison operators
    is_expensive: ".prod-price" | text | float | > 100
  }
}

# 4. URL parsing properties and parameters
domain: "a.logo-link" | attr("href") | url_hostname
category_id: "a.category-link" | attr("href") | url_param("cat_id")

# 5. De-duplicating arrays
unique_tags[]: ".tags a" | text | trim | unique
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

  console.log("\n--- EXECUTION ---");
  const mockHtml = `
    <html>
      <body>
        <a class="logo-link" href="https://example.com/home">Home</a>
        <a class="category-link" href="/shop?cat_id=electronics">Electronics</a>
        <h1 class="product-title">  Awesome Product Spec  </h1>
        
        <div class="category-card">
          <h2 class="cat-title">Gadgets</h2>
          <a href="/categories/gadgets">Link</a>
          
          <div class="product-item">
            <span class="prod-name">Phone</span>
            <span class="prod-price">299.99</span>
          </div>
          <div class="product-item">
            <span class="prod-name">Case</span>
            <span class="prod-price">19.99</span>
          </div>
        </div>

        <div class="tags">
          <a href="#">tech</a>
          <a href="#">gadgets</a>
          <a href="#">tech</a>
        </div>
      </body>
    </html>
  `;

  const data = execute(ast, {
    html: mockHtml,
    url: "https://example.com/products/123"
  });
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
