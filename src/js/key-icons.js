(function(global){
  'use strict';

  var STROKE = 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  var SVGS = {
    volume: '<svg class="habit-key-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" '+STROKE+' aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a4.5 4.5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>',
    mouse: '<svg class="habit-key-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" '+STROKE+' aria-hidden="true"><rect x="7" y="2" width="10" height="18" rx="5"/><line x1="12" y1="6" x2="12" y2="10"/></svg>',
    keyboard: '<svg class="habit-key-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" '+STROKE+' aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h.01M12 13h.01M16 13h.01M7 17h10"/></svg>',
    gamepad: '<svg class="habit-key-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" '+STROKE+' aria-hidden="true"><path d="M6 11h4v4H6z"/><path d="M14 13h4"/><path d="M16 11v4"/><rect x="2" y="6" width="20" height="12" rx="4"/></svg>',
    media: '<svg class="habit-key-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" '+STROKE+' aria-hidden="true"><circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>'
  };

  function tokenCategory(token){
    var raw = String(token || '').trim();
    if(!raw) return 'keyboard';
    if(raw === 'AutoTrigger' || /^Volume_/i.test(raw)) return 'volume';
    if(/^Media_/i.test(raw) || /^Browser_/i.test(raw) || /^Launch_/i.test(raw)) return 'media';
    if(/^(L|R|M)?Button$/i.test(raw) || /^XButton\d$/i.test(raw)) return 'mouse';
    if(/^Gamepad_/i.test(raw)) return 'gamepad';
    return 'keyboard';
  }

  function iconCategoryForKey(key){
    var k = String(key || '').trim();
    if(!k) return 'keyboard';
    if(k.indexOf('+') >= 0){
      var parts = k.split('+');
      var last = parts[parts.length - 1];
      return tokenCategory(last);
    }
    if(k.indexOf(' / ') >= 0){
      return tokenCategory(k.split(' / ')[0]);
    }
    return tokenCategory(k);
  }

  function iconHtmlForKey(key){
    return SVGS[iconCategoryForKey(key)] || SVGS.keyboard;
  }

  function ensureIconHost(displayEl){
    if(!displayEl) return null;
    if(displayEl.id === 'targetDisplay') return null;
    var host = displayEl.querySelector('.habit-key-icon-host');
    if(host) return host;
    host = document.createElement('span');
    host.className = 'habit-key-icon-host';
    host.setAttribute('aria-hidden', 'true');
    var anchor = displayEl.querySelector('.target-ime-badge, .app-target-card-badge, .keys-trigger-context-badge');
    var value = displayEl.querySelector('.display-value');
    if(anchor && anchor.nextSibling) displayEl.insertBefore(host, anchor.nextSibling);
    else if(value) displayEl.insertBefore(host, value);
    else displayEl.appendChild(host);
    return host;
  }

  function syncDisplayIcon(displayEl, key){
    var host = ensureIconHost(displayEl);
    if(!host) return;
    host.innerHTML = iconHtmlForKey(key);
    displayEl.querySelectorAll('svg.habit-key-icon').forEach(function(svg){
      if(!host.contains(svg)) svg.remove();
    });
  }

  global.OneToneKeyIcons = {
    iconCategoryForKey: iconCategoryForKey,
    iconHtmlForKey: iconHtmlForKey,
    syncDisplayIcon: syncDisplayIcon
  };
})(typeof window !== 'undefined' ? window : globalThis);
