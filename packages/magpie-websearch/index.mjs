const PROVIDER = "pipellm-websearch"
const API = "https://api.pipellm.ai"

async function key(input, options) {
  if (options?.apiKey) return options.apiKey
  const raw = await Bun.file(`${input.directory}/plugin-auth.json`).text().catch(() => "")
  const auth = raw ? JSON.parse(raw)?.[PROVIDER] : undefined
  if (auth?.type === "api" && auth.key) return auth.key
  throw new Error("Sign in with: magpie plugin login pipellm-websearch")
}

function stringArg(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`)
  return value.trim()
}

function tool(input, options, path, field, description) {
  return {
    description,
    args: { type: "object", properties: { [field]: { type: "string", minLength: 1 } }, required: [field], additionalProperties: false },
    async execute(args, ctx = {}) {
      const value = stringArg(args?.[field], field)
      if (Object.keys(args ?? {}).length !== 1) throw new Error(`only ${field} is accepted`)
      if (field === "url" && !/^https?:\/\//i.test(value)) throw new Error("url must be HTTP(S)")
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 50_000)
      const signal = ctx.abort ? AbortSignal.any([ctx.abort, controller.signal]) : controller.signal
      try {
        const token = await key(input, options)
        const url = `${options?.apiEndpoint ?? API}/v1/websearch/${path}?${field === "url" ? "url" : "q"}=${encodeURIComponent(value)}`
        const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal })
        if (!response.ok) throw new Error(`PipeLLM request failed: HTTP ${response.status}`)
        return JSON.stringify(await response.json())
      } finally { clearTimeout(timer) }
    },
  }
}

export default { id: PROVIDER, server: async (input = {}, options = {}) => ({
  config: async (config) => { config.provider ??= {}; config.provider[PROVIDER] ??= { name: "PipeLLM WebSearch", models: {} } },
  auth: { provider: PROVIDER, single: true, methods: [{ type: "api", label: "添加 PipeLLM API Key", placeholder: "pipe-…" }] },
  tool: {
    web_search: tool(input, options, "search", "query", "Deep web search with extracted and reranked content."),
    simple_search: tool(input, options, "simple-search", "query", "Fast web search with snippets."),
    web_reader: tool(input, options, "reader", "url", "Read a public web page as JSON text."),
    news_search: tool(input, options, "search-news", "query", "Search current news with extracted content."),
  },
}) }
