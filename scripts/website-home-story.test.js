#!/usr/bin/env node
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var read = function (rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
};

var indexHtml = read("website/index.html");
var protoHtml = read("website/prototypes/home-story-scroll.html");
var homeDemo = read("website/js/home-demo.js");
var homeGsap = read("website/js/home-gsap.js");
var homeStoryCss = read("website/css/home-story.css");
var i18n = read("website/js/i18n.js");

[indexHtml, protoHtml].forEach(function (html, i) {
  var label = i === 0 ? "index.html" : "home-story-scroll.html";
  assert.match(html, /gsap\.min\.js/, label + " loads GSAP");
  assert.match(html, /ScrollTrigger/, label + " loads ScrollTrigger");
});

assert.match(indexHtml, /id="story-world"/, "index has story-world");
assert.match(indexHtml, /id="ch-trigger"/, "index has ch-trigger");
assert.match(indexHtml, /id="ch-voice"/, "index has ch-voice");
assert.match(indexHtml, /id="ch-softpad"/, "index has ch-softpad");
assert.match(indexHtml, /hero-exit-overlay/, "index has hero exit overlay");
assert.match(indexHtml, /home-gsap\.js/, "index loads home-gsap.js");
assert.match(indexHtml, /home-story\.css/, "index loads home-story.css");
assert.match(indexHtml, /id="ime-cancel-chip"/, "index has voice Esc cancel chip");
assert.match(indexHtml, /story-bridge-in/, "index has ch-trigger bridge-in");
assert.match(indexHtml, /story-bridge-out/, "index has in-chapter bridge-out");
assert.doesNotMatch(indexHtml, /scroll-smooth/, "index has no scroll-smooth");
assert.doesNotMatch(indexHtml, /id="sec-chain"/, "sec-chain removed");
assert.doesNotMatch(indexHtml, /id="sec-caps"/, "sec-caps removed");

var voiceSection = indexHtml.match(/id="ch-voice"[\s\S]*?<\/section>/);
assert.ok(voiceSection && !/story-bridge-in/.test(voiceSection[0]), "ch-voice has no duplicate bridge-in");
var padSection = indexHtml.match(/id="ch-softpad"[\s\S]*?<\/section>/);
assert.ok(padSection && !/story-bridge-in/.test(padSection[0]), "ch-softpad has no duplicate bridge-in");

assert.match(protoHtml, /camera-rig-lens/, "prototype has camera-rig-lens");
assert.match(protoHtml, /story-bridge-in/, "prototype has ch-trigger bridge-in");

assert.match(homeDemo, /OneToneHomeDemo/, "exports OneToneHomeDemo");
assert.match(homeDemo, /pauseHero/, "exports pauseHero");
assert.match(homeDemo, /isHeroIntroDone/, "exports isHeroIntroDone");
assert.match(homeDemo, /ime-cancel-chip/, "voice demo flashes Esc cancel");
assert.match(homeDemo, /onetone:home-demo-ready/, "dispatches demo ready event");

