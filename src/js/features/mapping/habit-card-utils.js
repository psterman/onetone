(function(global){
  'use strict';

  var popoverEl=null;
  var popoverBgEl=null;
  var demoEl=null;
  var demoTimer=0;
  var toastEl=null;
  var toastTimer=0;

  function shared(){ return global.OneToneHabitShared; }

  function ensureDemoShell(){
    if(demoEl) return demoEl;
    demoEl=document.createElement('div');
    demoEl.className='habit-card-demo';
    demoEl.id='habitCardDemo';
    demoEl.innerHTML='<button type="button" class="habit-card-demo-close" data-habit-demo-close aria-label="Close">\u2715</button><div class="habit-card-demo-stage"><div class="habit-card-demo-chrome"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="url" data-habit-demo-url>voice-pilot</span></div><div class="habit-card-demo-body"><div data-habit-demo-text></div></div></div><div class="habit-card-demo-progress" data-habit-demo-progress></div>';
    document.body.appendChild(demoEl);
    demoEl.addEventListener('click',function(e){
      if(e.target.closest('[data-habit-demo-close]')) closeDemoOverlay();
    });
    return demoEl;
  }

  function ensureToast(){
    if(toastEl) return toastEl;
    toastEl=document.createElement('div');
    toastEl.className='habit-card-toast';
    toastEl.id='habitCardToast';
    document.body.appendChild(toastEl);
    return toastEl;
  }

  function showToast(msg){
    var el=ensureToast();
    el.textContent=String(msg||'');
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){ el.classList.remove('is-show'); },2400);
  }

  function closePopover(){
    if(popoverEl){ popoverEl.remove(); popoverEl=null; }
    if(popoverBgEl){ popoverBgEl.remove(); popoverBgEl=null; }
  }

  function openPopover(html,anchorEl,width){
    closePopover();
    if(!anchorEl) return;
    var rect=anchorEl.getBoundingClientRect();
    popoverBgEl=document.createElement('div');
    popoverBgEl.className='habit-card-popover-bg';
    popoverBgEl.addEventListener('click',closePopover);
    document.body.appendChild(popoverBgEl);
    popoverEl=document.createElement('div');
    popoverEl.className='habit-card-popover';
    popoverEl.style.minWidth=(width||280)+'px';
    popoverEl.innerHTML=html;
    popoverEl.addEventListener('click',function(e){ e.stopPropagation(); });
    document.body.appendChild(popoverEl);
    var pr=popoverEl.getBoundingClientRect();
    var pw=pr.width||(width||280),ph=pr.height||200;
    var top=rect.bottom+8,left=rect.left;
    if(top+ph>window.innerHeight-10) top=rect.top-ph-8;
    if(left+pw>window.innerWidth-10) left=window.innerWidth-pw-10;
    if(left<10) left=10;
    popoverEl.style.top=top+'px';
    popoverEl.style.left=left+'px';
  }

  function simulateHabitTrigger(card){
    card=card||{};
    var detail=card.detail||{};
    var s=shared();
    var view=s&&s.resolveHabitView?s.resolveHabitView(card):{dim:'key'};
    if(view.dim==='voice') return '\uD83D\uDD07 '+(detail.when||'等待唤醒词…');
    if(view.dim==='cam') return '\uD83D\uDCF7 '+(detail.when||'等待手势…');
    if(view.dim==='softpad') return '\u2328 Soft Pad · '+(detail.when||'');
    var key=s&&s.friendlyKey&&card.mapping?s.friendlyKey(card.mapping.triggerKey||detail.when):detail.when;
    return '\u2328 '+(key||detail.when||'触发');
  }

  function simulateHabitAction(card){
    card=card||{};
    var detail=card.detail||{};
    var app=shared()&&shared().appName?shared().appName(card.mapping):'';
    return '\n\uD83D\uDCAC '+(detail.what||'执行动作')+(app?('\n\u2192 '+app):'');
  }

  function buildDemo(card){
    card=card||{};
    if(card.demo&&card.demo.length) return card.demo.slice();
    return [
      {type:'cursor',text:simulateHabitTrigger(card)},
      {type:'fly',text:simulateHabitAction(card)}
    ];
  }

  function closeDemoOverlay(){
    clearTimeout(demoTimer);
    if(demoEl){
      demoEl.classList.remove('is-open');
      var textEl=demoEl.querySelector('[data-habit-demo-text]');
      if(textEl) textEl.innerHTML='';
    }
  }

  function openDemoOverlay(card){
    var shell=ensureDemoShell();
    var steps=buildDemo(card);
    var urlEl=shell.querySelector('[data-habit-demo-url]');
    var textEl=shell.querySelector('[data-habit-demo-text]');
    var progEl=shell.querySelector('[data-habit-demo-progress]');
    if(!textEl||!progEl) return;
    var app=shared()&&shared().appName?shared().appName(card&&card.mapping):'voice-pilot';
    if(urlEl) urlEl.textContent=app+' — demo';
    textEl.innerHTML='';
    progEl.innerHTML=steps.map(function(){ return '<div class="step"></div>'; }).join('');
    shell.classList.add('is-open');
    var i=0;
    function play(){
      if(i>=steps.length){
        demoTimer=setTimeout(closeDemoOverlay,1500);
        return;
      }
      progEl.querySelectorAll('.step').forEach(function(node,j){
        node.classList.remove('is-done','is-active');
        if(j<i) node.classList.add('is-done');
        if(j===i) node.classList.add('is-active');
      });
      var step=steps[i];
      if(step.type==='cursor'){
        var cursor=document.createElement('span');
        cursor.className='cursor';
        textEl.appendChild(cursor);
        var k=0,text=String(step.text||'');
        function typeChar(){
          if(k>=text.length){ i++; demoTimer=setTimeout(play,500); return; }
          var ch=text[k];
          if(ch==='\n') cursor.before(document.createElement('br'));
          else cursor.before(document.createTextNode(ch));
          k++;
          demoTimer=setTimeout(typeChar,35);
        }
        typeChar();
      }else{
        var fly=document.createElement('span');
        fly.className='fly-in';
        fly.style.whiteSpace='pre-wrap';
        fly.textContent=String(step.text||'');
        textEl.appendChild(fly);
        i++;
        demoTimer=setTimeout(play,1200);
      }
    }
    play();
  }

  global.OneToneHabitCardUtils={
    openPopover:openPopover,
    closePopover:closePopover,
    openDemoOverlay:openDemoOverlay,
    closeDemoOverlay:closeDemoOverlay,
    buildDemo:buildDemo,
    simulateHabitTrigger:simulateHabitTrigger,
    simulateHabitAction:simulateHabitAction,
    showToast:showToast
  };
})((typeof window!=='undefined')?window:globalThis);
