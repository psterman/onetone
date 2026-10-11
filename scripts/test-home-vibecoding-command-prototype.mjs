import fs from 'node:fs';

const html = fs.readFileSync('docs/prototypes/home-vibecoding-command.html', 'utf8');

function section(name) {
  const start = html.indexOf(`data-view="${name}"`);
  const next = html.indexOf('<section class="view"', start + 1);
  if (start < 0) throw new Error(`missing ${name} state`);
  return html.slice(start, next < 0 ? html.length : next);
}

const resume = section('resume');
if (/已经完成|resume-grid|side-facts/.test(resume)) {
  throw new Error('resume reference must not render invented completion facts');
}
if (!/继续上次工作/.test(resume) || !/开始新任务/.test(resume)) {
  throw new Error('resume reference needs primary resume and secondary Prep actions');
}
if (/data-goto="start"[^>]*>开始新任务/.test(resume)) {
  throw new Error('resume secondary must open Prep without pretending resumable became idle');
}

const running = section('running');
if (/3\/5|预计还需|activity|btnParallel|发起另一项任务/.test(running)) {
  throw new Error('running reference must contain coarse facts only');
}
if (!/最近活动/.test(running) || !/查看 Agent/.test(running)) {
  throw new Error('running reference needs freshness and Agent CTA');
}

const attention = section('attention');
if (/阻塞|需要输入|结构化问题示例|attn-grid/.test(attention)) {
  throw new Error('attention reference must not infer a reason without payload');
}
if (!/等待你确认/.test(attention) || !/查看并决定/.test(attention)) {
  throw new Error('attention reference needs generic confirmation language and CTA');
}

if (/parallel-sheet|parallelSheet|btnParallel|parallelIdea/.test(html)) {
  throw new Error('prototype must not include unwired parallel dispatch UI');
}
if (/<div class="strip"[^>]*data-open=/.test(html)) {
  throw new Error('status strip container must not be clickable');
}
if (!/class="demo-toggle"/.test(html) || !/aria-expanded="false"/.test(html)) {
  throw new Error('mobile prototype controls need a collapsed toggle');
}

console.log('test-home-vibecoding-command-prototype: ok');
