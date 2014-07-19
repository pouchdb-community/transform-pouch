'use strict';

var utils = require('./pouch-utils');
var EE = require('events').EventEmitter;

exports.filter = function (config) {
  var db = this;

  var incoming = function (doc) {
    if (typeof doc._id === 'string' && utils.isLocalId(doc._id)) {
      return doc;
    }
    if (config.incoming) {
      return config.incoming(utils.clone(doc));
    }
    return doc;
  };
  var outgoing = function (doc) {
    if (typeof doc._id === 'string' && utils.isLocalId(doc._id)) {
      return doc;
    }
    if (config.outgoing) {
      return config.outgoing(utils.clone(doc));
    }
    return doc;
  };

  if (db.type() === 'http') {
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
    // query
    //
    var origQuery = db.query;
    db.query = utils.toPromise(function (fun, opts, origCallback) {
      if (typeof opts === 'function') {
        origCallback = opts;
        opts = {};
      }

      var callback = function (err, res) {
        /* istanbul ignore next */
        if (err) {
          return origCallback(err);
        }
        res.rows.forEach(function (row) {
          if (row.doc) {
            row.doc = outgoing(row.doc);
          }
        });
        origCallback(null, res);
      };
      origQuery.apply(db, [fun, opts, callback]);
    });
  }

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

      if (Array.isArray(res)) {
        // open_revs style, it's a list of docs
        res.forEach(function (doc) {
          if (doc.ok) {
            doc.ok = outgoing(doc.ok);
          }
        });
      } else {
        res = outgoing(res);
      }
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

  //
  // allDocs
  //
  var origAllDocs = db.allDocs;
  db.allDocs = utils.toPromise(function (opts, origCallback) {
    if (typeof opts === 'function') {
      origCallback = opts;
      opts = {};
    }

    var callback = function (err, res) {
      /* istanbul ignore next */
      if (err) {
        return origCallback(err);
      }
      res.rows.forEach(function (row) {
        if (row.doc) {
          row.doc = outgoing(row.doc);
        }
      });
      origCallback(null, res);
    };
    origAllDocs.apply(db, [opts, callback]);
  });

  //
  // changes
  //
  var origChanges = db.changes;
  utils.inherits(Changes, EE);
  function Changes(opts, callback) {
    var self = this;
    EE.call(this);
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }

    function modifyDoc(change) {
      if (change.doc) {
        change.doc = outgoing(change.doc);
      }
      return change;
    }

    var delegate = origChanges.apply(db, [opts, callback]);

    delegate.on('error', function (err) {
      self.emit('error', err);
    });
    delegate.on('complete', function (res) {
      self.emit('complete', res);
    });
    delegate.on('destroyed', function (res) {
      self.emit('destroyed', res);
    });
    delegate.on('uptodate', function (res) {
      if (res.results) {
        res.results = res.results.map(modifyDoc);
      }
      self.emit('uptodate', res);
    });

    // CRUD
    delegate.on('change', function (res) {
      self.emit('change', modifyDoc(res));
    });
    delegate.on('update', function (res) {
      self.emit('update', res);
    });
    delegate.on('delete', function (res) {
      self.emit('delete', res);
    });
    delegate.on('create', function (res) {
      self.emit('create', res);
    });
  }
  /*db.changes = function (opts, callback) {
    return new Changes(opts, callback);
  };*/
};

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
}
