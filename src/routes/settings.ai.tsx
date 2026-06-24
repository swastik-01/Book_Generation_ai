import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/app/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getSettings,
  saveSettings,
  type AppSettings,
  type PlagiarismEngine,
  type ProviderId,
} from "@/lib/db";
import { providerLabel, callLLM } from "@/llm/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/settings/ai")({
  component: () => (
    <Shell>
      <AISettings />
    </Shell>
  ),
});

const PROVIDERS: ProviderId[] = ["openai", "anthropic", "google", "azure", "ollama", "lmstudio"];
const IMAGE_CAPABLE: ProviderId[] = ["openai", "google", "azure"];
const OPENAI_IMG_MODELS = ["gpt-image-1", "dall-e-3", "dall-e-2"];
const GOOGLE_IMG_MODELS = ["imagen-3.0-generate-002", "imagen-3.0-fast-generate-001"];

function AISettings() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [testing, setTesting] = useState<ProviderId | null>(null);
  useEffect(() => {
    getSettings().then(setS);
  }, []);

  if (!s) return <div className="p-6 sm:p-10">Loading…</div>;

  function update(next: AppSettings) {
    setS(next);
    saveSettings(next);
  }

  async function test(id: ProviderId) {
    setTesting(id);
    try {
      const res = await callLLM(s!.providers[id], {
        messages: [{ role: "user", content: "Reply with the word: ok" }],
        maxTokens: 10,
      });
      if (res.text.toLowerCase().includes("ok")) toast.success(`${providerLabel[id]} works ✓`);
      else toast.success(`${providerLabel[id]} responded: ${res.text.slice(0, 60)}`);
    } catch (e) {
      toast.error(`${providerLabel[id]}: ${(e as Error).message}`);
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="font-serif text-4xl sm:text-5xl">AI Providers</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl">
        Bring your own keys. Everything is stored only in this browser. Calls go directly from your
        browser to the provider you choose.
      </p>

      <Card className="mt-8 p-4 sm:p-5">
        <Label>Default provider</Label>
        <p className="text-xs text-muted-foreground mb-3">
          Used by the editor and book generator unless overridden.
        </p>
        <Select
          value={s.defaultProvider}
          onValueChange={(v) => update({ ...s, defaultProvider: v as ProviderId })}
        >
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>
                {providerLabel[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Tabs defaultValue="openai" className="mt-8">
        <TabsList className="flex-wrap h-auto">
          {PROVIDERS.map((p) => (
            <TabsTrigger key={p} value={p}>
              {providerLabel[p]}
            </TabsTrigger>
          ))}
        </TabsList>

        {PROVIDERS.map((id) => {
          const p = s.providers[id];
          return (
            <TabsContent key={id} value={id}>
              <Card className="space-y-4 p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-serif text-2xl">{providerLabel[id]}</h3>
                    {(id === "ollama" || id === "lmstudio") && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        For Ollama, run with{" "}
                        <code className="bg-muted px-1 rounded mx-1">OLLAMA_ORIGINS=*</code> so the
                        browser can reach it.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`en-${id}`} className="text-sm">
                      Enabled
                    </Label>
                    <Switch
                      id={`en-${id}`}
                      checked={p.enabled}
                      onCheckedChange={(v) =>
                        update({ ...s, providers: { ...s.providers, [id]: { ...p, enabled: v } } })
                      }
                    />
                  </div>
                </div>

                {(id === "openai" || id === "anthropic" || id === "google") && (
                  <Field
                    label="API key"
                    type="password"
                    value={p.apiKey || ""}
                    onChange={(v) =>
                      update({ ...s, providers: { ...s.providers, [id]: { ...p, apiKey: v } } })
                    }
                  />
                )}
                {id === "azure" && (
                  <>
                    <Field
                      label="Endpoint"
                      placeholder="https://your-resource.openai.azure.com"
                      value={p.endpoint || ""}
                      onChange={(v) =>
                        update({ ...s, providers: { ...s.providers, [id]: { ...p, endpoint: v } } })
                      }
                    />
                    <Field
                      label="Deployment name"
                      value={p.deployment || ""}
                      onChange={(v) =>
                        update({
                          ...s,
                          providers: { ...s.providers, [id]: { ...p, deployment: v } },
                        })
                      }
                    />
                    <Field
                      label="API version"
                      value={p.apiVersion || ""}
                      onChange={(v) =>
                        update({
                          ...s,
                          providers: { ...s.providers, [id]: { ...p, apiVersion: v } },
                        })
                      }
                    />
                    <Field
                      label="API key"
                      type="password"
                      value={p.apiKey || ""}
                      onChange={(v) =>
                        update({ ...s, providers: { ...s.providers, [id]: { ...p, apiKey: v } } })
                      }
                    />
                  </>
                )}
                {(id === "ollama" || id === "lmstudio") && (
                  <Field
                    label="Base URL"
                    value={p.baseUrl || ""}
                    onChange={(v) =>
                      update({ ...s, providers: { ...s.providers, [id]: { ...p, baseUrl: v } } })
                    }
                  />
                )}
                {id !== "azure" && (
                  <Field
                    label="Model"
                    value={p.model || ""}
                    onChange={(v) =>
                      update({ ...s, providers: { ...s.providers, [id]: { ...p, model: v } } })
                    }
                  />
                )}

                {IMAGE_CAPABLE.includes(id) ? (
                  <div className="pt-3 border-t space-y-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Image generation
                    </div>
                    {id === "azure" ? (
                      <Field
                        label="Image deployment name"
                        placeholder="e.g. dalle-3"
                        value={p.imageDeployment || ""}
                        onChange={(v) =>
                          update({
                            ...s,
                            providers: { ...s.providers, [id]: { ...p, imageDeployment: v } },
                          })
                        }
                      />
                    ) : (
                      <div className="space-y-1.5">
                        <Label>Image model</Label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Select
                            value={
                              p.imageModel ||
                              (id === "openai" ? OPENAI_IMG_MODELS[0] : GOOGLE_IMG_MODELS[0])
                            }
                            onValueChange={(v) =>
                              update({
                                ...s,
                                providers: { ...s.providers, [id]: { ...p, imageModel: v } },
                              })
                            }
                          >
                            <SelectTrigger className="w-full sm:w-64">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(id === "openai" ? OPENAI_IMG_MODELS : GOOGLE_IMG_MODELS).map(
                                (m) => (
                                  <SelectItem key={m} value={m}>
                                    {m}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Or custom…"
                            value={p.imageModel || ""}
                            onChange={(e) =>
                              update({
                                ...s,
                                providers: {
                                  ...s.providers,
                                  [id]: { ...p, imageModel: e.target.value },
                                },
                              })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground pt-2 border-t">
                    No image generation endpoint — use Designer mode in Cover Studio.
                  </p>
                )}

                <div className="pt-2">
                  <Button variant="outline" onClick={() => test(id)} disabled={testing === id}>
                    {testing === id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Test connection
                  </Button>
                </div>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      <Card className="mt-8 space-y-3 p-4 sm:p-6">
        <h3 className="font-serif text-2xl">Plagiarism scanner</h3>
        <p className="text-xs text-muted-foreground">
          The scanner runs in your browser and calls the search API directly using your key. Use the
          Local engine for offline internal-duplicate checks only.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Engine</Label>
            <Select
              value={s.plagiarism?.engine || "local"}
              onValueChange={(v) =>
                update({
                  ...s,
                  plagiarism: {
                    ...(s.plagiarism || { engine: "local" as PlagiarismEngine }),
                    engine: v as PlagiarismEngine,
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local heuristic (no key)</SelectItem>
                <SelectItem value="google">Google Programmable Search</SelectItem>
                <SelectItem value="bing">Bing Web Search</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(s.plagiarism?.engine === "google" || s.plagiarism?.engine === "bing") && (
            <Field
              label="API key"
              type="password"
              value={s.plagiarism?.apiKey || ""}
              onChange={(v) =>
                update({
                  ...s,
                  plagiarism: {
                    ...(s.plagiarism || { engine: "local" as PlagiarismEngine }),
                    apiKey: v,
                  },
                })
              }
            />
          )}
          {s.plagiarism?.engine === "google" && (
            <Field
              label="Search engine ID (CX)"
              value={s.plagiarism?.cx || ""}
              onChange={(v) =>
                update({
                  ...s,
                  plagiarism: {
                    ...(s.plagiarism || { engine: "local" as PlagiarismEngine }),
                    cx: v,
                  },
                })
              }
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
