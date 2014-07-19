'use strict';

var utils = require('./pouch-utils');

exports.filter = function (config) {
  var db = this;

  var incoming = function (doc) {
    if (config.incoming) {
      return config.incoming(utils.clone(doc));
    }
    return doc;
  };
  var outgoing = function (doc) {
    if (config.outgoing) {
      return config.outgoing(utils.clone(doc));
    }
    return doc;
  };

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
  // post
  //
  var origPost = db.post;
  db.post = utils.getArguments(function (args) {
    var doc = args[0];

    doc = incoming(doc);

    args[0] = doc;
    return origPost.apply(db, args);
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

  //
  // bulkDocs
  //
  var origBulkDocs = db.bulkDocs;
  db.bulkDocs = utils.getArguments(function (args) {
    var docsObj = args[0];

    docsObj = Array.isArray(docsObj) ? docsObj.slice() : utils.clone(docsObj);
    var docs = Array.isArray(docsObj) ? docsObj : docsObj.docs;

    for (var i = 0; i < docs.length; i++) {
      docs[i] = incoming(docs[i]);
    }

    args[0] = docsObj;
    return origBulkDocs.apply(db, args);
  });
};

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
}
