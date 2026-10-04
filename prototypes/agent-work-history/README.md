# OneTone · Agent 工作记录（小白话术）

对应规格：[docs/superpowers/specs/2026-10-03-agent-home-work-history-design.md](../../docs/superpowers/specs/2026-10-03-agent-home-work-history-design.md) **§12.-1**

## 小白怎么理解

Agent = **会帮我干活的帮手**。首页只回答：

| 标签 | 小白问题 |
|---|---|
| 它现在 | 它在忙吗？ |
| 要你吗 | 要我点一下吗？ |
| 顺不顺 | 出问题了吗？ |
| 做到哪 | 做到哪了？（有记下才显示） |
| 用量 | 还能用多久？（默认进「数据」） |
| 最近帮过 | 最近帮过我啥？ |
| 你现在可以 | 我现在干嘛？（一个按钮） |

工程词（探针 / session / checkpoint）不上首屏。

## 是否真数据

原型默认 fixture；`?live=1` 在 OneTone 内走 `cmd_agent_home_snapshot`。

```powershell
node scripts/test-agent-home-pulse.mjs
node --test prototypes/agent-work-history/prototype.test.mjs
```

打开：`index.html` · 图集：`gallery.html`
