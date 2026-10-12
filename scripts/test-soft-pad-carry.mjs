/**
 * Soft Pad Form B carry projection — static + vm harness.
 * Run: node scripts/test-soft-pad-carry.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-carry.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/css/soft-pad-carry.css'), 'utf8');
const overlay = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
const pasteRs = fs.readFileSync(
  path.join(root, 'src-tauri/src/ipc/commands/shell/soft_pad_paste_cmd.rs'),
  'utf8'
);

assert.match(overlay, /soft-pad-carry\.js/);
assert.match(overlay, /soft-pad-carry\.css/);
assert.match(overlay, /data-soft-pad-carry/);
assert.match(css, /\.sp-carry/);
assert.match(src, /cmd_soft_pad_paste_only/);
assert.match(src, /cmd_tray_snapshot_get/);
assert.match(src, /tray_changed/);
assert.match(src, /cmd_tray_carry_dismiss/);
assert.match(src, /cmd_tray_collect_from_soft_pad/);
assert.match(src, /is-drop-target/);
assert.match(src, /松手收入材料托盘/);
assert.match(src, /allowDrop/);
assert.match(src, /softPadMatsBar/);
assert.match(src, /sp-mats-rail/);
assert.match(src, /setMatsDrawerOpen/);
assert.match(src, /setMatsPinned/);
assert.match(src, /data-sp-mats-toggle/);
assert.match(src, /data-sp-mats-pin/);
assert.match(src, /data-sp-mats-add/);
assert.match(src, /data-sp-mats-paste/);
assert.match(src, /data-sp-mats-hot/);
assert.match(src, /onetone\.softPad\.matsPinned/);
assert.match(src, /matsOpenOnCollect/);
assert.match(src, /carryMarkdownPreviewRow/);
assert.match(src, /内容已就绪/);
assert.match(src, /pulsePasteCue/);
assert.match(src, /shouldShowCarryUi/);
assert.match(src, /requestOverlayFit/);
assert.match(src, /sp-carry__act--paste/);
assert.match(src, /matsAssistOpen/);
assert.match(src, /armMatsAssist/);
assert.match(src, /sp-carry--dock/);
assert.match(src, /data-sp-hint/);
assert.match(src, /data-sp-act="mats"/);
assert.match(src, /dockDismissed/);
assert.match(src, /ico\('paste'\)/);
assert.match(src, /ico\('mats'\)/);
assert.match(src, /ico\('copy'\)/);
assert.match(src, /kind === 'mats'/);
assert.match(src, /kind === 'copy'/);
assert.match(src, /\.micro-hw/);
assert.match(
  src,
  /\.micro-hw[\s\S]*?\.overlay-pad-stack|\.micro-hw'\)\s*\|\|/
);
assert.match(css, /sp-carry-paste-pulse/);
assert.match(css, /\.sp-carry--dock/);
assert.match(css, /\.sp-carry__hint/);
assert.match(css, /\.sp-carry__act--wide/);
assert.match(css, /\.sp-carry__act\s+\.sp-mats-rail__ico/);
assert.match(css, /z-index:\s*45/);
assert.match(css, /white-space:\s*nowrap/);
assert.match(css, /flex-direction:\s*row/);
assert.match(css, /writing-mode:\s*horizontal-tb/);
assert.match(css, /min-width:\s*max-content/);
assert.match(css, /\.sp-carry__act--primary:hover/);
assert.match(css, /is-sp-caption-empty/);
assert.match(src, /targetIconSrc/);
assert.match(src, /resolveTargetKind/);
assert.match(src, /activeAgentChip/);
assert.match(src, /data-sp-agent-img/);
assert.match(src, /data-sp-paste-lbl/);
assert.match(src, /syncCaptionAboveDock/);
assert.match(src, /is-sp-carry-dock/);
assert.match(src, /icoText === 'OT'/);
assert.doesNotMatch(src, /sp-carry__ico">OT</);
assert.doesNotMatch(src, /pasteBtn\.textContent\s*=/);
assert.match(overlay, /soft-pad-carry\.css\?v=/);
assert.match(overlay, /soft-pad-carry\.js\?v=/);
assert.match(
  fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8'),
  /softPadCarryRoot/
);
assert.match(
  fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8'),
  /__otReportOverlayFitContent/
);
assert.match(src, /pullSnapshotWithRetry/);
assert.match(src, /cmd_tray_inbox_write/);
assert.match(src, /__TAURI_INTERNALS__/);
assert.match(src, /pickViaHtmlInput/);
assert.match(src, /collectBlobFile/);
assert.match(src, /cmd_codex_micro_overlay_suspend_topmost/);
assert.match(src, /contentRevision/);
assert.match(src, /cmd_codex_micro_overlay_set_mats_rail/);
assert.match(src, /requestMatsRailWidth/);
assert.match(css, /--sp-mats-rail-w/);
assert.match(css, /padding-right:\s*var\(--sp-mats-rail-w/);
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8'),
  /resize_overlay_left_anchored/
);
assert.match(src, /copyMaterialsMd/);
assert.match(src, /materialsMarkdown/);
assert.match(src, /bindMatsHotkeys/);
assert.match(src, /invokeCollect\('copy_md'/);
assert.match(src, /confirmClearMats/);
assert.match(src, /sp-mats-confirm/);
assert.match(src, /rowDetailBits/);
assert.match(src, /showMatsTip/);
assert.match(src, /sourceLabel/);
assert.match(src, /今天 /);
assert.doesNotMatch(src, /global\.confirm/);
assert.doesNotMatch(src, /window\.confirm/);
assert.match(css, /sp-mats-tip/);
assert.match(css, /sp-mats-confirm__modal/);
assert.match(css, /backdrop-filter:\s*blur\(14px\)/);
assert.match(src, /ingestClipboard/);
assert.match(src, /pickLocalFile/);
assert.match(src, /handlePasteEvent/);
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/permissions/codex-micro-overlay-ipc.toml'), 'utf8'),
  /allow-cmd-pick-path/
);
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/src/home_tray_snapshot.rs'), 'utf8'),
  /"copy_md"/
);
assert.match(
  fs.readFileSync(path.join(root, 'src/js/features/now/home-prompt-prep.js'), 'utf8'),
  /kind === 'copy_md'/
);
assert.match(src, /pointerleave/);
assert.match(css, /\.sp-mats-rail__hot/);
assert.match(css, /\.sp-mats-rail__iconbtn/);
assert.match(css, /\.sp-mats-rail__ico/);
assert.match(css, /\.sp-mats-rail__kindico/);
assert.match(css, /text-overflow:\s*ellipsis/);
assert.match(src, /kindGlyph/);
assert.match(src, /rowDetailBits/);
assert.match(src, /showMatsTip/);
assert.match(src, /syncMatsRailGeometry/);
assert.match(src, /ico\('rm'\)/);
assert.match(css, /sp-mats-tip__k/);
assert.match(css, /\.sp-mats-rail\.is-open\s+\.sp-mats-rail__hot[\s\S]*?pointer-events:\s*none/);
assert.doesNotMatch(src, /sp-mats-rail__title/);
assert.match(
  fs.readFileSync(path.join(root, 'src/js/features/now/home-prompt-prep.js'), 'utf8'),
  /ref\.source\s*=\s*m\.source/
);
assert.doesNotMatch(src, /sp-mats-rail__pin" data-sp-mats-pin[^>]*>置顶</);
assert.doesNotMatch(src, /data-sp-mats-clear[^>]*>清空</);
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/src/home_tray_snapshot.rs'), 'utf8'),
  /persist_snapshot|snapshot\.json|sanitize_on_load|write_inbox_base64/
);
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/permissions/codex-micro-overlay-ipc.toml'), 'utf8'),
  /allow-cmd-tray-inbox-write/
);
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/permissions/codex-micro-overlay-ipc.toml'), 'utf8'),
  /allow-cmd-pick-path/
);
assert.match(overlay, /data-sp-mats-add/);
assert.match(overlay, /data-sp-mats-paste/);
assert.match(src, /optimisticAddMaterial/);
assert.match(src, /extractDropText/);
assert.match(src, /chipPreview/);
assert.match(src, /data-sp-mats-clear/);
assert.match(src, /data-sp-mats-rm/);
assert.match(src, /data-sp-mats-list/);
assert.match(src, /已收起操作条/);
assert.match(css, /\.sp-drop-hint/);
assert.match(css, /\.wrap\.is-drop-target/);
assert.match(css, /\.sp-mats-rail/);
assert.match(css, /\.sp-mats-rail\.is-open/);
assert.match(css, /\.sp-mats-rail__tab/);
assert.match(css, /\.sp-mats-rail__panel/);
assert.match(css, /translateX/);
assert.match(css, /\.wrap\.is-mats-rail/);
assert.match(css, /flex-direction:\s*column/);
assert.match(css, /position:\s*absolute/);
assert.doesNotMatch(css, /\.sp-mats-bar__chips/);
assert.match(overlay, /data-sp-mats-bar/);
assert.match(overlay, /sp-mats-rail/);
assert.match(overlay, /data-sp-mats-toggle/);
assert.match(
  fs.readFileSync(path.join(root, 'src/js/features/now/home-prompt-prep.js'), 'utf8'),
  /materialsForTray/
);
assert.match(
  fs.readFileSync(path.join(root, 'src/js/features/now/home-prompt-prep.js'), 'utf8'),
  /materials:\s*materialsForTray/
);
assert.match(
  fs.readFileSync(path.join(root, 'src/js/features/now/home-prompt-prep.js'), 'utf8'),
  /cmd_tray_collect_drain/
);
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/src/home_tray_snapshot.rs'), 'utf8'),
  /drain_pending_collect/
);
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/src/overlay_window.rs'), 'utf8'),
  /disable_drag_drop_handler/
);
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/src/overlay_window.rs'), 'utf8'),
  /html5_drag_drop:\s*true/
);
assert.match(pasteRs, /no_external_foreground/);
assert.match(pasteRs, /paste_busy/);
assert.match(pasteRs, /paste_input_sent/);
assert.doesNotMatch(pasteRs, /focus_chat_app_and_paste/);

const trayCmd = fs.readFileSync(
  path.join(root, 'src-tauri/src/ipc/commands/shell/home_tray_snapshot_cmd.rs'),
  'utf8'
);
assert.match(trayCmd, /cmd_tray_collect_from_soft_pad/);
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/src/home_tray_snapshot.rs'), 'utf8'),
  /TRAY_COLLECT_EVENT/
);

const children = [];
const bodyListeners = [];
const body = {
  id: 'wrap',
  attrs: {},
  classList: {
    _s: new Set(),
    add(c) {
      this._s.add(c);
    },
    remove(c) {
      this._s.delete(c);
    },
    toggle(c, on) {
      if (on) this._s.add(c);
      else this._s.delete(c);
    },
    contains(c) {
      return this._s.has(c);
    }
  },
  getAttribute(n) {
    return this.attrs[n] != null ? String(this.attrs[n]) : null;
  },
  setAttribute(n, v) {
    this.attrs[n] = String(v);
  },
  querySelector(sel) {
    if (sel === '[data-sp-drop-hint]') {
      return children.find((c) => c.attrs && c.attrs['data-sp-drop-hint']) || null;
    }
    return null;
  },
  appendChild(el) {
    children.push(el);
    el.parentNode = body;
    el.isConnected = true;
    return el;
  },
  addEventListener(type, fn) {
    bodyListeners.push({ type, fn });
  }
};
const created = [];
const matsListEl = {
  _innerHTML: '',
  get innerHTML() {
    return this._innerHTML;
  },
  set innerHTML(v) {
    this._innerHTML = String(v || '');
  },
  attrs: {},
  getAttribute(n) {
    return this.attrs[n] != null ? String(this.attrs[n]) : null;
  },
  setAttribute(n, v) {
    this.attrs[n] = String(v);
  },
  addEventListener() {},
  contains() {
    return false;
  }
};
function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    attrs: {},
    children: [],
    parentNode: null,
    isConnected: false,
    hidden: false,
    classList: {
      _s: new Set(),
      add(c) {
        this._s.add(c);
      },
      remove(c) {
        this._s.delete(c);
      },
      toggle(c, on) {
        if (on) this._s.add(c);
        else this._s.delete(c);
      },
      contains(c) {
        return this._s.has(c);
      }
    },
    style: {},
    _innerHTML: '',
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(v) {
      this._innerHTML = String(v || '');
    },
    getAttribute(n) {
      return this.attrs[n] != null ? String(this.attrs[n]) : null;
    },
    setAttribute(n, v) {
      this.attrs[n] = String(v);
    },
    querySelector(sel) {
      if (sel === '[data-sp-count]') return { textContent: '' };
      if (sel === '[data-sp-preview]') return { textContent: '' };
      if (sel === '[data-sp-pill]') return { textContent: '' };
      if (sel === '[data-sp-listen]') return { hidden: true };
      if (sel === '[data-sp-act="paste"]') return { disabled: false };
      if (sel === '[data-sp-mats-list]') return matsListEl;
      if (sel === '[data-sp-mats-count]') return { textContent: '' };
      if (sel === '[data-sp-mats-count-panel]') return { textContent: '' };
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-sp-mats-count], [data-sp-mats-count-panel]') {
        return [{ textContent: '' }, { textContent: '' }];
      }
      return [];
    },
    addEventListener() {},
    closest() {
      return null;
    }
  };
  created.push(el);
  return el;
}

const invokes = [];
const ctx = {
  window: null,
  globalThis: null,
  document: {
    readyState: 'complete',
    body,
    documentElement: {
      attrs: {},
      getAttribute(n) {
        return this.attrs[n] != null ? String(this.attrs[n]) : null;
      },
      setAttribute(n, v) {
        this.attrs[n] = String(v);
      },
      addEventListener() {}
    },
    createElement: makeEl,
    querySelector() {
      return null;
    },
    getElementById(id) {
      return id === 'wrap' ? body : null;
    },
    addEventListener() {}
  },
  sessionStorage: {
    _m: Object.create(null),
    getItem(k) {
      return this._m[k] != null ? this._m[k] : null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    }
  },
  localStorage: {
    _m: Object.create(null),
    getItem(k) {
      return this._m[k] != null ? this._m[k] : null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    }
  },
  OneToneIpc: {
    invoke(cmd, args) {
      invokes.push({ cmd, args });
      if (cmd === 'cmd_tray_snapshot_get') {
        return Promise.resolve({
          schemaVersion: 1,
          carry: { active: true, targetKind: 'traeCode', generation: 1 },
          preview: 'hello carry',
          assembledMd: '# hello',
          includedCount: 2,
          materialCount: 2,
          materials: [
            { id: 'm1', kind: 'text', name: '拖入的文本' },
            { id: 'm2', kind: 'file', name: 'a.md' }
          ]
        });
      }
      if (cmd === 'cmd_soft_pad_paste_only') {
        return Promise.resolve({ ok: true, pasteInputSent: true, error: null });
      }
      if (cmd === 'cmd_tray_carry_dismiss') {
        return Promise.resolve({ ok: true, generation: 2 });
      }
      return Promise.resolve({ ok: true });
    },
    listen() {
      return Promise.resolve(function () {});
    }
  },
  console: { info() {} },
  setTimeout,
  clearTimeout
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(src, ctx);

const API = ctx.OneToneSoftPadCarry;
assert.ok(API && typeof API.mount === 'function');
API.mount(body);
await API.pull();
assert.equal(API.isActive(), true);
assert.equal(API.getSnapshot().carry.targetKind, 'traeCode');
assert.ok(
  API.__testOnly.getMatsBar().classList.contains('is-open'),
  'carry activate must open mats list for paste preview'
);
// Draft-only carry: no material rows → synthetic markdown preview in list.
// Bump contentRevision so optimistic merge does not keep prior material rows.
API.applySnapshot({
  schemaVersion: 1,
  contentRevision: 9,
  carry: { active: true, targetKind: 'chatgpt', generation: 2 },
  preview: '改首页并修粘贴提示',
  assembledMd: '# 改首页并修粘贴提示\n\n细节…',
  includedCount: 0,
  materialCount: 0,
  materials: []
});
assert.ok(
  API.__testOnly.getMatsBar().classList.contains('is-open'),
  'draft-only carry must keep mats list open'
);
assert.match(
  String(API.__testOnly.getMatsBar().querySelector('[data-sp-mats-list]').innerHTML || ''),
  /改首页并修粘贴提示|待粘贴/
);
assert.equal(body.getAttribute('data-sp-drop-bound'), '1');
assert.ok(bodyListeners.some((l) => l.type === 'dragover'));
assert.ok(bodyListeners.some((l) => l.type === 'drop'));
assert.ok(API.__testOnly.canAcceptDrop({ types: ['text/plain'], files: [] }));
assert.ok(API.__testOnly.canAcceptDrop({ types: ['Files'], files: [{ name: 'a.md' }] }));
assert.equal(API.__testOnly.canAcceptDrop({ types: [], files: [] }), true);
assert.equal(
  API.__testOnly.extractDropText({
    getData(t) {
      return t === 'text/plain' ? '  hello drop  ' : '';
    }
  }),
  'hello drop'
);
assert.ok(API.__testOnly.getMatsBar(), 'mats rail mounted on wrap');
assert.match(API.__testOnly.getMatsBar().className, /sp-mats-rail/);

const enter = bodyListeners.find((l) => l.type === 'dragenter');
const over = bodyListeners.find((l) => l.type === 'dragover');
const leave = bodyListeners.find((l) => l.type === 'dragleave');
const drop = bodyListeners.find((l) => l.type === 'drop');
assert.ok(enter && over && leave && drop);
enter.fn({
  preventDefault() {},
  dataTransfer: { types: ['text/plain'], files: [] }
});
assert.ok(body.classList.contains('is-drop-target'));
over.fn({
  preventDefault() {},
  dataTransfer: { types: ['text/plain'], files: [], dropEffect: 'none' }
});
drop.fn({
  preventDefault() {},
  stopPropagation() {},
  dataTransfer: {
    types: ['text/plain'],
    files: [],
    getData(t) {
      return t === 'text/plain' ? 'hello soft pad drop' : '';
    }
  }
});
await new Promise((r) => setTimeout(r, 0));
assert.ok(
  invokes.some(
    (i) =>
      i.cmd === 'cmd_tray_collect_from_soft_pad' &&
      i.args &&
      i.args.kind === 'text' &&
      i.args.text === 'hello soft pad drop'
  )
);
assert.equal(body.classList.contains('is-drop-target'), false);

const pasteRes = await API.pasteOnly();
assert.equal(pasteRes.ok, true);
assert.ok(invokes.some((i) => i.cmd === 'cmd_soft_pad_paste_only'));
await API.dismissCarry();
assert.equal(API.isActive(), false);

console.log('ok soft-pad-carry');
