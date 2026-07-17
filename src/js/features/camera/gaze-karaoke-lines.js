(function(global){
  'use strict';

  // Shared karaoke focus lines for calibration + live region testing.
  var LINES=[
    '看按钮就好，不用盯光点',
    '方位对了就算赢，像素别较真',
    '转头到左上角，打个招呼',
    '右上角在等你点个头',
    '下方请点头，镜框挡不住头姿',
    '你看哪儿，系统就跟到哪儿',
    '像指路一样：大概方向就行',
    '谢谢你转头看屏幕',
    '再抬头一点点，上边更清晰',
    '左中区域，慢慢扫过去',
    '别追蓝球，它只是反馈',
    '看文字、看按钮，才是正道',
    '九宫格里找感觉，不找毫米',
    '右下角：点头再右转',
    '你已经很稳了，继续',
    '正中休息一下也行',
    '左下角靠点头，别硬睁眼',
    '上中：轻轻抬头就够',
    '右侧有人喊你？转过去看看',
    '区域对了，语音就能说哪里',
    '眼镜反光时，多靠转头',
    '感谢配合，再试左上',
    '幽默一下：眼球别加班，头来顶班',
    '右中稳稳停住三秒',
    '下中点头，像在说「收到」',
    '别慌，慢一点更准',
    '看设置按钮试试',
    '看预览标题也行',
    '角落靠转头，中间靠眼神',
    '真棒，区域切换更自然了',
    '再来一次左上→右上',
    '从左到右画一道弧',
    '从上到下轻轻点头',
    '光点变大了，容差更友好',
    '不需要鼠标级精度',
    '方位正确就鼓掌',
    '镜框挡眼？点头救场',
    '抬头看顶边，像看窗外',
    '右转看右侧文字',
    '左转看左侧按钮',
    '谢谢耐心，校准不容易',
    '你做得很好，继续扫一眼',
    '右下角：低头+右转',
    '左下角：低头+左转',
    '正中深呼吸，再出发',
    '区域名会跟着变，看一眼',
    '别盯光晕发呆哦',
    '看真正的 UI，才算测试',
    '像玩找不同：找对区域',
    '风趣提醒：头是方向盘',
    '眼是微调，头是粗调',
    '粗调到位，微调随便',
    '再试顶部三格',
    '再试底部三格',
    '中间一行左右切换',
    '四角巡回，像探访老朋友',
    '探访左上这位老朋友',
    '探访右上那位老朋友',
    '探访左下，记得点头',
    '探访右下，记得点头',
    '你转头的样子很专业',
    '系统说：谢谢你的注视',
    '鼓励一下：已经比刚才顺了',
    '差一点就到角了，再转一点',
    '靠近边缘时再大胆一点',
    '别退回正中当避风港',
    '正中只是驿站，不是终点',
    '去左边看看风景',
    '去右边看看风景',
    '去上方看看天空',
    '去下方点个头致意',
    '看完再说「这里」就很酷',
    '看哪里 · 说哪里',
    '区域准确比坐标漂亮更重要',
    '容差变大了，放轻松',
    '蓝球只是陪跑，你是主角',
    '主角请看按钮上的字',
    '主角请看面板标题',
    '主角请看四角附近',
    '感激你愿意多试一轮',
    '这一轮只要方位感',
    '方位感来了，精度会跟着来',
    '先赢区域，再谈像素',
    '像素以后再说，今天看方向',
    '方向对了就给自己点赞',
    '点赞后去右上角庆祝',
    '庆祝完回正中歇口气',
    '歇完再去左下点头',
    '点头有力，镜框也服气',
    '服气之后抬头看顶',
    '顶边文字也算好靶子',
    '靶子不在蓝球上',
    '靶子在真实界面上',
    '真实界面：按钮、标题、开关',
    '开关旁边停一下也好',
    '停稳三秒，算一次成功',
    '成功了就换下一个区域',
    '换区域像换频道，轻松点',
    '轻松转头，别绷着脖子',
    '脖子舒服，识别也舒服',
    '舒服地完成九宫格巡礼',
    '巡礼结束，你很棒',
    '很棒之后，再随便看一眼角落',
    '角落到了？笑一下也行',
    '笑完继续，系统陪着你',
    '陪跑结束前：再看一次正中',
    '正中确认后，自由发挥',
    '自由发挥也请别追光点',
    '最后一句：看字，不看球'
  ];

  var ZONES=['tl','tc','tr','ml','center','mr','bl','bc','br'];

  function shuffleInPlace(arr){
    for(var j=arr.length-1;j>0;j--){
      var k=Math.floor(Math.random()*(j+1));
      var tmp=arr[j];arr[j]=arr[k];arr[k]=tmp;
    }
    return arr;
  }

  function zoneHint(line){
    var s=String(line||'');
    if(/左上/.test(s)) return 'tl';
    if(/右上/.test(s)) return 'tr';
    if(/左下/.test(s)) return 'bl';
    if(/右下/.test(s)) return 'br';
    if(/上中|顶部|顶边|上方|抬头看顶|看顶/.test(s)) return 'tc';
    if(/下中|底部|下方点头|下边/.test(s)) return 'bc';
    if(/左中|左侧|去左边|左转/.test(s)) return 'ml';
    if(/右中|右侧|去右边|右转看右/.test(s)) return 'mr';
    if(/正中|屏幕正中|中间休息|驿站|回正中/.test(s)) return 'center';
    return null;
  }

  function createPicker(){
    var order=null;
    var idx=0;
    var recent=[];
    function reshuffle(){
      order=shuffleInPlace(LINES.map(function(_,i){ return i; }));
      idx=0;
    }
    function take(preferZone){
      if(!order||idx>=order.length) reshuffle();
      var chosen=-1;
      if(preferZone){
        for(var look=0;look<order.length;look++){
          var i=(idx+look)%order.length;
          var line=LINES[order[i]];
          if(zoneHint(line)===preferZone&&recent.indexOf(order[i])<0){
            chosen=i;
            break;
          }
        }
      }
      if(chosen<0){
        for(var look2=0;look2<order.length;look2++){
          var j=(idx+look2)%order.length;
          if(recent.indexOf(order[j])<0){
            chosen=j;
            break;
          }
        }
      }
      if(chosen<0) chosen=idx%order.length;
      var pick=order[chosen];
      // Advance cursor past pick when it was at front of remaining.
      if(chosen===idx) idx++;
      else{
        order[chosen]=order[idx];
        idx++;
      }
      recent.push(pick);
      if(recent.length>12) recent.shift();
      return LINES[pick]||LINES[0];
    }
    return {
      next:function(){ return take(null); },
      forZone:function(zoneId){ return take(zoneId||null); },
      reset:function(){ order=null; idx=0; recent=[]; }
    };
  }

  global.OneToneGazeKaraoke={
    LINES:LINES,
    ZONES:ZONES,
    zoneHint:zoneHint,
    shuffleInPlace:shuffleInPlace,
    createPicker:createPicker
  };
})(typeof window!=='undefined'?window:this);
