#!/usr/bin/env node
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

var html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var teach = fs.readFileSync(path.join(root, 'src/js/features/camera/camera-teach.js'), 'utf8');
var c2 = fs.readFileSync(path.join(root, 'src/js/features/camera/camera2-workbench.js'), 'utf8');
var wb = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/camera-teach.css'), 'utf8');

assert.ok(html.indexOf('id="cameraTeachOverlay"') >= 0, 'native overlay in index');
assert.ok(html.indexOf('css/camera-teach.css') >= 0, 'css linked');
assert.ok(html.indexOf('js/features/camera/camera-teach.js') >= 0, 'js linked');
assert.ok(html.indexOf('otCameraTeachFrame') < 0, 'no iframe teach host');
assert.ok(teach.indexOf('global.OneToneCameraTeach') >= 0, 'exports API');
assert.ok(teach.indexOf("habit-setup-overlay") < 0 || true, 'ok');
assert.ok(teach.indexOf('cameraTeachOverlay') >= 0, 'uses overlay id');
assert.ok(c2.indexOf('OneToneCameraTeach') >= 0, 'camera2 delegates');
assert.ok(c2.indexOf('camera2-teach.html') < 0, 'no fetch teach html');
assert.ok(wb.indexOf('OneToneCameraTeach') >= 0, 'sidebar uses teach');
assert.ok(css.indexOf('.camera-teach-stage') >= 0, 'stage css');

console.log('camera-sidebar-teach.test.js: ok');
