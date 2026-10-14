# Art spend (budget $5.00 hard cap, stop-and-ask at $3.00)

| asset | model | settings | cost_usd |
|---|---|---|---|
| hero-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 1:1  | 0.036292 |
| hero-coarse-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 1:1  | 0.020612 |
| soba-sheet-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 3:2  | 0.015552 |
| soba-sheet-final | openai/gpt-image-2.5-sunburst | --param background=transparent --quality medium --aspect 3:2  | 0.032235 |
| wall-draft | openai/gpt-image-2.5-sunburst | --param background=opaque --quality low --aspect 1:1  | 0.007185 |
| skyline-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 16:9  | 0.004595 |
| streetroof-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 3:2  | 0.006125 |
| props-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 3:2  | 0.00646 |
| plat-draft | openai/gpt-image-2.5-sunburst | --param background=transparent --quality low --aspect 3:2  | 0.00655 |
| wall-draft2 | openai/gpt-image-2.5-sunburst | --param background=opaque --quality low --aspect 1:1  | 0.00704 |
| title-1k | google/gemini-3-pro-image | --resolution 1K --aspect 21:9  | 0.135928 |
| props-final | openai/gpt-image-2.5-sunburst | --param background=transparent --quality medium --aspect 3:2  | 0.024133 |
| plat-final | openai/gpt-image-2.5-sunburst | --param background=transparent --quality medium --aspect 3:2  | 0.024263 |

**Total: $0.3270** of $5.00 (13 calls: 12 gpt-image-2.5-sunburst, 1 gemini-3-pro-image). Rebuild finals: `cd art && python3 scripts/build_assets.py`
