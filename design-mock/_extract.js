
// ── 图标 ──
var ICO = {
  voice:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>',
  keys:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12"/></svg>',
  softPad:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 9h2M11 9h2M15 9h2M7 13h6M7 17h4"/></svg>',
  camera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  end:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  pulse:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  ind:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
  pro:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  go:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
};

// ── 通道节点数据（贴合 4 张规范图） ──
var CH = [
  {
    id:'voice', name:'说话触发', color:'var(--voice)', colorSoft:'var(--voice-soft)',
    desc:'3 步：开启 → 结束 → 发送',
    states:['idle','live','done'],
    jump:{to:'语音设置', desc:'改唤醒词、麦克风、结束方式'},
    nodes:[
      {tag:'01 / 开启', icon:ICO.voice, ttl:'怎么开始打字?', sub:'说一句话唤醒这个场景的话', state:'done', data:[
        {k:'唤醒词',v:'「开始输入」'},
        {k:'唤醒键',v:'F8'},
        {k:'备用词',v:'「嗨打字」「hey」'},
        {k:'检测模型',v:'AutoTrigger'},
        {k:'防误触',v:'阈值 200ms'}
      ]},
      {tag:'02 / 结束', icon:ICO.pulse, ttl:'说错了想结束?', sub:'自动 · 中文语音', state:'active', data:[
        {k:'自动结束',v:'静音 3 秒'},
        {k:'结束词',v:'「结束」'},
        {k:'取消词',v:'「取消」'},
        {k:'本轮时长',v:'00:42'},
        {k:'转写字数',v:'287 字'}
      ]},
      {tag:'03 / 发送', icon:ICO.send, ttl:'说完怎么发出去?', sub:'自动 Enter 发送', state:'next', data:[
        {k:'发送方式',v:'Enter 键'},
        {k:'目标应用',v:'当前前台'},
        {k:'完成输入',v:'不发送'},
        {k:'剪贴板',v:'可选'},
        {k:'触发 Agent',v:'可选'}
      ]}
    ]
  },
  {
    id:'keys', name:'按键触发', color:'var(--keys)', colorSoft:'var(--keys-soft)',
    desc:'2 步：触发 → 识别',
    states:['idle','live','done'],
    jump:{to:'按键设置', desc:'改触发键、目标、响应方式'},
    nodes:[
      {tag:'01 / 触发', icon:ICO.keys, ttl:'触发', sub:'音量减', state:'active', data:[
        {k:'物理键',v:'Volume Down'},
        {k:'响应方式',v:'单击'},
        {k:'防误触',v:'阈值 200ms'},
        {k:'冲突检测',v:'无'}
      ]},
      {tag:'02 / 识别', icon:ICO.pulse, ttl:'识别', sub:'右 Alt', state:'next', data:[
        {k:'目标键',v:'Right Alt'},
        {k:'目标应用',v:'当前前台'},
        {k:'模式',v:'单次输出'},
        {k:'快捷键组合',v:'支持'}
      ]}
    ]
  },
  {
    id:'softPad', name:'屏幕按钮', color:'var(--pad)', colorSoft:'var(--pad-soft)',
    desc:'2 步：Soft Pad → 状态灯',
    states:['idle','live','done'],
    jump:{to:'虚拟键盘', desc:'改按钮配置、绑定 Agent、调整布局'},
    nodes:[
      {tag:'SOFT PAD', icon:ICO.softPad, ttl:'SOFT PAD', sub:'已启用 · 21 个', state:'active', data:[
        {k:'键 1',v:'确认 → agent.approve'},
        {k:'键 2',v:'拒绝 → agent.reject'},
        {k:'键 3',v:'暂停 → agent.pause'},
        {k:'位置',v:'屏幕右下'},
        {k:'透明度',v:'80%'},
        {k:'主题',v:'暗色'}
      ]},
      {tag:'状态灯', icon:ICO.ind, ttl:'状态灯', sub:'常亮 · AI 状态', state:'next', data:[
        {k:'指示灯',v:'绿色常亮'},
        {k:'AI 状态',v:'待机'},
        {k:'任务',v:'等待中'},
        {k:'通知方式',v:'托盘 + 提示音'}
      ]}
    ]
  },
  {
    id:'camera', name:'摄像头确认', color:'var(--cam)', colorSoft:'var(--cam-soft)',
    desc:'3 步：视觉识别 → 摄像头设置 → PRO 视觉能力',
    states:['idle','live','done'],
    jump:{to:'摄像头', desc:'改检测规则、调灵敏度、查看历史'},
    nodes:[
      {tag:'01 / 视觉识别', icon:ICO.eye, ttl:'视觉识别', sub:'看到动作 · 执行结果', state:'done', data:[
        {k:'检测模型',v:'MediaPipe Hands'},
        {k:'在场检测',v:'人脸 + 姿态'},
        {k:'检测延迟',v:'< 200ms'},
        {k:'规则 1',v:'举手 → 确认'},
        {k:'规则 2',v:'离席 → 暂停'}
      ]},
      {tag:'02 / 摄像头设置', icon:ICO.cam, ttl:'摄像头设置', sub:'预览 · 设备 · 校准', state:'active', data:[
        {k:'摄像头',v:'笔记本内置'},
        {k:'分辨率',v:'720p'},
        {k:'帧率',v:'30 fps'},
        {k:'隐私',v:'本地处理'},
        {k:'校准',v:'已完成'}
      ]},
      {tag:'03 / PRO 视觉能力', icon:ICO.pro, ttl:'PRO 确认与安全', sub:'确认 · 安全 · 隐私', state:'pro', data:[
        {k:'Pro 能力',v:'已解锁'},
        {k:'确认',v:'举手 + 视线'},
        {k:'安全',v:'本地推理'},
        {k:'隐私',v:'不上传'},
        {k:'规则 3',v:'摇头 → 拒绝'}
      ]}
    ]
  }
];

