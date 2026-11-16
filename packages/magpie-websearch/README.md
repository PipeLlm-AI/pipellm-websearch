# @pipellm/magpie-websearch

PipeLLM WebSearch 为 Magpie Agent 提供实时联网能力。Agent 可以搜索网页、阅读指定页面、查找新闻，并根据返回的来源和正文片段整理答案。

使用本插件需要一个 PipeLLM API Key。安装后，在插件页面添加 Key 即可使用；Magpie 会负责保存和管理这个 Key。

## 能力

| 工具 | 适用场景 |
| --- | --- |
| `web_search` | 深度研究、事实核查和需要上下文的搜索 |
| `simple_search` | 快速查找标题、摘要和来源链接 |
| `web_reader` | 阅读指定网页并获取正文内容 |
| `news_search` | 查找新闻和近期事件 |

深度搜索和新闻搜索适合需要来源的研究任务；快速搜索适合先定位资料；网页阅读适合在已有链接后获取完整上下文。Agent 会看到搜索结果中的来源链接，方便继续核对。

## 使用方式

```bash
magpie plugin add @pipellm/magpie-websearch
magpie plugin login pipellm-websearch
```

在 Magpie 的插件页面安装后，添加 PipeLLM API Key。Agent 会在需要联网搜索或阅读网页时自动调用相应工具。

搜索结果会包含来源链接；使用时请根据来源和上下文核对重要信息。

## 许可证

MIT
