# Agent 检测首页原型

`split`（默认）：左 Dock + Soft Pad，右完整 DataBoard。Dock 是唯一全局 focus；源条 / rank / ledger 进入 single。

## 能力

- 五镜头：效率 / 费用 / 能力 / 时长 / 灵感
- 筛选弹层、源条、账本（官方 booked 入账、估价不计）
- single + 八字段诚实表；目前只有今日
- Soft Pad 默认可紧凑

## 打开

```bash
npx --yes serve prototypes/agent-detect-home -l 5188
```

`http://127.0.0.1:5188/?view=split&scene=mixed&agent=cursor`

## 检查

```bash
node scripts/test-agent-detect-home.mjs
node scripts/smoke-agent-detect-home.mjs
```