var CYCLE = 0;  // 全局轮播步
var OPEN = null; // {chId, nodeIdx} 当前展开的节点

// ── 节点 HTML ──
function nodeHtml(ch, n, i){
  var states = n.state==='active' ? ' is-active' : n.state==='done' ? ' is-done' : '';
  return '<button type="button" class="node'+states+'" data-ch="'+ch.id+'" data-node="'+i+'" style="--c:'+ch.color+';--c-soft:'+ch.colorSoft+'">'
    +'<span class="pill">'+n.tag+'</span>'
    +'<div class="circle">'+n.icon+'</div>'
    +'<div class="ttl">'+n.ttl+'</div>'
    +'<div class="sub">'+n.sub+'</div>'
    +'</button>';
}

function connectorHtml(active){
  return '<div class="connector '+(active==='to-next'?'to-next':active==='to-next-orange'?'to-next-orange':active==='to-rest'?'to-rest':'')+'"></div>';
}

function rowHtml(ch){
  var html = '<div class="flow-row" data-ch="'+ch.id+'" style="--c:'+ch.color+';--c-soft:'+ch.colorSoft+'">';
  // 左侧 meta
  html += '<div class="ch-meta">'
    +'<div class="ico-row">'
      +'<div class="ch-ico">'+ICO[ch.id]+'<span class="pip"></span></div>'
      +'<div class="name">'+ch.name+'</div>'
    +'</div>'
    +'<div class="desc">'+ch.desc+'</div>'
    +'<span class="badge live"><span class="d"></span>已配置</span>'
    +'</div>';
  // 节点流
  html += '<div class="ch-nodes">';
  ch.nodes.forEach(function(n,i){
    if(i>0){
      // 判断连接线类型
      var prev = ch.nodes[i-1];
      var cls = 'to-rest';
      if(prev.state==='active' && n.state==='next') cls = 'to-next-orange';
      else if(prev.state==='active') cls = 'to-next';
      else if(prev.state==='done' && n.state==='active') cls = 'to-next';
      else if(prev.state==='done' && n.state==='next') cls = 'to-next-orange';
      html += connectorHtml(cls);
    }
    html += nodeHtml(ch, n, i);
  });
  html += '</div></div>';
  return html;
}

function paint(){
  document.getElementById('flowList').innerHTML = CH.map(rowHtml).join('');
  paintDetail();
  bind();
}

function detailHtml(ch, idx){
  var n = ch.nodes[idx];
  var rows = n.data.map(function(d){
    return '<div class="detail-row"><span class="k">'+d.k+'</span><span class="v">'
      +d.v
      +'<span class="edit" title="编辑">'+ICO.edit+'</span>'
      +'</span></div>';
  }).join('');
  return '<div class="detail-grid">'
    +'<div class="detail-card">'
      +'<h4><span class="ic">'+n.icon+'</span>节点信息</h4>'
      +'<div class="detail-row"><span class="k">编号</span><span class="v">'+n.tag+'</span></div>'
      +'<div class="detail-row"><span class="k">名称</span><span class="v">'+n.ttl+'</span></div>'
      +'<div class="detail-row"><span class="k">说明</span><span class="v" style="font-weight:500;color:var(--text-muted)">'+n.sub+'</span></div>'
      +'<div class="detail-row"><span class="k">状态</span><span class="v"><span class="pill '+(n.state==='active'?'live':n.state==='done'?'ok':'idle')+'" style="height:18px;padding:0 7px;font-size:9.5px">'+(n.state==='active'?'运行中':n.state==='done'?'已完成':n.state==='pro'?'Pro 已解锁':'待命')+'</span></span></div>'
    +'</div>'
    +'<div class="detail-card">'
      +'<h4><span class="ic">'+ICO.edit+'</span>详细数据</h4>'
      +rows
    +'</div>'
    +'</div>'
    +'<div class="jump-row">'
      +'<div class="txt">想改这条节点？去 <b>'+ch.jump.to+'</b> 页面 — '+ch.jump.desc+'。</div>'
      +'<a class="jump-btn" href="#" data-jump="'+ch.id+'">'+ICO.go+'前往 '+ch.jump.to+'</a>'
    +'</div>';
}

