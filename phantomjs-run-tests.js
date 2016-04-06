/* global phantom */
"use strict";

var page = require('webpage').create();
var url = 'http://127.0.0.1:8001/test/index.html';
// var url = 'http://phantomjs.org/';

page.onError = function (msg, trace) {
  console.log('\nBROWSER ERROR:\n' + msg);
  trace.forEach(function(item) {
    console.log('  ', item.file, ':', item.line);
  });
};

page.onConsoleMessage = function(msg, lineNum, sourceId) {
  console.log('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
};

console.log('opening ' + url);
page.open(url, function (status) {
  console.log(url + ' loaded: ' + status);

  var interval = setInterval(function () {
    console.log('interval');
    var results = JSON.parse(page.evaluate(function () {
      return JSON.stringify(window.results || {});
    }));

    if (results.completed || results.failures.length) {
      clearInterval(interval);
      console.log('\nDONE:');
      console.log(JSON.stringify(results, null, 2));
      phantom.exit();
    } else {
      console.log('=> ', results);
    }
  }, 1000);
});
