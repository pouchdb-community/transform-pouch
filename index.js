'use strict';

var utils = require('./pouch-utils');
var wrappers = require('pouchdb-wrappers');

function isUntransformable(doc) {
  var isLocal = typeof doc._id === 'string' && utils.isLocalId(doc._id);
  return isLocal || doc._deleted;
}

// api.filter provided for backwards compat with the old "filter-pouch"
exports.transform = exports.filter = function transform(config) {
  var db = this;

  var incoming = function (doc) {
    if (!isUntransformable(doc) && config.incoming) {
      return config.incoming(utils.clone(doc));
    }
    return doc;
  };
  var outgoing = function (doc) {
    if (!isUntransformable(doc) && config.outgoing) {
      return config.outgoing(utils.clone(doc));
    }
    return doc;
  };

  var handlers = {};

  if (db.type() === 'http') {
    handlers.query = function (orig) {
      return orig().then(function (res) {
        res.rows.forEach(function (row) {
          if (row.doc) {
            row.doc = outgoing(row.doc);
          }
        });

        return res;
      });
    };
  }

  handlers.get = function (orig) {
    return orig().then(function (res) {
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
      return res;
    });
  };

  handlers.bulkDocs = function (orig, args) {
    for (var i = 0; i < args.docs.length; i++) {
      args.docs[i] = incoming(args.docs[i]);
    }
    return orig();
  };

  handlers.allDocs = function (orig) {
    return orig().then(function (res) {
      res.rows.forEach(function (row) {
        if (row.doc) {
          row.doc = outgoing(row.doc);
        }
      });
      return res;
    });
  };

  handlers.changes = function (orig) {
    function modifyChange(change) {
      if (change.doc) {
        change.doc = outgoing(change.doc);
      }
      return change;
    }

    function modifyChanges(res) {
      res.results = res.results.map(modifyChange);
      return res;
    }

    var changes = orig();
    // override some events
    var origOn = changes.on;
    changes.on = function (event, listener) {
      if (event === 'change') {
        return origOn.apply(changes, [event, function (change) {
          listener(modifyChange(change));
        }]);
      } else if (event === 'complete') {
        return origOn.apply(changes, [event, function (res) {
          listener(modifyChanges(res));
        }]);
      }
      return origOn.apply(changes, [event, listener]);
    };

    var origThen = changes.then;
    changes.then = function (resolve, reject) {
      return origThen.apply(changes, [function (res) {
        resolve(modifyChanges(res));
      }, reject]);
    };
    return changes;
  };
  wrappers.installWrapperMethods(db, handlers);
};

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports);
}
