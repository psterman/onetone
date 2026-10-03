# OneTone 首页控制中心 · 八方向原型

独立比较原型，不读取配置，也不修改生产首页。

```powershell
npx serve prototypes/home-control-center -l 4178 --no-port-switching
```

打开 `http://localhost:4178`。底部选择八个方向；顶部切换五种状态；“评审”记录六项评分与备注；“比较结果”汇总可融合元素。

键盘：`1–8` 选择方向，左右方向键切换，`R` 重播当前方向。输入框聚焦时不会触发这些快捷键。

原型只模拟当前会话交互，不代表真实 Agent 调度、语音识别、历史、进度或额度数据。
