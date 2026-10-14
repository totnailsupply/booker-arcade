# Art spend (budget $10.00 hard cap, review at $5.00)

| asset | model | settings | cost_usd |
|---|---|---|---|
| booker-sheet-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 3:2  | 0.019243 |
| enemies-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 3:2  | 0.006415 |
| booker-sheet-final | openai/gpt-image-2.5-sunburst | --param background=transparent --quality medium --aspect 3:2  | 0.036436 |
| items-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 4:3  | 0.00693 |
| icons-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 1:1  | 0.007535 |
| bosses-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 1:1  | 0.019618 |
| enemies-final | openai/gpt-image-2.5-sunburst | --param background=transparent --quality medium --aspect 3:2  | 0.036121 |
| arena-final | openai/gpt-image-2.5-sunburst | --param background=opaque --quality medium --aspect 3:2  | 0.0114 |
| title-1k | google/gemini-3-pro-image | --resolution 1K --aspect 16:9  | 0.137136 |
| items-fix | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 4:3  | 0.017816 |
| icons-fix | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 1:1  | 0.015327 |
| icon-tail-fix | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 1:1  | 0.014802 |

**Total: $0.3288** of $10.00 (12 calls: 11 gpt-image-2.5-sunburst, 1 gemini-3-pro-image; no exit-code-3 calls). Rebuild finals: `cd art && python3 scripts/build_assets.py`
