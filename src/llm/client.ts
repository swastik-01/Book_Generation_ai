import type { ProviderConfig, ProviderId } from "@/lib/db";

export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

export interface LLMRequest {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResult {
  text: string;
}

/** Stream tokens. onToken called for each delta. */
export async function streamLLM(
  provider: ProviderConfig,
  req: LLMRequest,
  onToken: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<LLMResult> {
  switch (provider.id) {
    case "openai":
      return openAICompatible(
        "https://api.openai.com/v1/chat/completions",
        provider.model || "gpt-4o-mini",
        provider.apiKey || "",
        {},
        req,
        onToken,
        signal,
      );
    case "lmstudio":
      return openAICompatible(
        `${(provider.baseUrl || "http://localhost:1234/v1").replace(/\/$/, "")}/chat/completions`,
        provider.model || "local-model",
        provider.apiKey || "lm-studio",
        {},
        req,
        onToken,
        signal,
      );
    case "ollama":
      return ollama(provider, req, onToken, signal);
    case "azure": {
      const url = `${(provider.endpoint || "").replace(/\/$/, "")}/openai/deployments/${provider.deployment}/chat/completions?api-version=${provider.apiVersion || "2024-08-01-preview"}`;
      return openAICompatible(
        url,
        provider.deployment || "",
        provider.apiKey || "",
        { "api-key": provider.apiKey || "" },
        req,
        onToken,
        signal,
        true,
      );
    }
    case "anthropic":
      return anthropic(provider, req, onToken, signal);
    case "google":
      return google(provider, req, onToken, signal);
  }
}

async function openAICompatible(
  url: string,
  model: string,
  apiKey: string,
  extraHeaders: Record<string, string>,
  req: LLMRequest,
  onToken: (c: string) => void,
  signal?: AbortSignal,
  isAzure = false,
): Promise<LLMResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (!isAzure && apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    stream: true,
    temperature: req.temperature ?? 0.8,
  };
  if (req.maxTokens) body.max_tokens = req.maxTokens;

  let resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  let retryCount = 0;
  while (!resp.ok && retryCount < 2) {
    const errorText = await resp.clone().text().catch(() => "");
    let needsRetry = false;

    if (body.max_tokens && errorText.includes("max_tokens") && errorText.includes("max_completion_tokens")) {
      delete body.max_tokens;
      body.max_completion_tokens = req.maxTokens;
      needsRetry = true;
    }

    if (body.temperature !== 1 && errorText.includes("temperature") && errorText.includes("default (1) value is supported")) {
      body.temperature = 1;
      needsRetry = true;
    }

    if (!needsRetry) break;

    resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    retryCount++;
  }

  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => "");
    throw new Error(`LLM error ${resp.status}: ${t.slice(0, 300)}`);
  }
  return readSSE(resp.body, onToken);
}

async function readSSE(
  body: ReadableStream<Uint8Array>,
  onToken: (c: string) => void,
): Promise<LLMResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return { text: full };
      try {
        const j = JSON.parse(data);
        const c = j.choices?.[0]?.delta?.content;
        if (typeof c === "string" && c) {
          full += c;
          onToken(c);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { text: full };
}

async function ollama(
  p: ProviderConfig,
  req: LLMRequest,
  onToken: (c: string) => void,
  signal?: AbortSignal,
): Promise<LLMResult> {
  const url = `${(p.baseUrl || "http://localhost:11434").replace(/\/$/, "")}/api/chat`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: p.model || "llama3.1",
      messages: req.messages,
      stream: true,
      options: { temperature: req.temperature ?? 0.8 },
    }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Ollama error ${resp.status}: ${t.slice(0, 300)}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const j = JSON.parse(line);
        const c = j.message?.content;
        if (c) {
          full += c;
          onToken(c);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { text: full };
}

async function anthropic(
  p: ProviderConfig,
  req: LLMRequest,
  onToken: (c: string) => void,
  signal?: AbortSignal,
): Promise<LLMResult> {
  const sys = req.messages.find((m) => m.role === "system")?.content;
  const msgs = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": p.apiKey || "",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: p.model || "claude-3-5-sonnet-latest",
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.8,
      system: sys,
      messages: msgs,
      stream: true,
    }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Anthropic error ${resp.status}: ${t.slice(0, 300)}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      try {
        const j = JSON.parse(line.slice(6));
        if (j.type === "content_block_delta" && j.delta?.text) {
          full += j.delta.text;
          onToken(j.delta.text);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { text: full };
}

async function google(
  p: ProviderConfig,
  req: LLMRequest,
  onToken: (c: string) => void,
  signal?: AbortSignal,
): Promise<LLMResult> {
  const model = p.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(p.apiKey || "")}`;
  const sys = req.messages.find((m) => m.role === "system")?.content;
  const contents = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: req.temperature ?? 0.8 },
  };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Google error ${resp.status}: ${t.slice(0, 300)}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      try {
        const j = JSON.parse(line.slice(6));
        const parts = j.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.text) {
              full += part.text;
              onToken(part.text);
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { text: full };
}

export async function callLLM(provider: ProviderConfig, req: LLMRequest): Promise<LLMResult> {
  let text = "";
  await streamLLM(provider, req, (c) => {
    text += c;
  });
  return { text };
}

export const providerLabel: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  azure: "Azure OpenAI",
  ollama: "Ollama (local)",
  lmstudio: "LM Studio (local)",
};
