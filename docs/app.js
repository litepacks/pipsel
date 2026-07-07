// Register custom Highlight.js language definition for Pipsel (PSL)
hljs.registerLanguage("psl", function(hljs) {
  return {
    name: "Pipsel",
    aliases: ["psl"],
    keywords: {
      keyword: "text html attr trim replace regex split int float fallback filter",
      literal: "true false null"
    },
    contains: [
      hljs.HASH_COMMENT_MODE,
      hljs.C_LINE_COMMENT_MODE,
      {
        className: "string",
        begin: '"', end: '"',
        illegal: '\\n',
        contains: [hljs.BACKSLASH_ESCAPE]
      },
      {
        className: "string",
        begin: "'", end: "'",
        illegal: '\\n',
        contains: [hljs.BACKSLASH_ESCAPE]
      },
      {
        className: "number",
        begin: hljs.NUMBER_RE,
        relevance: 0
      },
      {
        className: "variable",
        begin: "@[a-zA-Z_][a-zA-Z0-9_]*"
      },
      {
        className: "symbol",
        begin: "[a-zA-Z_][a-zA-Z0-9_-]*(?=\\??:|\\[\\]:)"
      },
      {
        className: "operator",
        begin: "\\|"
      }
    ]
  };
});

// Default templates for PSL rules and HTML source
const defaultPsl = `source_url: @url
extracted_at: @timestamp

title: ".hnname a" | text | trim

stories[]: ".athing" {
  rank: ".rank" | text | trim
  title: ".titleline a" | text | trim
  link: ".titleline a" | attr("href")
  domain?: ".sitestr" | text | trim
}`;

