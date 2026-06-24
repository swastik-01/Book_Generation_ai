// Image generation adapter for OpenAI and Google. Returns a data URL.
import type { ProviderConfig } from "@/lib/db";

export class ImageNotSupportedError extends Error {
  constructor(provider: string) {
    super(
      `${provider} does not provide an image generation endpoint. ` +
        `Use OpenAI or Google, or switch to Designer mode.`,
    );
    this.name = "ImageNotSupportedError";
  }
}

export async function generateImage(
  provider: ProviderConfig,
  prompt: string,
  opts: { size?: "1024x1024" | "1024x1792" | "1792x1024" } = {},
): Promise<string> {
  const size = opts.size || "1024x1024";
  switch (provider.id) {
    case "openai":
      return openaiImage(provider, prompt, size);
    case "google":
      return googleImage(provider, prompt);
    case "azure":
      return azureImage(provider, prompt, size);
    default:
      throw new ImageNotSupportedError(provider.id);
  }
}

async function openaiImage(p: ProviderConfig, prompt: string, size: string): Promise<string> {
  const model = p.imageModel || "gpt-image-1";
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.apiKey || ""}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      n: 1,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`OpenAI image error ${resp.status}: ${t.slice(0, 300)}`);
  }
  const j = await resp.json();
  const b64 = j.data?.[0]?.b64_json as string | undefined;
  const url = j.data?.[0]?.url as string | undefined;
  if (b64) return `data:image/png;base64,${b64}`;
  if (url) {
    const r = await fetch(url);
    const blob = await r.blob();
    return await blobToDataUrl(blob);
  }
  throw new Error("OpenAI returned no image data");
}

async function googleImage(p: ProviderConfig, prompt: string): Promise<string> {
  const model = p.imageModel || "imagen-3.0-generate-002";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${encodeURIComponent(p.apiKey || "")}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1 },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Google image error ${resp.status}: ${t.slice(0, 300)}`);
  }
  const j = await resp.json();
  const b64 = j.predictions?.[0]?.bytesBase64Encoded as string | undefined;
  if (!b64) throw new Error("Google returned no image data");
  return `data:image/png;base64,${b64}`;
}

async function azureImage(p: ProviderConfig, prompt: string, size: string): Promise<string> {
  const deployment = p.imageDeployment;
  if (!deployment) throw new Error("Azure: set an Image deployment in Settings.");
  const url = `${(p.endpoint || "").replace(/\/$/, "")}/openai/deployments/${deployment}/images/generations?api-version=${p.apiVersion || "2024-02-01"}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": p.apiKey || "" },
    body: JSON.stringify({ prompt, size, n: 1 }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Azure image error ${resp.status}: ${t.slice(0, 300)}`);
  }
  const j = await resp.json();
  const b64 = j.data?.[0]?.b64_json as string | undefined;
  const u = j.data?.[0]?.url as string | undefined;
  if (b64) return `data:image/png;base64,${b64}`;
  if (u) {
    const r = await fetch(u);
    return await blobToDataUrl(await r.blob());
  }
  throw new Error("Azure returned no image data");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function svgToPngDataUrl(svg: string, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export const IMAGE_CAPABLE_PROVIDERS = new Set(["openai", "google", "azure"]);
