(function(global){
  'use strict';

  var DIRECT_ZH = {
    AutoTrigger:'音量键',
    Ctrl:'Ctrl', Shift:'Shift', Alt:'Alt', Win:'Win',
    LCtrl:'左 Ctrl', RCtrl:'右 Ctrl', LShift:'左 Shift', RShift:'右 Shift',
    LAlt:'左 Alt', RAlt:'右 Alt', LWin:'左 Win', RWin:'右 Win',
    Esc:'Esc', Space:'空格', Enter:'回车', NumpadEnter:'小键盘回车', Tab:'Tab',
    Backspace:'退格', Delete:'删除', Insert:'插入',
    Home:'Home', End:'End', PageUp:'向上翻页', PageDown:'向下翻页',
    Up:'上方向键', Down:'下方向键', Left:'左方向键', Right:'右方向键',
    CapsLock:'大写锁定', PrintScreen:'截图键', ScrollLock:'滚动锁定', Pause:'暂停键',
    AppsKey:'菜单键',
    Volume_Down:'音量减', Volume_Up:'音量加', Volume_Mute:'静音键',
    Media_Next:'下一曲', Media_Prev:'上一曲', Media_Play_Pause:'播放 / 暂停', Media_Stop:'停止播放',
    Browser_Back:'浏览器后退', Browser_Forward:'浏览器前进', Browser_Refresh:'浏览器刷新',
    Launch_Mail:'打开邮件', Launch_App1:'快捷应用 1', Launch_App2:'快捷应用 2',
    LButton:'鼠标左键', RButton:'鼠标右键', MButton:'鼠标中键',
    XButton1:'鼠标侧键 1', XButton2:'鼠标侧键 2',
    Gamepad_A:'手柄 A', Gamepad_B:'手柄 B', Gamepad_X:'手柄 X', Gamepad_Y:'手柄 Y',
    Gamepad_LB:'手柄 LB', Gamepad_RB:'手柄 RB', Gamepad_Back:'手柄 Back', Gamepad_Start:'手柄 Start',
    Gamepad_LS:'手柄左摇杆按下', Gamepad_RS:'手柄右摇杆按下',
    Gamepad_DpadUp:'手柄 上', Gamepad_DpadDown:'手柄 下', Gamepad_DpadLeft:'手柄 左', Gamepad_DpadRight:'手柄 右'
  };

  var DIRECT_EN = {
    AutoTrigger:'Volume keys',
    Ctrl:'Ctrl', Shift:'Shift', Alt:'Alt', Win:'Win',
    LCtrl:'Left Ctrl', RCtrl:'Right Ctrl', LShift:'Left Shift', RShift:'Right Shift',
    LAlt:'Left Alt', RAlt:'Right Alt', LWin:'Left Win', RWin:'Right Win',
    Esc:'Esc', Space:'Space', Enter:'Enter', NumpadEnter:'Numpad Enter', Tab:'Tab',
    Backspace:'Backspace', Delete:'Delete', Insert:'Insert',
    Home:'Home', End:'End', PageUp:'Page Up', PageDown:'Page Down',
    Up:'Up Arrow', Down:'Down Arrow', Left:'Left Arrow', Right:'Right Arrow',
    CapsLock:'Caps Lock', PrintScreen:'Print Screen', ScrollLock:'Scroll Lock', Pause:'Pause',
    AppsKey:'Menu Key',
    Volume_Down:'Volume Down', Volume_Up:'Volume Up', Volume_Mute:'Mute',
    Media_Next:'Next Track', Media_Prev:'Previous Track', Media_Play_Pause:'Play / Pause', Media_Stop:'Stop',
    Browser_Back:'Browser Back', Browser_Forward:'Browser Forward', Browser_Refresh:'Browser Refresh',
    Launch_Mail:'Launch Mail', Launch_App1:'Launch App 1', Launch_App2:'Launch App 2',
    LButton:'Left Mouse', RButton:'Right Mouse', MButton:'Middle Mouse',
    XButton1:'Mouse Side Button 1', XButton2:'Mouse Side Button 2',
    Gamepad_A:'Gamepad A', Gamepad_B:'Gamepad B', Gamepad_X:'Gamepad X', Gamepad_Y:'Gamepad Y',
    Gamepad_LB:'Gamepad LB', Gamepad_RB:'Gamepad RB', Gamepad_Back:'Gamepad Back', Gamepad_Start:'Gamepad Start',
    Gamepad_LS:'Left Stick Press', Gamepad_RS:'Right Stick Press',
    Gamepad_DpadUp:'D-pad Up', Gamepad_DpadDown:'D-pad Down', Gamepad_DpadLeft:'D-pad Left', Gamepad_DpadRight:'D-pad Right'
  };

  function directTable(lang){
    return lang === 'zh' ? DIRECT_ZH : DIRECT_EN;
  }

  function friendlySingleToken(token, lang){
    var raw = String(token || '').trim();
    if(!raw) return '';
    var direct = directTable(lang);
    if(Object.prototype.hasOwnProperty.call(direct, raw)) return direct[raw];
    if(raw.indexOf('HID_') === 0) {
      if(/^HID_R\d{2}_/i.test(raw)) {
        var parts=raw.split('_');
        var rid=parts[1] ? parts[1].slice(1) : '';
        var code=parts[2] || raw.slice(4);
        return lang === 'zh'
          ? ('HID 键 R' + rid + '-' + code)
          : ('HID key R' + rid + '-' + code);
      }
      return lang === 'zh' ? ('HID 键 ' + raw.slice(4)) : ('HID key ' + raw.slice(4));
    }
    if(/^F\d{1,2}$/.test(raw)) return raw;
    if(/^Numpad\d$/.test(raw)) {
      return lang === 'zh' ? ('小键盘 ' + raw.slice(6)) : ('Numpad ' + raw.slice(6));
    }
    if(/^[A-Z]$/.test(raw)) return raw;
    if(/^\d$/.test(raw)) return raw;
    return raw.replace(/_/g, ' ');
  }

  function friendlyKeyName(key, lang){
    var k = String(key || '').trim();
    if(!k) return '';
    if(k.indexOf('+') >= 0) return k.split('+').map(function(t){ return friendlySingleToken(t, lang); }).join(' + ');
    if(k.indexOf(' / ') >= 0) return k.split(' / ').map(function(t){ return friendlySingleToken(t, lang); }).join(' / ');
    return friendlySingleToken(k, lang);
  }

  function autoTriggerDisplay(lang, sourceKey){
    if(sourceKey) return friendlyKeyName(sourceKey, lang);
    return lang === 'zh' ? '音量减 / 音量加' : 'Volume Down / Up';
  }

  function triggerDisplayLabel(mapping, lang){
    if(!mapping) return '';
    var trig = String(mapping.triggerKey || '').trim();
    if(!trig) return '';
    if(trig === 'AutoTrigger') return autoTriggerDisplay(lang, mapping.sourceKey);
    return friendlyKeyName(trig, lang);
  }

  function targetDisplayLabel(mapping, lang){
    if(!mapping) return '';
    var tgt = String(mapping.targetKey || '').trim();
    return tgt ? friendlyKeyName(tgt, lang) : '';
  }

  function labelsForMapping(mapping, lang){
    return {
      triggerKey: mapping && mapping.triggerKey || '',
      targetKey: mapping && mapping.targetKey || '',
      triggerLabel: triggerDisplayLabel(mapping, lang),
      targetLabel: targetDisplayLabel(mapping, lang)
    };
  }

  global.OneToneKeyLabels = {
    friendlyKeyName: friendlyKeyName,
    triggerDisplayLabel: triggerDisplayLabel,
    targetDisplayLabel: targetDisplayLabel,
    labelsForMapping: labelsForMapping,
    autoTriggerDisplay: autoTriggerDisplay
  };
})(typeof window !== 'undefined' ? window : globalThis);
