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
var homeBundle = read("website/js/i18n-bundles/home.js");
var i18nCore = read("website/js/i18n-bundles/core.js");
var i18n = read("website/js/i18n.js");

[indexHtml, protoHtml].forEach(function (html, i) {
  var label = i === 0 ? "index.html" : "home-story-scroll.html";
  assert.match(html, /gsap\.min\.js/, label + " loads GSAP");
  assert.match(html, /ScrollTrigger/, label + " loads ScrollTrigger");
});

assert.match(indexHtml, /id="story-world"/, "index has story-world");
assert.match(indexHtml, /id="story-world"[^>]*data-mood="light"/, "story-world starts mood light");
assert.match(indexHtml, /id="ch-trigger"[^>]*data-mood="light"/, "trigger mood light");
assert.match(indexHtml, /id="ch-voice"[^>]*data-mood="dark"/, "voice mood dark");
assert.match(indexHtml, /id="ch-advanced"[^>]*data-mood="pad"/, "advanced mood pad");
assert.match(indexHtml, /id="ch-trigger"/, "index has ch-trigger");
assert.match(indexHtml, /id="ch-advanced"/, "index has ch-advanced (camera + softpad tabs)");
assert.match(indexHtml, /id="ch-voice"/, "index has ch-voice");
assert.match(indexHtml, /hero-exit-overlay/, "index has hero exit overlay");
assert.match(indexHtml, /home-gsap\.js/, "index loads home-gsap.js");
assert.match(indexHtml, /home-story\.css/, "index loads home-story.css");
assert.match(indexHtml, /id="ime-cancel-chip"/, "index has voice Esc cancel chip");
assert.match(indexHtml, /story-bridge-in/, "index has ch-trigger bridge-in");
assert.match(indexHtml, /story-bridge-out/, "index has in-chapter bridge-out");
assert.match(indexHtml, /homeBridgeTriggerCamera/, "bridge trigger→camera");
assert.match(indexHtml, /homeBridgeCameraVoice/, "bridge camera→voice");
assert.doesNotMatch(indexHtml, /scroll-smooth/, "index has no scroll-smooth");
assert.doesNotMatch(indexHtml, /id="sec-chain"/, "sec-chain removed");
assert.doesNotMatch(indexHtml, /id="sec-caps"/, "sec-caps removed");