function paintDetail(){
  var box = document.getElementById('detail');
  var body = document.getElementById('detailBody');
  var hd = document.getElementById('detailHd');
  if(!OPEN){
    box.classList.remove('is-open');
    setTimeout(function(){if(!box.classList.contains('is-open'))body.innerHTML='';},400);
    return;
  }
  var ch = CH.find(function(c){return c.id===OPEN.chId;});
  var n = ch.nodes[OPEN.nodeIdx];
  hd.style.setProperty('--c', ch.color);
  hd.style.setProperty('--c-soft', ch.colorSoft);
  document.getElementById('detailCh').textContent = ch.name;
  document.getElementById('detailN').textContent = (OPEN.nodeIdx+1);
  document.getElementById('detailNodeTag').textContent = n.ttl;
  body.innerHTML = detailHtml(ch, OPEN.nodeIdx);
  requestAnimationFrame(function(){requestAnimationFrame(function(){box.classList.add('is-open');});});
}

function bind(){
  document.querySelectorAll('.node').forEach(function(el){
    el.addEventListener('click',function(e){
      e.stopPropagation();
      var chId = el.getAttribute('data-ch');
      var idx = parseInt(el.getAttribute('data-node'),10);
      OPEN = (OPEN && OPEN.chId===chId && OPEN.nodeIdx===idx) ? null : {chId:chId,nodeIdx:idx};
      paint();
    });
  });
  document.querySelectorAll('.detail-row .edit').forEach(function(b){
    b.addEventListener('click',function(e){
      e.stopPropagation();
      var k = b.parentElement.parentElement.querySelector('.k').textContent;
      alert('编辑：'+k+'（演示）');
    });
  });
  document.querySelectorAll('.jump-btn').forEach(function(b){
    b.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      var id = b.getAttribute('data-jump');
      alert('跳转到：'+CH.find(function(c){return c.id===id;}).jump.to);
    });
  });
}

document.getElementById('btnCollapse').onclick = function(){ OPEN=null; paint(); };

function next(){
  // 推进 OPEN 的节点
  if(!OPEN){ OPEN={chId:'voice', nodeIdx:0}; paint(); return; }
  var ch = CH.find(function(c){return c.id===OPEN.chId;});
  OPEN.nodeIdx = (OPEN.nodeIdx+1) % ch.nodes.length;
  paint();
}
function prev(){
  if(!OPEN){ OPEN={chId:'voice', nodeIdx:0}; paint(); return; }
  var ch = CH.find(function(c){return c.id===OPEN.chId;});
  OPEN.nodeIdx = (OPEN.nodeIdx-1+ch.nodes.length) % ch.nodes.length;
  paint();
}

var autoT = null;
function startAuto(){
  stopAuto();
  var step=0;
  autoT=setInterval(function(){
    var ch = CH[Math.floor(step/2)%4];
    OPEN = {chId:ch.id, nodeIdx:step%ch.nodes.length};
    paint();
    step++;
  },2000);
}
function stopAuto(){
  if(autoT){clearInterval(autoT);autoT=null;}
  var b=document.getElementById('btnAuto');
  if(b) b.textContent='自动播放';
}
document.getElementById('btnNext').onclick=next;
document.getElementById('btnPrev').onclick=prev;
document.getElementById('btnAuto').onclick=function(){
  if(autoT){ stopAuto(); return; }
  startAuto(); this.textContent='停止';
};

// 习惯切换
document.querySelectorAll('.habit-pill').forEach(function(p){
  p.onclick=function(){
    document.querySelectorAll('.habit-pill').forEach(function(x){x.classList.remove('on');});
    p.classList.add('on');
  };
});

// 初始展开说话通道第一个节点
OPEN = {chId:'voice', nodeIdx:0};
paint();
