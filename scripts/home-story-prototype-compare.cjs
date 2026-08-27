#!/usr/bin/env node
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var read = function (rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
};

var protoA = read("website/prototypes/home-story-sticky-stage.html");
var protoB = read("website/prototypes/home-story-decoupled.html");
var jsA = read("website/prototypes/home-story-sticky-stage.js");
var jsB = read("website/prototypes/home-story-decoupled.js");
var cssA = read("website/prototypes/home-story-sticky-stage.css");
var cssB = read("website/prototypes/home-story-decoupled.css");
var iaCompare = read("website/prototypes/home-ia-compare.html");

assert.match(protoA, /id="demo-stage"/, "proto A has sticky demo stage");
assert.match(protoA, /home-story-sticky-stage\.js/, "proto A loads sticky JS");
assert.match(protoA, /story-step/, "proto A has scroll steps");
assert.match(jsA, /initStageIO/, "proto A uses IO for stage");
assert.match(jsA, /setStep/, "proto A switches steps");
assert.doesNotMatch(jsA, /buildNopinDirector/, "proto A no lens scrub director");

assert.match(protoB, /id="ch-trigger"/, "proto B keeps chapter DOM");
assert.match(protoB, /home-story-decoupled\.js/, "proto B loads decoupled JS");
assert.match(jsB, /initDemoIO/, "proto B uses IO for demos");
assert.match(jsB, /initReveals/, "proto B reveals copy via IO");
assert.doesNotMatch(jsB, /buildChapterTimeline/, "proto B no lens timeline");
assert.match(cssB, /proto-decoupled-mode/, "proto B decoupled CSS mode");

assert.match(iaCompare, /home-story-sticky-stage\.html/, "IA compare links proto A");
assert.match(iaCompare, /home-story-decoupled\.html/, "IA compare links proto B");

console.log("home-story-prototype-compare: static assertions passed");

var baseUrl = process.env.PROTOTYPE_BASE_URL || "http://127.0.0.1:8765";
var runBrowser = process.env.SKIP_PROTOTYPE_BROWSER !== "1";

if (!runBrowser) {
  console.log("SKIP_PROTOTYPE_BROWSER=1 — skipping Playwright scroll sampling");
  process.exit(0);
}

var chromium;
try {
  chromium = require("playwright").chromium;
} catch (e) {
  console.warn("playwright not available — static checks only");
  process.exit(0);
}

var prototypes = [
  { name: "A-sticky", url: baseUrl + "/prototypes/home-story-sticky-stage.html", demoSel: "#demo-stage" },
  { name: "B-decoupled", url: baseUrl + "/prototypes/home-story-decoupled.html", demoSel: "#ch-trigger .chapter-demo" },
];

function samplePage(page, cfg) {
  return page.evaluate(function (demoSelector) {
    function demoState() {
      var el = document.querySelector(demoSelector);
      if (!el) return { op: 0, visible: false };
      var cs = window.getComputedStyle(el);
      var r = el.getBoundingClientRect();
      return {
        op: parseFloat(cs.opacity),
        visible: r.top < window.innerHeight && r.bottom > 0,
      };
    }

    function heroScene() {
      var typed = document.querySelector("#opAppBody .op-input-text");
      var stage = document.getElementById("opStage");
      return {
        hasTyped: !!(typed && typed.textContent && typed.textContent.length > 0),
        phase: stage ? stage.className : "",
      };
    }

    return { demo: demoState(), hero: heroScene() };
  }, cfg.demoSel);
}

(async function () {
  var browser = await chromium.launch();
  var context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var failures = [];

  for (var i = 0; i < prototypes.length; i++) {
    var cfg = prototypes[i];
    var page = await context.newPage();
    var errors = [];
    page.on("pageerror", function (err) {
      errors.push(err.message);
    });

    try {
      await page.goto(cfg.url, { waitUntil: "networkidle", timeout: 15000 });
    } catch (e) {
      failures.push(cfg.name + ": cannot load " + cfg.url + " (" + e.message + ")");
      await page.close();
      continue;
    }

    await page.waitForTimeout(2000);

    var heroBefore = await samplePage(page, cfg);
    await page.waitForTimeout(2500);
    var heroAfter = await samplePage(page, cfg);

    if (!heroAfter.hero.hasTyped && heroBefore.hero.phase === heroAfter.hero.phase) {
      failures.push(cfg.name + ": hero demo did not advance in 2.5s");
    }

    var docHeight = await page.evaluate(function () {
      return document.documentElement.scrollHeight;
    });

    var visibleAtSomePoint = false;
    for (var y = 200; y <= docHeight; y += 200) {
      await page.evaluate(function (yy) {
        window.scrollTo(0, yy);
      }, y);
      await page.waitForTimeout(120);
      var snap = await samplePage(page, cfg);
      if (snap.demo.visible && snap.demo.op > 0.85) visibleAtSomePoint = true;
    }

    if (!visibleAtSomePoint) {
      failures.push(cfg.name + ": no scroll point with visible demo (opacity > 0.85)");
    }

    if (errors.length) {
      failures.push(cfg.name + ": page errors: " + errors.join("; "));
    }

    console.log(cfg.name + ": hero advanced=" + (heroAfter.hero.hasTyped || heroBefore.hero.phase !== heroAfter.hero.phase) + ", demo visible while scrolling=" + visibleAtSomePoint);
    await page.close();
  }

  await browser.close();

  if (failures.length) {
    console.error("\nFailures:");
    failures.forEach(function (f) {
      console.error("  - " + f);
    });
    process.exit(1);
  }

  console.log("home-story-prototype-compare: browser sampling passed");
})();
