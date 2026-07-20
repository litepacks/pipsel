# Discover API - Provider Integrations & Examples

The **Discover** feature in **pipsel** is completely decoupled from any specific LLM provider, SDK, or network client. By implementing the simple `LLMProvider` interface, you can plug in any model or service of your choice.

```typescript
export interface LLMProvider {
  call(prompt: string): Promise<string>;
}
```

Here are complete copy-pasteable examples for the most popular LLM providers.

---

## 1. Gemini (Google Gen AI SDK)

Uses the official `@google/genai` client library. We recommend `gemini-2.5-flash` or `gemini-2.5-pro`.

```typescript
import { GoogleGenAI } from "@google/genai";
import { pipsel } from "pipsel";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const geminiProvider = {
  async call(prompt: string): Promise<string> {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      // Optional: Set system instruction or temperature
      config: {
        temperature: 0.1
      }
    });
    return response.text || "";
  }
};

// Usage
const result = await pipsel(html).discover({
  fields: ["title", "price", "image", "url"],
  provider: geminiProvider
});
```

---

## 2. OpenAI SDK

Uses the official `openai` SDK. We recommend `gpt-4o-mini` or `gpt-4o`.

```typescript
import OpenAI from "openai";
import { pipsel } from "pipsel";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const openaiProvider = {
  async call(prompt: string): Promise<string> {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    });
    return response.choices[0].message.content || "";
  }
};

// Usage
const result = await pipsel(html).discover({
  fields: ["title", "price", "image", "url"],
  provider: openaiProvider
});
```

---

## 3. DeepSeek API

DeepSeek provides an OpenAI-compatible endpoint. You can use the `openai` client library by changing the `baseURL`.

```typescript
import OpenAI from "openai";
import { pipsel } from "pipsel";

const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY
});

const deepseekProvider = {
  async call(prompt: string): Promise<string> {
    const response = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    });
    return response.choices[0].message.content || "";
  }
};

// Usage
const result = await pipsel(html).discover({
  fields: ["title", "price", "image", "url"],
  provider: deepseekProvider
});
```

---

## 4. Anthropic Claude (SDK)

Uses the official `@anthropic-ai/sdk` package. We recommend `claude-3-5-haiku` or `claude-3-5-sonnet`.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { pipsel } from "pipsel";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const claudeProvider = {
  async call(prompt: string): Promise<string> {
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 4000,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }]
    });
    
    const block = response.content[0];
    return block.type === "text" ? block.text : "";
  }
};

// Usage
const result = await pipsel(html).discover({
  fields: ["title", "price", "image", "url"],
  provider: claudeProvider
});
```

---

## 5. Local LLMs (Ollama)

You can run local models like `llama3` or `mistral` via Ollama without any API keys.

```typescript
import { pipsel } from "pipsel";

const ollamaProvider = {
  async call(prompt: string): Promise<string> {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1
        }
      })
    });
    
    const data = await response.json();
    return data.response || "";
  }
};

// Usage
const result = await pipsel(html).discover({
  fields: ["title", "price", "image", "url"],
  provider: ollamaProvider
});
```
