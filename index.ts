import { Type } from "@sinclair/typebox";
import { tavily } from "@tavily/core";

const DEFAULT_ENDPOINT = "https://api.pipellm.ai";

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  contexts?: Array<{ idx: number; text: string }>;
}

interface SearchResponse {
  code: number;
  message: string;
  took_ms?: number;
  data?: {
    organic?: SearchResult[];
  };
}

interface ReaderResponse {
  code: number;
  message: string;
  content?: string;
}

/**
 * Format search results into a readable text block for the agent.
 */
function formatSearchResults(resp: SearchResponse): string {
  if (resp.code !== 200 || !resp.data?.organic?.length) {
    return `No results found. (${resp.message})`;
  }

  const lines: string[] = [];
  const results = resp.data.organic;

  lines.push(`Found ${results.length} results (${resp.took_ms}ms):\n`);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`### ${i + 1}. ${r.title}`);
    lines.push(`**URL:** ${r.link}`);
    lines.push(`**Snippet:** ${r.snippet}`);

    if (r.contexts?.length) {
      lines.push(`**Extracted Content:**`);
      for (const ctx of r.contexts) {
        lines.push(ctx.text);
      }
    }

    lines.push(""); // blank line between results
  }

  return lines.join("\n");
}

/**
 * Validate the API key format. Returns error message or null if OK.
 */
function validateApiKey(apiKey: string | undefined): string | null {
  if (!apiKey) {
    return [
      "❌ PipeLLM API Key not configured.",
      "",
      "To set up this plugin:",
      "1. Register at https://console.pipellm.com and get your API key",
      "2. Run: openclaw configure --section plugins → pipellm-websearch → Enter your API key",
      "3. Or set it in openclaw.json: plugins.entries.pipellm-websearch.config.apiKey",
      "",
      "Your key should start with 'pipe-'",
    ].join("\n");
  }

  if (!apiKey.startsWith("pipe-")) {
    return [
      "⚠️ Invalid API key format.",
      "",
      "PipeLLM API keys start with 'pipe-'. The key you entered doesn't match this format.",
      "Please check your key at https://console.pipellm.com → API Keys",
    ].join("\n");
  }

  return null;
}

/**
 * Make an authenticated request to PipeLLM API.
 */
