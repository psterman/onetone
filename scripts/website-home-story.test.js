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

assert.match(homeGsap, /story-decoupled-mode/, "scheme B decoupled mode");
assert.match(homeGsap, /initDemoIO/, "IO drives chapter demos");
assert.match(homeGsap, /initReveals/, "IO reveals copy and bridge");
assert.match(homeGsap, /threshold: 0\.35/, "demo IO threshold 0.35");
assert.match(homeGsap, /HERO_HARD_PAUSE = 0\.35/, "hero hard pause at 35%");
assert.match(homeGsap, /resumeHero/, "hero resumes on scroll back");
assert.match(homeGsap, /buildHeroExitTimeline/, "hero exit timeline");
assert.match(homeGsap, /bindBrandsHandoff/, "brands handoff ST");
assert.match(homeGsap, /runBrandsHandoff/, "has brands handoff");
assert.match(homeGsap, /ScrollTrigger\.scrollTo/, "rail scrollTo with offset");
assert.match(homeGsap, /story-gsap-live/, "marks gsap init");
assert.match(homeGsap, /hover: none/, "mobile guard touch-only");
assert.match(homeGsap, /clearChapterTransforms/, "clears stale transforms on reinit");
assert.match(homeGsap, /is-revealed/, "reveal class for copy/bridge");
assert.match(homeGsap, /is-demo-visible/, "chapter demo visibility class");
assert.match(homeGsap, /0px 0px 20% 0px/, "bridge IO triggers 20% early");
assert.match(homeGsap, /0px 0px -8% 0px/, "copy IO keeps delayed rootMargin");
assert.doesNotMatch(homeGsap, /buildNopinDirector/, "no lens scrub director");
assert.doesNotMatch(homeGsap, /buildChapterTimeline/, "no chapter lens timeline");
assert.doesNotMatch(homeGsap, /shouldStackShow/, "no pin stack visibility");
assert.doesNotMatch(homeGsap, /primeChapterElements/, "no global prime hiding content");
assert.doesNotMatch(homeGsap, /buildStoryMasterTimeline/, "no whole-world master pin");
assert.doesNotMatch(homeGsap, /margin-top:\s*-100vh/, "no negative viewport stack in JS");
assert.doesNotMatch(homeGsap, /\.to\s*\(\s*["']#demoWrap/, "GSAP does not tween #demoWrap");
assert.doesNotMatch(homeGsap, /#bridge-hero/, "hero bridge not driven from hero timeline selector");

assert.match(homeStoryCss, /story-decoupled-mode/, "css decoupled mode");
assert.match(homeStoryCss, /is-revealed/, "css reveal state");
assert.match(homeStoryCss, /is-demo-visible/, "css demo visible z-index");
assert.match(homeStoryCss, /scale\(0\.96\)/, "demo wrap enter scale");
assert.match(homeStoryCss, /transition-duration: 0\.3s/, "mobile demo wrap shorter");
assert.match(homeStoryCss, /opacity 0\.8s ease-out/, "bridge reveal 0.8s");
assert.match(homeStoryCss, /html\.story-decoupled-mode \.chapter-demo-wrap/, "reduced-motion resets demo wrap");
assert.match(homeStoryCss, /story-bridge-in/, "css bridge-in");
assert.match(homeStoryCss, /overflow: visible/, "chapter overflow visible");
assert.match(homeStoryCss, /html:has\(#story-world\)/, "home disables smooth scroll via tokens override");
assert.match(homeStoryCss, /home-ime-cancel-chip/, "css Esc cancel chip");
assert.match(homeStoryCss, /min-height: 100vh/, "chapter fills viewport");
assert.doesNotMatch(homeStoryCss, /margin-top:\s*-100vh/, "no pin chapter stack gap");
assert.doesNotMatch(homeStoryCss, /is-stack-visible/, "no pin stack visibility css");

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
