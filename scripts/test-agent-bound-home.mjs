import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs', 'prototypes', 'onetone-agent-bound-home.html');
const html = fs.readFileSync(file, 'utf8');
let failures = 0;
const check = (value, label) => {
  console.log(`${value ? 'ok  ' : 'FAIL'} ${label}`);
  if (!value) failures += 1;
};

check(html.includes('provider') && html.includes('workspace') && html.includes('session'), '绑定身份包含 provider/workspace/session');
check(html.includes('thread_abc123') && html.includes('E:\\voice-pilot'), '展示真实会话与项目');
check(html.includes('准确聚焦') && html.includes('恢复会话') && html.includes('填入文字'), '展示能力而非名称');
check(html.includes('绑定到当前简报') && html.includes('更换绑定'), '绑定需要用户确认');
check(html.includes('发送状态未知') && !html.includes('发送成功'), '不伪造发送完成');
check(html.includes('候选素材') && html.includes('草稿本'), '素材与草稿职责分离');
check(html.includes('data-panel="result"') && html.includes('data-panel="target"') && html.includes('data-panel="history"'), '右侧包含结果目标记录');
check(html.includes('delivery_20261006_1402') && html.includes('本次投递'), '返回证据关联 delivery');
check(html.includes('NoTouch') && html.includes('疑似违规'), '保护规则反馈存在');
check(html.includes('prefers-reduced-motion'), '尊重减少动态设置');

console.log(failures ? `\n${failures} checks failed` : '\nAll agent-bound home checks passed');
process.exit(failures ? 1 : 0);
