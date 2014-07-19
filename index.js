'use strict';

var utils = require('./pouch-utils');

exports.filter = function (config) {
  var db = this;

  var incoming = config.incoming || function (doc) { return doc; };
  var outgoing = config.outgoing || function (doc) { return doc; };


  //
  // put
  //
  var origPut = db.put;
  db.put = utils.getArguments(function (args) {
    var doc = args[0];

    doc = incoming(doc);

    args[0] = doc;
    return origPut.apply(db, args);
  });

  //
  // get
  //
  var origGet = db.get;
  db.get = utils.toPromise(function (id, opts, origCallback) {
    if (typeof opts === 'function') {
      origCallback = opts;
      opts = {};
    }

    var callback = function (err, res) {
      if (err) {
        return origCallback(err);
      }
      res = outgoing(res);
      origCallback(null, res);
    };
    origGet.apply(db, [id, opts, callback]);
  });
};

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
}
