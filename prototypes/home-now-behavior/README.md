# OneTone 首页 Now · v1 基线原型

对应规格：[docs/superpowers/specs/2026-10-03-home-now-architecture-design.md](../../docs/superpowers/specs/2026-10-03-home-now-architecture-design.md)

审阅结论后的收敛版：

| 版本 | 处置 |
|---|---|
| v1 情境陈述 | **基线**：产品画布唯一首页表达 |
| v2 注意力接管 | **放弃** |
| v3 进程轻显 | **手法**：准入后并入基线的内联细线 |
| v4 依据召回 | **手法**：仅在「查看判断依据」展开后出现 |

## 打开

浏览器打开 `index.html`。

| 模式 | URL | 布局 |
|---|---|---|
| 审阅 | `?mode=quiet` | 并排 grid：左审阅栏 + 右 640×680，互不遮挡 |
| 正式比较 | `?mode=quiet&canvas=1` | 文档严格 640×680，无 chrome / label / padding / 滚动 |

正式比较：点「单独打开画布」（新窗口），或把浏览器窗口设为 640×680 后打开 `canvas=1`。

快捷键：`Q / A / W / D` 切模式，`R` 重绘。

### 四模式 canvas 验收

```
index.html?canvas=1&mode=quiet
index.html?canvas=1&mode=attention
index.html?canvas=1&mode=return
index.html?canvas=1&mode=degraded
```

每页应：无横向滚动、无审阅栏、产品内容铺满视口。

## 验收

```powershell
node --test prototypes/home-now-behavior/prototype.test.mjs
```