async function callPipeLLM(
  apiEndpoint: string,
  apiKey: string,
  path: string,
  timeoutMs: number = 120_000,
): Promise<Response> {
  return fetch(`${apiEndpoint}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "pipellm-websearch/1.0.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Handle common HTTP errors with user-friendly messages.
 */
function handleHttpError(
  response: Response,
  apiEndpoint: string,
): { content: Array<{ type: string; text: string }> } | null {
  if (response.status === 401 || response.status === 403) {
    return {
      content: [
        {
          type: "text",
          text: [
            "🔑 Authentication failed — your API key may be invalid or expired.",
            "",
            "Please check:",
            "1. Your key is correct at https://console.pipellm.com → API Keys",
            "2. Your account has sufficient balance",
            "3. The key has not been revoked",
          ].join("\n"),
        },
      ],
    };
  }
  return null;
}

/**
 * Handle fetch errors (timeout, connection refused, etc).
 */
function handleFetchError(
  err: any,
  apiEndpoint: string,
): { content: Array<{ type: string; text: string }> } {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return {
      content: [
        {
          type: "text",
          text: "⏱️ Request timed out. Try a more specific query or a shorter URL.",
        },
      ],
    };
  }

  if (
    err?.code === "ECONNREFUSED" ||
    err?.code === "ENOTFOUND" ||
    err?.cause?.code === "ECONNREFUSED" ||
    err?.cause?.code === "ENOTFOUND"
  ) {
    return {
      content: [
        {
          type: "text",
          text: [
            `🌐 Cannot connect to ${apiEndpoint}`,
            "",
            "Possible causes:",
            "1. No internet connection",
            "2. Custom endpoint URL is incorrect",
            "3. The PipeLLM service may be temporarily unavailable",
          ].join("\n"),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `Request failed: ${err?.message ?? String(err)}`,
      },
    ],
  };
}

export default function (api: any) {
  const pluginConfig: Record<string, string> = (api as any)?.config ?? {};
  const apiKey = pluginConfig.apiKey;
  const tavilyApiKey = pluginConfig.tavilyApiKey;
  const apiEndpoint = (pluginConfig.apiEndpoint || DEFAULT_ENDPOINT).replace(
    /\/+$/,
    "",
  );

  // ─── Tool 1: RAG Search ─────────────────────────────────────────────
  api.registerTool(
    {
      name: "pipellm_web_search",
      description:
        "RAG-enhanced web search. Crawls top results, creates vector embeddings, and reranks passages. " +
        "Returns deep, contextual content — not just snippets. Best for research and fact-checking.",
      parameters: Type.Object({
        query: Type.String({
          description: "The search query. Be specific for better results.",
        }),
      }),
      async execute(_id: string, params: { query: string }) {
        const keyError = validateApiKey(apiKey);
        if (keyError) return { content: [{ type: "text", text: keyError }] };

        const query = params.query?.trim();
        if (!query) {
          return {
            content: [{ type: "text", text: "Please provide a search query." }],
          };
        }

        try {
          const response = await callPipeLLM(
            apiEndpoint,
            apiKey!,
            `/v1/websearch/search?q=${encodeURIComponent(query)}`,
          );

          const authErr = handleHttpError(response, apiEndpoint);
          if (authErr) return authErr;

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            return {
              content: [
                {
                  type: "text",
                  text: `Search failed (HTTP ${response.status}): ${body || response.statusText}`,
                },
              ],
            };
          }

          const data: SearchResponse = await response.json();
          return {
            content: [{ type: "text", text: formatSearchResults(data) }],
          };
        } catch (err: any) {
          return handleFetchError(err, apiEndpoint);
        }
      },
    },
    { optional: true },
  );

  // ─── Tool 2: Simple Search ──────────────────────────────────────────
  api.registerTool(
    {
      name: "pipellm_simple_search",
      description:
        "Fast web search using Google via Serper. Returns search snippets without page crawling or RAG processing. " +
        "Much faster than pipellm_web_search (~1s vs ~5-15s). " +
        "Use when you only need quick search snippets or result URLs, not deep content.",
      parameters: Type.Object({
        query: Type.String({
          description: "The search query.",
        }),
      }),
      async execute(_id: string, params: { query: string }) {
        const keyError = validateApiKey(apiKey);
        if (keyError) return { content: [{ type: "text", text: keyError }] };

        const query = params.query?.trim();
        if (!query) {
          return {
            content: [{ type: "text", text: "Please provide a search query." }],
          };
        }

        try {
          const response = await callPipeLLM(
            apiEndpoint,
            apiKey!,
            `/v1/websearch/simple-search?q=${encodeURIComponent(query)}`,
            30_000, // 30s timeout — simple search is fast
          );

          const authErr = handleHttpError(response, apiEndpoint);
          if (authErr) return authErr;

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            return {
              content: [
                {
                  type: "text",
                  text: `Search failed (HTTP ${response.status}): ${body || response.statusText}`,
                },
              ],
            };
          }

          const data: SearchResponse = await response.json();
          return {
            content: [{ type: "text", text: formatSearchResults(data) }],
          };
        } catch (err: any) {
          return handleFetchError(err, apiEndpoint);
        }
      },
    },
    { optional: true },
  );

  // ─── Tool 3: Web Reader ─────────────────────────────────────────────
  api.registerTool(
    {
      name: "pipellm_web_reader",
      description:
        "Fetch a web page and convert it to clean Markdown text. " +
        "Use when you have a specific URL and need to read its full content. " +
        "Handles JavaScript-rendered pages and extracts readable text.",
      parameters: Type.Object({
        url: Type.String({
          description:
            "The full URL of the web page to read (e.g. https://example.com/article).",
        }),
      }),
      async execute(_id: string, params: { url: string }) {
        const keyError = validateApiKey(apiKey);
        if (keyError) return { content: [{ type: "text", text: keyError }] };

        const url = params.url?.trim();
        if (!url) {
          return {
            content: [{ type: "text", text: "Please provide a URL to read." }],
          };
        }

        try {
          const response = await callPipeLLM(
            apiEndpoint,
            apiKey!,
            `/v1/websearch/reader?url=${encodeURIComponent(url)}`,
            60_000, // 60s timeout for page crawling
          );

          const authErr = handleHttpError(response, apiEndpoint);
          if (authErr) return authErr;

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to read page (HTTP ${response.status}): ${body || response.statusText}`,
                },
              ],
            };
          }

          const data: ReaderResponse = await response.json();
          if (!data.content) {
            return {
              content: [
                {
                  type: "text",
                  text: `Page returned no readable content. The page may require JavaScript or login.`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `**Source:** ${url}\n\n${data.content}`,
              },
            ],
          };
        } catch (err: any) {
          return handleFetchError(err, apiEndpoint);
        }
      },
    },
    { optional: true },
  );

  // ─── Tool 4: News Search ────────────────────────────────────────────
  api.registerTool(
    {
      name: "pipellm_news_search",
      description:
        "Search recent news articles with RAG-enhanced content extraction. " +
        "Uses Google News via Serper, then crawls and reranks article content. " +
        "Best for current events, breaking news, and time-sensitive information.",
      parameters: Type.Object({
        query: Type.String({
          description:
            "The news search query. Include topic, company, or event name.",
        }),
      }),
      async execute(_id: string, params: { query: string }) {
        const keyError = validateApiKey(apiKey);
        if (keyError) return { content: [{ type: "text", text: keyError }] };

        const query = params.query?.trim();
        if (!query) {
          return {
            content: [
              { type: "text", text: "Please provide a news search query." },
            ],
          };
        }

        try {
          const response = await callPipeLLM(
            apiEndpoint,
            apiKey!,
            `/v1/websearch/search-news?q=${encodeURIComponent(query)}`,
          );

          const authErr = handleHttpError(response, apiEndpoint);
          if (authErr) return authErr;

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            return {
              content: [
                {
                  type: "text",
                  text: `News search failed (HTTP ${response.status}): ${body || response.statusText}`,
                },
              ],
            };
          }

          const data: SearchResponse = await response.json();
          return {
            content: [{ type: "text", text: formatSearchResults(data) }],
          };
        } catch (err: any) {
          return handleFetchError(err, apiEndpoint);
        }
      },
    },
    { optional: true },
  );

  // ─── Tool 5: Tavily Search (optional, requires tavilyApiKey) ───────
  if (tavilyApiKey) {
    const tavilyClient = tavily({ apiKey: tavilyApiKey });

    api.registerTool(
      {
        name: "tavily_search",
        description:
          "Web search powered by Tavily. Returns relevant results with content snippets. " +
          "Fast alternative to PipeLLM search — does not require a PipeLLM account. " +
          "Use for general web search, research, and fact-checking.",
        parameters: Type.Object({
          query: Type.String({
            description: "The search query. Be specific for better results.",
          }),
          searchDepth: Type.Optional(
            Type.Union([Type.Literal("basic"), Type.Literal("advanced")], {
              description:
                'Search depth: "basic" for fast results, "advanced" for higher relevance. Default: "basic".',
            }),
          ),
          maxResults: Type.Optional(
            Type.Number({
              description: "Maximum number of results to return (1-20). Default: 5.",
            }),
          ),
          topic: Type.Optional(
            Type.Union(
              [
                Type.Literal("general"),
                Type.Literal("news"),
                Type.Literal("finance"),
              ],
              {
                description:
                  'Search topic: "general", "news", or "finance". Default: "general".',
              },
            ),
          ),
        }),
        async execute(
          _id: string,
          params: {
            query: string;
            searchDepth?: "basic" | "advanced";
            maxResults?: number;
            topic?: "general" | "news" | "finance";
          },
        ) {
          const query = params.query?.trim();
          if (!query) {
            return {
              content: [{ type: "text", text: "Please provide a search query." }],
            };
          }

          try {
            const response = await tavilyClient.search(query, {
              searchDepth: params.searchDepth ?? "basic",
              maxResults: params.maxResults ?? 5,
              topic: params.topic ?? "general",
              includeAnswer: "basic",
            });

            const lines: string[] = [];

            if (response.answer) {
              lines.push(`**Answer:** ${response.answer}\n`);
            }

            if (response.results?.length) {
              lines.push(`Found ${response.results.length} results:\n`);
              for (let i = 0; i < response.results.length; i++) {
                const r = response.results[i];
                lines.push(`### ${i + 1}. ${r.title}`);
                lines.push(`**URL:** ${r.url}`);
                if (r.content) {
                  lines.push(`**Content:** ${r.content}`);
                }
                lines.push("");
              }
            } else {
              lines.push("No results found.");
            }

            return {
              content: [{ type: "text", text: lines.join("\n") }],
            };
          } catch (err: any) {
            return {
              content: [
                {
                  type: "text",
                  text: `Tavily search failed: ${err?.message ?? String(err)}`,
                },
              ],
            };
          }
        },
      },
      { optional: true },
    );
  }
}