const defaultHtml = `<table border="0" cellpadding="0" cellspacing="0" class="hnmain">
  <tr>
    <td bgcolor="#ff6600">
      <table border="0" cellpadding="2" cellspacing="0" width="100%">
        <tr>
          <td style="line-height:12pt; height:10px;">
            <span class="pagetop">
              <b class="hnname"><a href="news">Hacker News</a></b>
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr style="height:10px"></tr>
  <tr>
    <td>
      <table border="0" cellpadding="0" cellspacing="0" class="itemlist">
        <tr class="athing" id="36829103">
          <td align="right" valign="top" class="title"><span class="rank">1.</span></td>
          <td valign="top" class="title">
            <span class="titleline">
              <a href="https://example.com/ai-agent">Building a Custom HTML Extractor DSL</a>
              <span class="sitebit comhead"> (<a href="from?site=example.com"><span class="sitestr">example.com</span></a>)</span>
            </span>
          </td>
        </tr>
        <tr class="athing" id="36829104">
          <td align="right" valign="top" class="title"><span class="rank">2.</span></td>
          <td valign="top" class="title">
            <span class="titleline">
              <a href="https://news.ycombinator.com/item?id=36829104">Show HN: Pipsel – GraphQL-like DSL for Web Scraping</a>
            </span>
          </td>
        </tr>
        <tr class="athing" id="36829105">
          <td align="right" valign="top" class="title"><span class="rank">3.</span></td>
          <td valign="top" class="title">
            <span class="titleline">
              <a href="https://github.com/pipsel/pipsel">Pipsel Source Code on GitHub</a>
              <span class="sitebit comhead"> (<a href="from?site=github.com"><span class="sitestr">github.com</span></a>)</span>
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

// Browser-based execution of Pipsel AST against a parsed HTML Document
function executeBrowser(ast, doc, url = "https://mockstore.pipsel.dev") {
  const context = {
    doc,
    url,
    timestamp: Date.now()
  };

  return evaluateScope(ast.body, doc.documentElement, context);
}

function evaluateScope(definitions, scope, context) {
  const result = {};

  for (const def of definitions) {
    if (def.type === "MetaDefinition") {
      result[def.name] = evaluateMeta(def, context);
    } else if (def.type === "FieldDefinition") {
      const val = evaluateField(def, scope, context);
      if (def.isOptional && val === null) {
        // Skip optional fields that evaluate to null
      } else {
        result[def.name] = val;
      }
    } else if (def.type === "ListDefinition") {
      result[def.name] = evaluateList(def, scope, context);
    }
  }

  return result;
}

function evaluateMeta(def, context) {
  switch (def.metaVariable) {
    case "@url":
      return context.url;
    case "@timestamp":
      return new Date(context.timestamp).toISOString();
    default:
      return null;
  }
}

function resolveSourceBrowser(source, scope, context) {
  switch (source.type) {
    case "Selector":
      return Array.from(scope.querySelectorAll(source.value));
    case "Self":
      return [scope];
    case "Parent":
      return scope.parentElement ? [scope.parentElement] : [];
    case "Root":
      return [context.doc.documentElement];
    case "Meta":
      switch (source.name) {
        case "url":
          return context.url;
        case "timestamp":
          return new Date(context.timestamp).toISOString();
        default:
          return null;
      }
  }
}

function evaluateField(def, scope, context) {
  const sourceVal = resolveSourceBrowser(def.source, scope, context);

  if (def.source.type === "Meta") {
    let value = sourceVal;
    for (let i = 0; i < def.pipes.length; i++) {
      const pipe = def.pipes[i];
      value = evaluatePipe(pipe, value, false, context);
    }
    return value;
  }

  const elements = sourceVal; // Element[]
  if (elements.length === 0) {
    const fallbackPipe = def.pipes.find(p => p.name === 'fallback');
    return fallbackPipe && fallbackPipe.args.length > 0 ? fallbackPipe.args[0].value : null;
  }

  let value = elements;

  // Default to text if no pipes are specified
  if (def.pipes.length === 0) {
    return elements[0].textContent.trim();
  }

  let isSelection = true;
  for (let i = 0; i < def.pipes.length; i++) {
    const pipe = def.pipes[i];
    value = evaluatePipe(pipe, value, isSelection, context);
    
    const isTraversal = ["find", "closest", "parent", "children", "siblings", "next", "prev", "eq", "first", "last"].includes(pipe.name);
    const isExtractor = ["text", "html", "attr"].includes(pipe.name);
    if (isTraversal) {
      isSelection = true;
    } else if (isExtractor) {
      isSelection = false;
    } else {
      isSelection = false;
    }
  }

  return value;
}

function evaluateList(def, scope, context) {
  const sourceVal = resolveSourceBrowser(def.source, scope, context);
  if (def.source.type === "Meta") {
    return [];
  }

  const elements = sourceVal; // Element[]
  const listResult = [];

  elements.forEach(el => {
    const itemResult = evaluateScope(def.body, el, context);
    listResult.push(itemResult);
  });

  return listResult;
}

function evaluatePipe(pipe, currentValue, isSelection, context) {
  if (isSelection) {
    const els = currentValue; // Element[]
    switch (pipe.name) {
      case "find": {
        const res = [];
        const selector = pipe.args[0]?.value;
        els.forEach(el => {
          res.push(...Array.from(el.querySelectorAll(selector)));
        });
        return res;
      }
      case "closest": {
        const res = [];
        const selector = pipe.args[0]?.value;
        els.forEach(el => {
          const closestEl = el.closest(selector);
          if (closestEl) res.push(closestEl);
        });
        return res;
      }
      case "parent": {
        const res = [];
        els.forEach(el => {
          if (el.parentElement) res.push(el.parentElement);
        });
        return res;
      }
      case "children": {
        const res = [];
        const selector = pipe.args[0]?.value;
        els.forEach(el => {
          const children = Array.from(el.children);
          if (selector) {
            res.push(...children.filter(c => c.matches(selector)));
          } else {
            res.push(...children);
          }
        });
        return res;
      }
      case "siblings": {
        const res = [];
        const selector = pipe.args[0]?.value;
        els.forEach(el => {
          if (el.parentElement) {
            const siblings = Array.from(el.parentElement.children).filter(c => c !== el);
            if (selector) {
              res.push(...siblings.filter(c => c.matches(selector)));
            } else {
              res.push(...siblings);
            }
          }
        });
        return res;
      }
      case "next": {
        const res = [];
        const selector = pipe.args[0]?.value;
        els.forEach(el => {
          let nextEl = el.nextElementSibling;
          if (selector) {
            while (nextEl && !nextEl.matches(selector)) {
              nextEl = nextEl.nextElementSibling;
            }
          }
          if (nextEl) res.push(nextEl);
        });
        return res;
      }
      case "prev": {
        const res = [];
        const selector = pipe.args[0]?.value;
        els.forEach(el => {
          let prevEl = el.previousElementSibling;
          if (selector) {
            while (prevEl && !prevEl.matches(selector)) {
              prevEl = prevEl.previousElementSibling;
            }
          }
          if (prevEl) res.push(prevEl);
        });
        return res;
      }
      case "eq": {
        const index = pipe.args[0]?.value;
        return index >= 0 && index < els.length ? [els[index]] : [];
      }
      case "first": {
        return els.length > 0 ? [els[0]] : [];
      }
      case "last": {
        return els.length > 0 ? [els[els.length - 1]] : [];
      }
      case "text":
        return els.map(el => el.textContent).join("");
      case "html":
        return els.map(el => el.outerHTML || "").join("");
      case "attr": {
        const attrName = pipe.args[0]?.value;
        return els.length > 0 ? (els[0].getAttribute(attrName) || null) : null;
      }
      default:
        // default text converter + transformer evaluation
        return evaluateTransformer(pipe, els.map(el => el.textContent).join(""));
    }
  }
  return evaluateTransformer(pipe, currentValue);
}

function evaluateTransformer(pipe, val) {
  if (val === null || val === undefined) {
    if (pipe.name === "fallback") {
      return pipe.args[0].value;
    }
    return null;
  }

  switch (pipe.name) {
    case "trim":
      return typeof val === "string" ? val.trim() : val;
    case "replace": {
      if (typeof val !== "string") return val;
      const from = pipe.args[0]?.value;
      const to = pipe.args[1]?.value;
      return val.replaceAll(from, to);
    }
    case "regex": {
      if (typeof val !== "string") return null;
      const pattern = pipe.args[0]?.value;
      try {
        const re = new RegExp(pattern);
        const match = val.match(re);
        if (!match) return null;
        return match[1] !== undefined ? match[1] : match[0];
      } catch {
        return null;
      }
    }
    case "split": {
      if (typeof val !== "string") return [val];
      const sep = pipe.args[0]?.value;
      const limit = pipe.args[1]?.value;
      return val.split(sep, limit);
    }
    case "int": {
      const parsed = parseInt(String(val).replace(/[^0-9.-]/g, ""), 10);
      return isNaN(parsed) ? null : parsed;
    }
    case "float": {
      const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
      return isNaN(parsed) ? null : parsed;
    }
    case "fallback":
      return val === "" ? pipe.args[0].value : val;
    case "filter": {
      const pattern = pipe.args[0]?.value;
      try {
        const re = new RegExp(pattern);
        if (Array.isArray(val)) {
          return val.filter(item => re.test(String(item)));
        }
        return re.test(String(val)) ? val : null;
      } catch {
        return null;
      }
    }
    default:
      return val;
  }
}

// App entry / Playground updates
document.addEventListener("DOMContentLoaded", () => {
  const pslTextarea = document.getElementById("psl-input");
  const htmlTextarea = document.getElementById("html-input");
  const outputCode = document.getElementById("output-code");
  const errorBadge = document.getElementById("error-badge");
  
  const pslHighlightPre = pslTextarea.parentElement.querySelector(".highlight-overlay");
  const pslHighlightCode = document.getElementById("psl-highlight");
  
  const htmlHighlightPre = htmlTextarea.parentElement.querySelector(".highlight-overlay");
  const htmlHighlightCode = document.getElementById("html-highlight");

  let cachedHtmlVal = "";
  let cachedDoc = null;
  
  // Set default values
  pslTextarea.value = defaultPsl;
  htmlTextarea.value = defaultHtml;

  // Highlight static code blocks in documentation
  if (window.hljs) {
    hljs.highlightAll();
  }

  // Sync scroll positions
  pslTextarea.addEventListener("scroll", () => {
    pslHighlightPre.scrollTop = pslTextarea.scrollTop;
    pslHighlightPre.scrollLeft = pslTextarea.scrollLeft;
  });

  htmlTextarea.addEventListener("scroll", () => {
    htmlHighlightPre.scrollTop = htmlTextarea.scrollTop;
    htmlHighlightPre.scrollLeft = htmlTextarea.scrollLeft;
  });

  const MAX_HIGHLIGHT_LEN = 30000;

  function highlightCodeBlock() {
    if (window.hljs && outputCode.textContent.length <= MAX_HIGHLIGHT_LEN) {
      try {
        hljs.highlightElement(outputCode);
      } catch (e) {
        // ignore
      }
    }
  }

  let currentTab = "json"; // json | ast | lint

  // Debounce helper
  function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Bind tab selection
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      evaluatePlayground();
    });
  });

  document.getElementById("format-btn").addEventListener("click", () => {
    try {
      const formatted = window.Pipsel.format(pslTextarea.value);
      pslTextarea.value = formatted;
      updateBackdropHighlighting();
      evaluatePlayground();
      // Sync scroll after formatting
      pslHighlightPre.scrollTop = pslTextarea.scrollTop;
      pslHighlightPre.scrollLeft = pslTextarea.scrollLeft;
      showToast("Formatted PSL Code!");
    } catch (err) {
      alert("Cannot format: Fix syntax errors first.");
    }
  });

  // Bind copy install button
  document.getElementById("copy-install-btn").addEventListener("click", () => {
    navigator.clipboard.writeText("npm install pipsel");
    showToast("Command copied!");
  });

  // Event listeners for inputs
  pslTextarea.addEventListener("input", () => {
    updateBackdropHighlighting();
    debouncedEvaluate();
  });
  htmlTextarea.addEventListener("input", () => {
    updateBackdropHighlighting();
    debouncedEvaluate();
  });

  // Initialize playground
  updateBackdropHighlighting();
  evaluatePlayground();

  const debouncedEvaluate = debounce(evaluatePlayground, 250);

  function updateBackdropHighlighting() {
    const pslVal = pslTextarea.value;
    const htmlVal = htmlTextarea.value;

    // Update PSL syntax highlighting in backdrop overlay
    try {
      if (window.hljs && pslVal.length <= MAX_HIGHLIGHT_LEN) {
        const highlightedInput = hljs.highlight(pslVal, { language: 'psl' }).value;
        pslHighlightCode.innerHTML = highlightedInput + "\n";
      } else {
        pslHighlightCode.textContent = pslVal;
      }
    } catch (err) {
      pslHighlightCode.textContent = pslVal;
    }

    // Update HTML syntax highlighting in backdrop overlay
    try {
      if (window.hljs && htmlVal.length <= MAX_HIGHLIGHT_LEN) {
        const highlightedHtml = hljs.highlight(htmlVal, { language: 'xml' }).value;
        htmlHighlightCode.innerHTML = highlightedHtml + "\n";
      } else {
        htmlHighlightCode.textContent = htmlVal;
      }
    } catch (err) {
      htmlHighlightCode.textContent = htmlVal;
    }
  }

  function evaluatePlayground() {
    const pslVal = pslTextarea.value;
    const htmlVal = htmlTextarea.value;

    const diagnostics = window.Pipsel.lint(pslVal);
    const errors = diagnostics.filter(d => d.severity === "error");

    // Update Tab Error badge count
    if (errors.length > 0) {
      errorBadge.textContent = errors.length;
      errorBadge.classList.remove("hidden");
    } else {
      errorBadge.classList.add("hidden");
    }

    if (currentTab === "lint") {
      renderLint(diagnostics);
      return;
    }

    // Try parsing
    let ast = null;
    try {
      ast = window.Pipsel.parse(pslVal);
    } catch (err) {
      if (currentTab === "ast") {
        outputCode.textContent = JSON.stringify({ error: err.message }, null, 2);
        outputCode.className = "language-json";
        highlightCodeBlock();
        return;
      }
    }

    if (currentTab === "ast") {
      outputCode.textContent = ast ? JSON.stringify(ast, null, 2) : "// Fix syntax errors to view AST";
      outputCode.className = "language-json";
      highlightCodeBlock();
      return;
    }

    // If currentTab is "json" (Execution)
    if (errors.length > 0 || !ast) {
      outputCode.textContent = "// Resolve PSL syntax and lint errors to run evaluation";
      outputCode.className = "language-json";
      highlightCodeBlock();
      return;
    }

    // Execute
    try {
      if (htmlVal !== cachedHtmlVal || !cachedDoc) {
        const parser = new DOMParser();
        cachedDoc = parser.parseFromString(htmlVal, "text/html");
        cachedHtmlVal = htmlVal;
      }
      const result = executeBrowser(ast, cachedDoc);
      outputCode.textContent = JSON.stringify(result, null, 2);
      outputCode.className = "language-json";
      highlightCodeBlock();
    } catch (err) {
      outputCode.textContent = `// Execution Error: ${err.message}`;
      outputCode.className = "language-json";
      highlightCodeBlock();
    }
  }

  function renderLint(diagnostics) {
    if (diagnostics.length === 0) {
      outputCode.innerHTML = `<span style="color: var(--success); font-weight: 600;">✓ No syntax or semantic lint errors found!</span>`;
      return;
    }

    let html = "";
    diagnostics.forEach(d => {
      const isError = d.severity === "error";
      const badgeClass = isError ? "diagnostic-item" : "diagnostic-item warning";
      const title = isError ? "Lint Error" : "Lint Warning";
      html += `
        <div class="${badgeClass}">
          <h5>${title} (Line ${d.line}, Col ${d.column})</h5>
          <p>${d.message}</p>
        </div>
      `;
    });
    outputCode.innerHTML = html;
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2000);
  }
});
