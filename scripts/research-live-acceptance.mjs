/**
 * Live research acceptance notes + offline funnel self-check.
 *
 * True WorkBuddy + search IPC requires the running OneTone app.
 * This script:
 *  - Always runs offline orchestration assertions on home-research.js
 *  - Writes a checklist under logs/research-live/<runId>/
 *  - Marks live IPC cases as 未完成 unless RESEARCH_LIVE_IPC=1 and a runner injects results
 *
 * Run: node scripts/research-live-acceptance.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(root, 'logs', 'research-live', runId);
fs.mkdirSync(outDir, { recursive: true });

const researchSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-research.js'),
  'utf8'
);
const sandbox = {
  console,
  Date,
  JSON,
  Array,
  Object,
  String,
  Promise,
  Error,
  Math,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (fn) => setTimeout(fn, 0)
};
vm.createContext(sandbox);
vm.runInContext(researchSrc, sandbox);
const R = sandbox.OneToneHomeResearch;

const cases = [
  {
    id: 'food-xiafan',
    topic: '为什么b站这么多人喜欢美食下饭',
    mustIdentify: ['b站', '哔哩哔哩', '下饭', '美食'],
    passCriteria: [
      '识别平台与现象（非整句专名硬匹配）',
      '相关候选进入 picked / fetchAttempt≥1 或明确记录预算/无 URL',
      '报告可为线索整理；不要求编造确定原因'
    ]
  },
  {
    id: 'office-ye',
    topic: '为什么b站现在没有办公室小野的消息了？',
    mustIdentify: ['办公室小野'],
    passCriteria: [
      '识别对象「办公室小野」',
      '相关候选尝试抓取',
      '无公开依据时原因保持未知'
    ]
  }
];

const offline = [];
for (const c of cases) {
  const anchors = R.extractTopicAnchors(c.topic);
  const intentReady = R.normalizeResearchIntent(
    {
      originalQuestion: c.topic,
      researchGoal: '调查公开线索',
      questionType: 'cause',
      entities:
        c.id === 'food-xiafan'
          ? [{ name: '哔哩哔哩', aliases: ['b站', 'B站'], kind: 'platform' }]
          : [{ name: '办公室小野', aliases: ['小野'], kind: 'person' }],
      phenomenon: c.id === 'food-xiafan' ? '美食下饭' : '缺少近况消息',
      searchConcepts:
        c.id === 'food-xiafan' ? ['下饭视频', '吃播', '陪伴感'] : ['近况', '停更'],
      facets: [
        {
          id: 'f1',
          label: '线索',
          questions: [c.topic],
          queries:
            c.id === 'food-xiafan'
              ? ['哔哩哔哩 下饭视频 观看动机', '美食视频 陪伴感']
              : ['办公室小野 近况', '办公室小野 停更']
        }
      ]
    },
    c.topic
  );
  assert.equal(intentReady.status, 'ready');
  assert.equal(intentReady.originalQuestion, R.normalizeResearchTopic(c.topic));

  const hits =
    c.id === 'food-xiafan'
      ? [
          {
            title: 'B站下饭吃播为什么火',
            url: 'https://example.com/food',
            snippet: '陪伴感 下饭视频'
          },
          {
            title: '无关天气',
            url: 'https://example.com/weather',
            snippet: '台风'
          }
        ]
      : [
          {
            title: '办公室小野近况讨论',
            url: 'https://example.com/ye',
            snippet: '博主 停更'
          },
          {
            title: 'b站推荐算法',
            url: 'https://example.com/algo',
            snippet: '推荐'
          }
        ];
  const ranked = R.rankHitsForIntent(hits, intentReady, intentReady.facets[0], {
    strictAliases: c.id === 'office-ye'
  });
  assert.ok(ranked.relevantHits >= 1, c.id + ' should keep related hits');
  assert.ok(ranked.hits.length >= 1, c.id + ' ranked hits nonempty');

  offline.push({
    id: c.id,
    topic: c.topic,
    anchors: {
      primary: anchors.primary,
      requirePrimary: anchors.requirePrimary
    },
    intentStatus: intentReady.status,
    entities: intentReady.entities,
    searchConcepts: intentReady.searchConcepts,
    funnel: {
      rawHits: ranked.rawHits,
      relevantHits: ranked.relevantHits
    },
    offlinePass: true
  });
}

const liveRequested = process.env.RESEARCH_LIVE_IPC === '1';
const summary = {
  runId,
  startedAt: new Date().toISOString(),
  liveRequested,
  qualityCompare: '未完成',
  qualityCompareReason: liveRequested
    ? 'no_injected_ipc_results: run cases inside OneTone app; export result.metrics.runTrace + report to this folder'
    : 'offline_only: set RESEARCH_LIVE_IPC=1 after in-app runs and place traces here',
  acceptanceNote:
    'Do not require a definitive personal reason. Pass = identity + fetchAttempt/clues + honest unknown.',
  offline,
  cases
};

fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log('research-live-acceptance: wrote', outDir);
console.log('offline funnel checks: ok');
console.log(
  'live IPC: 未完成 — run food-xiafan + office-ye in-app; save runTrace under',
  outDir
);