var siteNav = indexHtml.match(/<nav class="site-nav"[\s\S]*?<\/nav>/);
assert.ok(siteNav, "index has site-nav");
assert.match(siteNav[0], /data-nav="quickstart"/, "top nav has quickstart");
assert.match(siteNav[0], /site-nav-scenes/, "top nav has scenes dropdown");
assert.match(siteNav[0], /data-nav="download"/, "top nav has download");
assert.doesNotMatch(siteNav[0], /data-nav="voice"|data-nav="keys"|data-nav="camera"|data-nav="softpad"/, "top nav has no flat feature data-nav");
assert.match(indexHtml, /href="keys\.html"/, "trigger keys deep link");
assert.match(indexHtml, /quickstart\.html#voice/, "voice deep link");
assert.doesNotMatch(indexHtml, /quickstart\.html#keys/, "keys no longer on quickstart hash");
assert.match(indexHtml, /homeChTriggerKeys/, "keys chip i18n");
assert.match(indexHtml, /homeChVoiceLink/, "voice chip i18n");
assert.match(indexHtml, /chapter-chip[\s\S]*ph-keyboard/, "keys chip has icon");
assert.match(indexHtml, /pad-teaser-keys[\s\S]*ph-squares-four|ch-advanced-tab[\s\S]*SoftPad/, "softpad surfaced in advanced section");
assert.match(indexHtml, /pad-teaser-keys[\s\S]*pad-teaser-tall[\s\S]*pad-teaser-wide/, "softpad teaser is numpad layout");
assert.match(homeStoryCss, /\.pad-teaser-key \{[\s\S]*linear-gradient\(180deg/, "softpad keys have keycap gradient");
assert.match(homeStoryCss, /max-height 0\.55s/, "softpad morph animates height");
assert.match(homeStoryCss, /pad-teaser-face--mini/, "softpad mini face crossfade");
assert.match(homeDemo, /MORPH_MS/, "softpad demo waits for morph");
assert.match(homeStoryCss, /\.chapter-chip \{[\s\S]*background:\s*#fff/, "chapter chip solid like download CTA");
assert.match(indexHtml, /vision\.html/, "camera deep link");
assert.match(indexHtml, /id="home-camera-teaser"/, "camera chapter has teaser card");
assert.match(indexHtml, /id="ch-advanced"[\s\S]*?id="home-camera-teaser"/, "camera teaser lives in ch-advanced");
assert.doesNotMatch(indexHtml, /chapter-demo-wrap--pair/, "no side-by-side pair wrap");
assert.doesNotMatch(indexHtml, /chapter-chip--camera/, "camera not a sibling chip next to keys");
assert.match(indexHtml, /agent\.html/, "softpad deep link");
assert.match(indexHtml, /tailwind\.built\.css/, "index uses built tailwind");
assert.doesNotMatch(indexHtml, /cdn\.tailwindcss\.com/, "index no tailwind CDN");

var shellJs = read("website/js/shell.js");
assert.match(shellJs, /bindScenesNav/, "shell binds scenes dropdown");

assert.match(i18n, /mergeI18nBundles/, "i18n merges page bundles");
assert.match(homeBundle, /homeChTriggerKeys/, "bundle homeChTriggerKeys");
assert.match(homeBundle, /homeChVoiceLink/, "bundle homeChVoiceLink");
assert.match(homeBundle, /homeChCameraLink/, "bundle homeChCameraLink");
assert.match(indexHtml, /homeQuotesLead/, "quotes lead i18n");
assert.match(indexHtml, /home-quote-avatar/, "quotes have avatars");
assert.equal((indexHtml.match(/class="home-quote /g) || []).length, 8, "eight quote cards");
assert.doesNotMatch(indexHtml, /homeQuote1Text/, "quote bodies stay original, not i18n");
assert.match(indexHtml, /qingzhi0508/, "real Chinese user qingzhi0508");
assert.match(indexHtml, /Andrej Karpathy/, "real English Karpathy");
assert.match(indexHtml, />comerc</, "real Russian user comerc");
assert.match(indexHtml, />abalol</, "real Japanese user abalol");
assert.match(indexHtml, />goddaehee</, "real Korean user goddaehee");
assert.match(indexHtml, /Juan Pol/, "real Spanish user Juan Pol");
assert.match(indexHtml, /Matthieu HERMAN/, "real French user Matthieu HERMAN");
assert.match(indexHtml, /Fadl Labanie/, "real Arabic user Fadl Labanie");
assert.match(indexHtml, /dir="rtl"/, "Arabic quote is RTL");
assert.match(indexHtml, /home-quote-src/, "quotes link to source");
assert.doesNotMatch(indexHtml, /homeQuote[0-9]Role/, "no language-tagged quote roles");
assert.doesNotMatch(indexHtml, /aning\.svg|阿宁|小林|老周/, "no fabricated personas");
assert.doesNotMatch(indexHtml, /without reviewing the code/, "no jargon definition quotes");
assert.doesNotMatch(indexHtml, /功能 POC/, "no POC jargon quote");


var voiceSection = indexHtml.match(/id="ch-voice"[\s\S]*?<\/section>/);
assert.ok(voiceSection && !/story-bridge-in/.test(voiceSection[0]), "ch-voice has no duplicate bridge-in");
var advancedSection = indexHtml.match(/id="ch-advanced"[\s\S]*?<\/section>/);
assert.ok(advancedSection && !/story-bridge-in/.test(advancedSection[0]), "ch-advanced has no duplicate bridge-in");

assert.match(protoHtml, /camera-rig-lens/, "prototype has camera-rig-lens");
assert.match(protoHtml, /story-bridge-in/, "prototype has ch-trigger bridge-in");

assert.match(homeDemo, /OneToneHomeDemo/, "exports OneToneHomeDemo");
assert.match(homeDemo, /pauseHero/, "exports pauseHero");
assert.match(homeDemo, /isHeroIntroDone/, "exports isHeroIntroDone");
assert.match(homeDemo, /initCameraTeaser/, "camera teaser demo");
assert.match(homeDemo, /ime-cancel-chip/, "voice demo flashes Esc cancel");
assert.match(homeDemo, /ime-typed-1/, "IME typed target kept for demo loop");
assert.match(homeDemo, /onetone:home-demo-ready/, "dispatches demo ready event");

assert.match(homeGsap, /story-decoupled-mode/, "scheme B decoupled mode");
assert.match(homeGsap, /initDemoIO/, "IO drives chapter demos");
assert.match(homeGsap, /initReveals/, "IO reveals copy and bridge");
assert.match(homeGsap, /"ch-advanced"/, "gsap registers advanced chapter");
assert.match(homeGsap, /"advanced"/, "gsap advanced demo name");
assert.match(homeGsap, /threshold: \[0, 0\.12/, "demo IO hysteresis thresholds");
assert.match(homeGsap, /HERO_HARD_PAUSE = 0\.35/, "hero hard pause at 35%");
assert.match(homeGsap, /resumeHero/, "hero resumes on scroll back");
assert.match(homeStoryCss, /\.chapter-demo--camera/, "camera card css");
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
assert.match(homeGsap, /initMoodIO/, "mood IO switches story-world");
assert.match(homeGsap, /setStoryMood|data-mood/, "sets data-mood on story-world");
assert.match(homeGsap, /splitBridgeWords/, "bridge word split");
assert.match(homeGsap, /bridge-word/, "bridge word class");
assert.match(homeGsap, /BRIDGE_STAGGER_TOTAL = 0\.3/, "bridge stagger window 0.3s");
assert.match(homeGsap, /splitVoiceChars/, "voice answer char split");
assert.match(homeGsap, /voice-char/, "voice char class");
assert.match(homeGsap, /initVoiceCharScrub/, "voice char scroll scrub");
assert.match(homeGsap, /#ch-voice/, "voice scrub triggers on ch-voice");
assert.doesNotMatch(homeGsap, /SplitText/, "no Club SplitText dependency");
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
assert.match(homeStoryCss, /opacity 0\.15s ease-out/, "bridge line fade short for word stagger");
assert.match(homeStoryCss, /\.story-world\[data-mood/, "shared mood bg on story-world");
assert.match(homeStoryCss, /0\.6s ease/, "mood bg transition 0.6s");
assert.match(homeStoryCss, /#1a1c22/, "trigger mood cool blue-gray");
assert.match(homeStoryCss, /#08080a/, "voice mood cold black");
assert.match(homeStoryCss, /#161320/, "softpad mood warm violet");
assert.doesNotMatch(homeStoryCss, /\.story-world\[data-mood="light"\] \{\s*background: #121214/, "old gray trigger mood gone");
assert.match(homeStoryCss, /\.story-world \.story-chapter \{\s*background: transparent/, "chapters transparent over mood");
assert.match(homeStoryCss, /\.bridge-word/, "bridge word styles");
assert.match(homeStoryCss, /\.voice-char/, "voice char styles");
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
  "homeStoryCounter3",
  "homeBridgeHero",
  "homeBridgeTriggerCamera",
  "homeBridgeCameraVoice",
  "homeBridgeVoicePad",
  "homeChTriggerQ",
  "homeChCameraQ",
  "homeChVoiceQ",
  "homeChVoiceCancel",
  "homeChSoftpadQ",
];
i18nKeys.forEach(function (key) {
  assert.match(homeBundle + i18nCore, new RegExp(key), "bundle has " + key);
});

var siteScrollJs = read("website/js/site-scroll.js");
var siteScrollCss = read("website/css/site-scroll.css");
assert.match(siteScrollJs, /story-gsap-live/, "site-scroll marks story-gsap-live");
assert.match(siteScrollJs, /IntersectionObserver/, "site-scroll uses IO");
assert.match(siteScrollJs, /qs-hero-mode/, "site-scroll listens for quickstart hero mode");
assert.match(siteScrollCss, /data-mood="pad"/, "site-scroll has pad mood");
assert.match(siteScrollCss, /data-scroll-reveal/, "site-scroll reveal CSS");

["quickstart.html", "keys.html", "faq.html", "vision.html", "agent.html"].forEach(function (page) {
  var html = read("website/" + page);
  assert.match(html, /id="story-world"/, page + " has story-world");
  assert.match(html, /site-scroll\.js/, page + " loads site-scroll.js");
  assert.match(html, /site-scroll\.css/, page + " loads site-scroll.css");
  assert.match(html, /tailwind\.built\.css/, page + " uses built tailwind");
  assert.doesNotMatch(html, /class="[^"]*scroll-smooth/, page + " has no scroll-smooth");
});

var qsHtml = read("website/quickstart.html");
assert.match(qsHtml, /id="qs-hero"/, "quickstart keeps hero");
assert.match(qsHtml, /data-mood="light"/, "quickstart has light mood");
assert.match(qsHtml, /data-scroll-reveal/, "quickstart has scroll reveal blocks");

var keysHtml = read("website/keys.html");
assert.match(keysHtml, /data-page="keys"/, "keys page identity");
assert.match(keysHtml, /data-hero-keys/, "keys page has keys hero");
assert.match(keysHtml, /id="step1"/, "keys page has bind zone");
assert.match(keysHtml, /qs-sleek-terminal/, "keys page uses classic demo log");
assert.match(keysHtml, /按键映射 — 一声 OneTone/, "keys page distinct title");
assert.doesNotMatch(keysHtml, /qs-hero-minibar|qs-guide-video|data-hero-voice/, "keys page is classic keys, not 上手 agent");
assert.match(read("website/js/quickstart-demo.js"), /initQsClassicKeysHero/, "classic keys hero demo");
assert.match(read("website/js/quickstart-demo.js"), /location\.replace\("keys\.html"\)/, "old #keys redirects to keys.html");
assert.match(read("website/quickstart.html"), /qs-hero-minibar/, "上手 keeps agent minibar hero");
assert.match(read("website/quickstart.html"), /qsHeroAgentBadge/, "上手 uses agent i18n keys");

console.log("website-home-story.test.js: all assertions passed");
