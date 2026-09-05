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

  var KARABINER_ALIAS = {
    LButton:'pointing_button1', RButton:'pointing_button2', MButton:'pointing_button3',
    XButton1:'pointing_button4', XButton2:'pointing_button5',
    Volume_Up:'volume_increment', Volume_Down:'volume_decrement', Volume_Mute:'mute',
    Browser_Back:'consumer_key_code.back', Browser_Forward:'consumer_key_code.forward',
    Browser_Refresh:'consumer_key_code.refresh',
    Media_Next:'consumer_key_code.scan_next_track', Media_Prev:'consumer_key_code.scan_previous_track',
    Media_Play_Pause:'consumer_key_code.play_or_pause', Media_Stop:'consumer_key_code.stop'
  };

  var DIRECT_EN = {
    AutoTrigger:'Volume',
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
    if(Object.prototype.hasOwnProperty.call(direct, raw)){
      return direct[raw];
    }
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

  function karabinerAlias(key){
    var raw=String(key||'').trim();
    if(!raw) return '';
    if(Object.prototype.hasOwnProperty.call(KARABINER_ALIAS, raw)) return KARABINER_ALIAS[raw];
    if(raw.indexOf('HID_')===0) return 'vendor_hid';
    return '';
  }

  function autoTriggerDisplay(lang, sourceKey){
    var src = String(sourceKey || '').trim();
    if(src && src !== 'AutoTrigger') return friendlyKeyName(src, lang);
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
    // Multi-step action sequence (added 2026-09).  When `target_actions` is
    // non-empty, render each step inline so the user sees the full flow
    // without expanding the keys panel.  The single-keycap display area
    // truncates with ellipsis automatically if the joined string is too
    // long; users click the keycap to open the picker for the full editor.
    if(Array.isArray(mapping.targetActions)&&mapping.targetActions.length){
      var parts = [];
      for(var i=0;i<mapping.targetActions.length;i++){
        var a = mapping.targetActions[i];
        if(!a) continue;
        if(a.type==='key'){
          var v = String(a.value||'').trim();
          if(v) parts.push(friendlyKeyName(v, lang));
        } else if(a.type==='text'){
          var v = String(a.value||'');
          if(v) parts.push('"'+v+'"');
        } else if(a.type==='delay'){
          var n = parseInt(a.ms,10);
          if(n>0) parts.push(n+'ms');
        }
      }
      if(parts.length) return parts.join(' → ');
      // Non-empty actions list but no parseable steps → fall through to
      // legacy display so we never render an empty keycap.
    }
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

  // Render a compact action-sequence preview next to the `targetDisplay`
  // keycap so the user can see the full target flow without opening the
  // keys panel.  Idempotent: clears and re-paints on every call; auto-creates
  // a sibling container `<id>-actions` on first invocation.  Hidden when the
  // mapping has zero or one steps (single-key uses the keycap directly).
  function paintTargetActionsList(mapping, options){
    options = options || {};
    var id = options.targetDisplayId || 'targetDisplay';
    var disp = document.getElementById(id);
    if(!disp) return;
    var actions = (mapping && Array.isArray(mapping.targetActions) && mapping.targetActions.length) || 0;
    var siblingId = id + '-actions';
    var sibling = document.getElementById(siblingId);
    if(actions < 2){
      // Hide / remove the sibling if it was rendered for a previous mapping.
      if(sibling){ sibling.hidden = true; if(sibling.__list)sibling.__list.innerHTML=''; }
      disp.hidden = false;
      return;
    }
    if(!sibling){
      sibling = document.createElement('div');
      sibling.id = siblingId;
      sibling.className = 'keys-target-actions-list';
      var list = document.createElement('ol');
      list.className = 'keys-target-actions-list-items';
      sibling.appendChild(list);
      sibling.__list = list;
      // Insert as next sibling of `disp` so layout follows the keycap.
      if(disp.parentNode) disp.parentNode.insertBefore(sibling, disp.nextSibling);
    }
    sibling.hidden = false;
    disp.hidden = false;
    var list = sibling.__list;
    var html = '';
    for(var i=0;i<mapping.targetActions.length;i++){
      var a = mapping.targetActions[i];
      if(!a) continue;
      var lbl = '';
      if(a.type==='key'){
        lbl = friendlyKeyName(String(a.value||'').trim());
      } else if(a.type==='text'){
        lbl = '"' + String(a.value||'') + '"';
      } else if(a.type==='delay'){
        lbl = String(parseInt(a.ms,10)||0) + 'ms';
      } else {
        lbl = String(a.type||'');
      }
      html += '<li class="keys-target-actions-item" data-idx="'+i+'">'
        + '<span class="keys-target-actions-idx">'+(i+1)+'</span>'
        + '<span class="keys-target-actions-lbl">'+escHtml(lbl)+'</span>'
        + '</li>';
    }
    list.innerHTML = html;
  }

  function escHtml(s){
    if(typeof s!=='string') return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  global.OneToneKeyLabels = {
    friendlyKeyName: friendlyKeyName,
    triggerDisplayLabel: triggerDisplayLabel,
    targetDisplayLabel: targetDisplayLabel,
    labelsForMapping: labelsForMapping,
    autoTriggerDisplay: autoTriggerDisplay,
    karabinerAlias: karabinerAlias,
    paintTargetActionsList: paintTargetActionsList
  };
})(typeof window !== 'undefined' ? window : globalThis);