assert.match(homeGsap, /buildChapterDirector/, "per-chapter director");
assert.match(homeGsap, /syncChapterState/, "chapter progress syncs demo");
assert.match(homeGsap, /buildChapterTimeline/, "enter hold exit timeline");
assert.match(homeGsap, /DEMO_PLAY_START = 0\.12/, "demo play starts at 12%");
assert.match(homeGsap, /DEMO_PLAY_END = 0\.88/, "demo play ends at 88%");
assert.match(homeGsap, /HERO_HARD_PAUSE = 0\.35/, "hero hard pause at 35%");
assert.match(homeGsap, /resumeHero/, "hero resumes on scroll back");
assert.match(homeGsap, /min-width: 768px\) and \(hover: hover\)/, "pin mode at 768px desktop");
assert.match(homeGsap, /currentUsePin/, "tracks pin vs nopin for demo sync");
assert.match(homeGsap, /syncAllChapterStates/, "syncs chapter state after refresh");
assert.match(homeGsap, /is-chapter-pinned/, "pinned chapter z-index stacking");
assert.match(homeGsap, /isActive/, "demo driven by scroll trigger active state");
assert.match(homeGsap, /updateChapterStack/, "stack visibility for overlapping pin chapters");
assert.match(homeGsap, /is-stack-visible/, "only show current and handoff chapters");
assert.match(homeGsap, /visibleEnter/, "chapters with opacity 1 enter skip fade");
assert.match(homeGsap, /ENTER_END = 0\.2/, "enter segment 20%");
assert.match(homeGsap, /HOLD_END = 0\.8/, "hold ends at 80%");
assert.match(homeGsap, /EXIT_START = 0\.8/, "exit starts at 80%");
assert.match(homeGsap, /EXIT_MOVE_END = 0\.92/, "exit move ends at 92%");
assert.match(homeGsap, /top top\+=64|top top\+\=.*HEADER/, "pin header offset");
assert.match(homeGsap, /scrub: usePin \? true/, "pin scrub 1:1 for reverse scroll");
assert.match(homeGsap, /SCRUB_NOPIN = 0\.55/, "nopin scrub smoothing");
assert.match(homeGsap, /pinEnd: "\+=100%"/, "trigger pin distance");
assert.match(homeGsap, /pinEnd: "\+=115%"/, "voice pin distance");
assert.match(homeGsap, /anticipatePin: 0/, "no anticipate pin jump");
assert.match(homeGsap, /lastStoryMode/, "tracks story mode for resize reinit");
assert.match(homeGsap, /getStoryMode/, "resolves pin nopin mobile reduced");
assert.match(homeGsap, /resetChapterVisual/, "resets chapter on leave back");
assert.match(homeGsap, /clearChapterTransforms/, "clears stale transforms on reinit");
assert.match(homeGsap, /exitMove/, "split exit move phase");
assert.match(homeGsap, /bridgeInFadeIn/, "hero bridge fade in ch-trigger");
assert.doesNotMatch(homeGsap, /primeChapterElements/, "no global prime hiding content");
assert.doesNotMatch(homeGsap, /lastUsePin/, "lastUsePin replaced by lastStoryMode");
assert.match(homeGsap, /bindBrandsHandoff/, "brands handoff ST");
assert.match(homeGsap, /ScrollTrigger\.scrollTo/, "rail scrollTo with offset");
assert.match(homeGsap, /runBrandsHandoff/, "has brands handoff");
assert.match(homeGsap, /story-gsap-live/, "marks gsap init");
assert.match(homeGsap, /hover: none/, "mobile guard touch-only");
assert.doesNotMatch(homeGsap, /buildStoryMasterTimeline/, "no whole-world master pin");
assert.doesNotMatch(homeGsap, /function bindDemoLifecycle\b/, "no duplicate demo ST");
assert.doesNotMatch(homeGsap, /\.to\s*\(\s*["']#demoWrap/, "GSAP does not tween #demoWrap");
assert.doesNotMatch(homeGsap, /#bridge-hero/, "hero bridge not driven from hero timeline selector");
assert.doesNotMatch(homeGsap, /scale: 1\.02.*lens/, "onBeat does not scale lens");

assert.match(homeStoryCss, /story-pin-mode .story-chapter/, "css chapter pin mode");
assert.match(homeStoryCss, /height: 100vh/, "pin chapter single viewport");
assert.match(homeStoryCss, /margin-top: -100vh/, "pin chapters stack without gap");
assert.match(homeStoryCss, /is-stack-visible/, "stack visibility hides overlapped chapters");
assert.match(homeStoryCss, /pin-spacer/, "pin spacer matches story background");
assert.match(homeStoryCss, /story-bridge-in/, "css bridge-in");
assert.match(homeStoryCss, /overflow: visible/, "pin chapter overflow visible");
assert.match(homeStoryCss, /html:has\(#story-world\)/, "home disables smooth scroll via tokens override");
assert.match(homeStoryCss, /home-ime-cancel-chip/, "css Esc cancel chip");
var pinChapterBlock = homeStoryCss.match(/html\.story-pin-mode \.story-chapter \{[^}]+\}/);
assert.ok(pinChapterBlock && !/position:\s*absolute/.test(pinChapterBlock[0]), "pin chapter block not absolute stacked");

var i18nKeys = [
  "homeStoryCounter1",
  "homeBridgeHero",
  "homeBridgeTriggerVoice",
  "homeBridgeVoicePad",
  "homeChTriggerQ",
  "homeChVoiceQ",
  "homeChVoiceCancel",
  "homeChSoftpadQ",
];
i18nKeys.forEach(function (key) {
  assert.match(i18n, new RegExp(key + ":"), "i18n has " + key);
});

console.log("website-home-story.test.js: all assertions passed");
