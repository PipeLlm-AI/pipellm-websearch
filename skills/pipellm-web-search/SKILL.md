---
name: pipellm-web-search
description: "RAG-enhanced web search, simple search, news search, and web page reading via PipeLLM. Use these tools for any task that requires information from the web."
---

# PipeLLM Web Search

This plugin provides 4 tools for accessing web information. Choose the right tool based on your task.

## Tool Selection Guide

| Tool | Speed | When to Use |
|------|-------|-------------|
| `pipellm_simple_search` | ~1s ⚡ | Quick lookups, getting URLs, simple facts |
| `pipellm_web_search` | ~5-15s | Research, deep analysis, fact-checking |
| `pipellm_web_reader` | ~3-10s | Reading a specific URL's full content |
| `pipellm_news_search` | ~5-15s | Current events, breaking news, recent developments |
| `tavily_search` | ~1-3s | General web search (alternative, requires Tavily API key) |

### Decision Flow

1. **Need current news?** → `pipellm_news_search`
2. **Have a specific URL to read?** → `pipellm_web_reader`
3. **Need quick search results or URLs?** → `pipellm_simple_search`
4. **Need deep, authoritative content?** → `pipellm_web_search`
5. **No PipeLLM key but have Tavily configured?** → `tavily_search` (general-purpose alternative)

## Tools

### `pipellm_web_search` — RAG Search
Full RAG pipeline: Google Search → Page Crawling → Cohere Embedding → Vector Retrieval → Reranking.
Returns **deep, contextual content extracted from pages**, not just snippets.

- **Parameter:** `query` (string)
- **Best for:** Research, fact-checking, technical lookups
- **Cost:** $0.05 per search

### `pipellm_simple_search` — Quick Search
Calls Google via Serper and returns search snippets directly. No page crawling or RAG.

- **Parameter:** `query` (string)
- **Best for:** Quick facts, getting URLs to read later, browsing results
- **Cost:** $0.05 per search

### `pipellm_web_reader` — Web Page Reader
Fetches a URL and converts the page content to clean Markdown.

- **Parameter:** `url` (string, full URL)
- **Best for:** Reading documentation, articles, blog posts by URL
- **Cost:** $0.05 per page

### `pipellm_news_search` — News Search
Searches Google News via Serper, then applies the full RAG pipeline to news articles.

- **Parameter:** `query` (string)
- **Best for:** Current events, company news, market updates
- **Cost:** $0.05 per search

### `tavily_search` — Tavily Web Search (optional)
General-purpose web search powered by Tavily. Only available when `tavilyApiKey` is configured.

- **Parameters:** `query` (string), optional `searchDepth` ("basic" | "advanced"), `maxResults` (1-20), `topic` ("general" | "news" | "finance")
- **Best for:** General web search when PipeLLM is not configured, or as a fast alternative search option
- **Cost:** Free tier includes 1,000 credits/month at https://app.tavily.com

## Tips

### Writing Good Queries
- Be specific: `"React Server Components streaming SSR"` not `"React"`
- Include context: `"Python asyncio timeout handling best practices"`
- Use natural language: `"How to deploy a Go service to Kubernetes"`

### Combining Tools
For deep research, combine tools:
1. `pipellm_simple_search` to find relevant URLs
2. `pipellm_web_reader` to read the most promising results in full
3. Or use `pipellm_web_search` to do both in one step (automatic)

### Limitations
- Each request costs $0.05 from the user's PipeLLM balance
- RAG searches take 5-15 seconds
- Some JavaScript-heavy or login-protected pages may not render fully

## Setup Guide (for users)

If the API key is not configured and tools return an error, guide the user with these steps:

1. **Register** at [console.pipellm.com](https://console.pipellm.com) — new accounts get $5 free credit
2. Go to **API Keys** → **Create Key** (key starts with `pipe-`)
3. Configure in OpenClaw:
   ```bash
   openclaw configure --section plugins
   ```
   Or edit `openclaw.json` directly:
   ```json
   {
     "plugins": {
       "entries": {
         "pipellm-websearch": {
           "enabled": true,
           "config": {
             "apiKey": "pipe-your-key-here"
           }
         }
       }
     }
   }
   ```
4. Restart OpenClaw gateway
