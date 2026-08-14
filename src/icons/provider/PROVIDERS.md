# LLM Provider Icons

> Icons for services with a public quota / usage API.
> Consumed by the SoftPad "用量" page and the mini-bar usage-pill dropdown.

Status legend: ✅ real · 🟡 placeholder (replace before shipping) · ⚠️ alias

## P0 (1-week, must-have for Slice A)

| Provider | Status | Quota endpoint |
|---|---|---|
| `openrouter` | 🟡 | `GET https://openrouter.ai/api/v1/auth/key` |
| `deepseek` | 🟡 | `GET https://api.deepseek.com/user/balance` |
| `moonshot` | 🟡 | `GET https://api.moonshot.cn/v1/users/me/balance` |
| `kimi` | ⚠️ alias | alias of `moonshot` |
| `siliconflow` | 🟡 | `GET https://api.siliconflow.cn/v1/user/info` |

## P1 (this month)

| Provider | Status | Quota endpoint |
|---|---|---|
| `anthropic` | 🟡 | `GET /v1/organizations/{org}/usage` (admin key) |
| `openai` | 🟡 | `GET /v1/usage?date=...` (admin key) |
| `qwen` | 🟡 | `GET https://dashscope.aliyuncs.com/api/v1/usage` (RAM AccessKey) |
| `zhipu` | 🟡 | `GET /api/paas/v4/usage` |

## P2 (quarter)

| Provider | Status | Quota endpoint |
|---|---|---|
| `replicate` | 🟡 | `GET /v1/account` |
| `elevenlabs` | 🟡 | `GET /v1/user` |
| `mistral` | 🟡 | `GET /v1/usage` |
| `groq` | 🟡 | `GET /openai/v1/usage` |
| `together` | 🟡 | `GET /v1/usage` |
| `fireworks` | 🟡 | `GET /v1/usage` |
| `cohere` | 🟡 | `GET /v1/usage` |
| `stability` | 🟡 | `GET /v1/user/account` |
| `runway` | 🟡 | console API |
| `hailuo` | 🟡 | MiniMax Hailuo video |
| `kling` | 🟡 | Kuaishou Kling video |
| `jimeng` | 🟡 | ByteDance Jimeng |

## Adding a new provider

1. Drop `<name>.svg` (preferred) + `<name>.png` into this folder
2. Update the manifest table above (mark ✅ real)
3. Add `ProviderId::<Name>` to `src-tauri/src/provider_usage.rs`
4. Write the fetch adapter (mirror `openrouter.rs` template)
5. Add error-mapping unit tests for: 401 / 429 / timeout / unexpected JSON
6. Update `AGENTS.md` (parent folder) too

## Brand assets

See [`../app-target/AGENTS.md`](../app-target/AGENTS.md) § "Source of brand assets" for the official asset pages.
