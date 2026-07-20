import { describe, it, expect, vi } from "vitest";
import * as cheerio from "cheerio";
import { cleanDOM, DOMCompressor, detectRepeatedStructures, detectCandidateFields, chunkDOM, discoverHTML, generateRobustSelector, generateRelativeSelector } from "../src/discover.js";
import { pipsel } from "../src/playwright.js";

describe("Discover Feature - DOM Preprocessing", () => {
  it("should clean HTML removing scripts, styles, SVGs, ads, and comment blocks", () => {
    const html = `
      <html>
        <head>
          <style>body { color: red; }</style>
          <script>console.log('test')</script>
        </head>
        <body>
          <!-- comment block -->
          <div class="main-content">
            <h1>Article Title</h1>
            <svg><path d=""/></svg>
            <div id="google-ads" class="banner-ad">Ad link</div>
            <div class="analytics-pixel">Tracking</div>
            <p style="display: none">Hidden text</p>
          </div>
        </body>
      </html>
    `;
    const $ = cleanDOM(html);

    expect($("style")).toHaveLength(0);
    expect($("script")).toHaveLength(0);
    expect($("svg")).toHaveLength(0);
    expect($("iframe")).toHaveLength(0);
    expect($("#google-ads")).toHaveLength(0);
    expect($(".analytics-pixel")).toHaveLength(0);
    expect($("p")).toHaveLength(0); // display: none removed
    expect($(".main-content")).toHaveLength(1);
    expect($(".main-content").text().trim()).toBe("Article Title");
  });

  it("should compress the DOM and generate a reversible mapping", () => {
    const html = `
      <div class="product-card" id="card-1">
        <h3 class="title">MacBook Pro</h3>
        <span class="price">$1999</span>
        <a href="/macbook" data-testid="link-test">Link</a>
      </div>
    `;
    const $ = cleanDOM(html);
    const compressor = new DOMCompressor($);
    const compressed = compressor.compress($("body").children());

    expect(compressed).toHaveLength(1);
    expect(compressed[0].tag).toBe("div");
    expect(compressed[0].classes).toContain("product-card");
    expect(compressed[0].attributes).toEqual({ id: "card-1" });

    const children = compressed[0].children!;
    expect(children).toHaveLength(3);
    expect(children[0].tag).toBe("h3");
    expect(children[0].classes).toContain("title");
    expect(children[0].text).toBe("MacBook Pro");

    expect(children[2].tag).toBe("a");
    expect(children[2].attributes).toEqual({ href: "/macbook", "data-testid": "link-test" });

    // Verify reversible mapping
    const el = compressor.idToElementMap.get(children[0].id);
    expect(el).toBeDefined();
    expect(el!.name).toBe("h3");
    expect($(el!).text().trim()).toBe("MacBook Pro");
  });

  it("should detect repeated structure patterns for grids or lists", () => {
    const html = `
      <div class="container">
        <div class="product-item">Card 1</div>
        <div class="product-item">Card 2</div>
        <div class="product-item">Card 3</div>
        <div class="product-item">Card 4</div>
      </div>
    `;
    const $ = cleanDOM(html);
    const repeated = detectRepeatedStructures($);

    expect(repeated.length).toBeGreaterThanOrEqual(1);
    expect(repeated[0].selector).toBe("div.product-item");
    expect(repeated[0].itemCount).toBe(4);
    expect(repeated[0].confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("should detect candidate fields deterministically", () => {
    const html = `
      <div class="product">
        <h1 class="title">Widget</h1>
        <span class="price-value" itemprop="price">$10.00</span>
        <img class="product-img" src="widget.png" />
      </div>
    `;
    const $ = cleanDOM(html);
    const candidates = detectCandidateFields($, ["title", "price", "image"]);

    const titleCand = candidates.find(c => c.fieldName === "title");
    expect(titleCand).toBeDefined();
    expect(titleCand!.confidence).toBeGreaterThan(0.3);

    const priceCand = candidates.find(c => c.fieldName === "price");
    expect(priceCand).toBeDefined();
    expect(priceCand!.confidence).toBeGreaterThan(0.3);
  });

  it("should chunk a large DOM based on importance", () => {
    const html = `
      <div class="header">Navbar</div>
      <div class="main">
        <section class="products">
          <div class="card" data-testid="p1">Item 1</div>
          <div class="card" data-testid="p2">Item 2</div>
        </section>
      </div>
      <div class="footer">Boilerplate copy</div>
    `;
    const $ = cleanDOM(html);
    const chunks = chunkDOM($, 1000);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // The main or section chunk should be ranked high
    const firstChunkHtml = $.html(chunks[0]) || "";
    expect(firstChunkHtml).toContain("card");
    expect(firstChunkHtml).not.toContain("footer");
  });

  it("should generate robust and relative selectors", () => {
    const html = `
      <div class="container" id="main-container">
        <div class="card">
          <h3 class="title" itemprop="name">Widget</h3>
          <span class="price">10</span>
        </div>
      </div>
    `;
    const $ = cleanDOM(html);
    const cardEl = $(".card")[0];
    const titleEl = $(".title")[0];
    const priceEl = $(".price")[0];

    const absSelector = generateRobustSelector($, titleEl);
    expect(absSelector).toBe('[itemprop="name"]'); // unique attribute preferred

    const relSelector = generateRelativeSelector($, cardEl, priceEl);
    expect(relSelector).toBe("span.price");
  });
});

describe("Discover Feature - LLM Pipeline & Runner Integration", () => {
  it("should generate, validate, and execute a PSL script from mock LLM output (List Page)", async () => {
    const mockProvider = {
      call: vi.fn().mockResolvedValue(`
        {
          "isList": true,
          "listSelectorId": 2,
          "fields": {
            "title": 3,
            "price": 4
          }
        }
      `)
    };

    const html = `
      <div class="container">
        <div class="item">
          <h3 class="title">Product 1</h3>
          <span class="price">$10</span>
        </div>
        <div class="item">
          <h3 class="title">Product 2</h3>
          <span class="price">$20</span>
        </div>
      </div>
    `;

    const result = await pipsel(html).discover({
      fields: ["title", "price"],
      provider: mockProvider
    });

    expect(mockProvider.call).toHaveBeenCalled();
    expect(result.validationErrors).toHaveLength(0);
    expect(result.psl).toContain("items[]");
    expect(result.preview.items).toHaveLength(2);
    expect(result.preview.items[0]).toEqual({
      title: "Product 1",
      price: "$10"
    });
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("should trigger repair loop if validation initially fails", async () => {
    const mockProvider = {
      call: vi.fn()
        // First call returns an invalid nodeId for "title"
        .mockResolvedValueOnce(`
          {
            "isList": false,
            "fields": {
              "title": 999
            }
          }
        `)
        // Second call corrects it
        .mockResolvedValueOnce(`
          {
            "isList": false,
            "fields": {
              "title": 2
            }
          }
        `)
    };

    const html = `
      <div>
        <h1 class="main-title">Clean Title</h1>
      </div>
    `;

    const result = await pipsel(html).discover({
      fields: ["title"],
      provider: mockProvider,
      maxRepairAttempts: 2
    });

    expect(mockProvider.call).toHaveBeenCalledTimes(2);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.preview).toEqual({
      title: "Clean Title"
    });
  });
});
