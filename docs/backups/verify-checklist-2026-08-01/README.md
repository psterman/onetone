# 验收清单 UI 备份（删除前）

日期: 2026-08-01
原因: Gate0-hard (#14–#28) 已于 2026-07-30 勾选通过；产品维护页不再需要此卡。
真源文档: docs/migration-react-islands.md §8.5、docs/roadmap-total-benefit.md

文件:
- fragment.html — 维护页 DOM
- fragment.css — .ot-verify-* 样式
- debug-panel-verify.js — debug-panel.js 中验收逻辑切片（约原 L540–842）
- i18n-debugVerify-keys.txt — zh/en debugVerify* 文案行

恢复: 将 fragment 贴回 index.html 开发者区；CSS 贴回 app.css；JS 贴回 debug-panel.js；i18n 键贴回 i18n.js。
