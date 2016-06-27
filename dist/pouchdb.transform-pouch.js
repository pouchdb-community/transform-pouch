(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process){
'use strict';

var Promise = require('lie');
var utils = require('./pouch-utils');
var wrappers = require('pouchdb-wrappers');
var immediate = require('immediate');

function isntInternalKey(key) {
  return key[0] !== '_';
}

function isUntransformable(doc) {
  var isLocal = typeof doc._id === 'string' && utils.isLocalId(doc._id);

  if (isLocal) {
    return true;
  }

  if (doc._deleted) {
    return Object.keys(doc).filter(isntInternalKey).length === 0;
  }

  return false;
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
      var none = {};
      return orig().then(function (res) {
        return utils.Promise.all(res.rows.map(function (row) {
          if (row.doc) {
            return outgoing(row.doc);
          }
          return none;
        })).then(function (resp) {
          resp.forEach(function (doc, i) {
            if (doc === none) {
              return;
            }
            res.rows[i].doc = doc;
          });
          return res;
        });
      });
    };
  }

  handlers.get = function (orig) {
    return orig().then(function (res) {
      if (Array.isArray(res)) {
        var none = {};
        // open_revs style, it's a list of docs
        return utils.Promise.all(res.map(function (row) {
          if (row.ok) {
            return outgoing(row.ok);
          }
          return none;
        })).then(function (resp) {
          resp.forEach(function (doc, i) {
            if (doc === none) {
              return;
            }
            res[i].ok = doc;
          });
          return res;
        });
      } else {
        return outgoing(res);
      }
    });
  };

  handlers.bulkDocs = function (orig, args) {
    for (var i = 0; i < args.docs.length; i++) {
      args.docs[i] = incoming(args.docs[i]);
    }
    return Promise.all(args.docs).then(function (docs) {
      args.docs = docs;
      return orig();
    });
  };

  handlers.allDocs = function (orig) {
    return orig().then(function (res) {
      var none = {};
      return utils.Promise.all(res.rows.map(function (row) {
        if (row.doc) {
          return outgoing(row.doc);
        }
        return none;
      })).then(function (resp) {
        resp.forEach(function (doc, i) {
          if (doc === none) {
            return;
          }
          res.rows[i].doc = doc;
        });
        return res;
      });
    });
  };

  handlers.changes = function (orig) {
    function modifyChange(change) {
      if (change.doc) {
        return utils.Promise.resolve(outgoing(change.doc)).then(function (doc) {
          change.doc = doc;
          return change;
        });
      }
      return utils.Promise.resolve(change);
    }

    function modifyChanges(res) {
      return utils.Promise.all(res.results.map(modifyChange)).then(function (results) {
        res.results = results;
        return res;
      });
    }

    var changes = orig();
    // override some events
    var origOn = changes.on;
    changes.on = function (event, listener) {
      if (event === 'change') {
        return origOn.apply(changes, [event, function (change) {
          modifyChange(change).then(function (resp) {
            immediate(function () {
              listener(resp);
            });
          });
        }]);
      } else if (event === 'complete') {
        return origOn.apply(changes, [event, function (res) {
          modifyChanges(res).then(function (resp) {
            process.nextTick(function () {
              listener(resp);
            });
          });
        }]);
      }
      return origOn.apply(changes, [event, listener]);
    };

    var origThen = changes.then;
    changes.then = function (resolve, reject) {
      return origThen.apply(changes, [function (res) {
        modifyChanges(res).then(resolve, reject);
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

}).call(this,require('_process'))
},{"./pouch-utils":10,"_process":8,"immediate":2,"lie":4,"pouchdb-wrappers":7}],2:[function(require,module,exports){
(function (global){
'use strict';
var Mutation = global.MutationObserver || global.WebKitMutationObserver;

var scheduleDrain;

{
  if (Mutation) {
    var called = 0;
    var observer = new Mutation(nextTick);
    var element = global.document.createTextNode('');
    observer.observe(element, {
      characterData: true
    });
    scheduleDrain = function () {
      element.data = (called = ++called % 2);
    };
  } else if (!global.setImmediate && typeof global.MessageChannel !== 'undefined') {
    var channel = new global.MessageChannel();
    channel.port1.onmessage = nextTick;
    scheduleDrain = function () {
      channel.port2.postMessage(0);
    };
  } else if ('document' in global && 'onreadystatechange' in global.document.createElement('script')) {
    scheduleDrain = function () {

      // Create a <script> element; its readystatechange event will be fired asynchronously once it is inserted
      // into the document. Do so, thus queuing up the task. Remember to clean up once it's been called.
      var scriptEl = global.document.createElement('script');
      scriptEl.onreadystatechange = function () {
        nextTick();

        scriptEl.onreadystatechange = null;
        scriptEl.parentNode.removeChild(scriptEl);
        scriptEl = null;
      };
      global.document.documentElement.appendChild(scriptEl);
    };
  } else {
    scheduleDrain = function () {
      setTimeout(nextTick, 0);
    };
  }
}

var draining;
var queue = [];
//named nextTick for less confusing stack traces
function nextTick() {
  draining = true;
  var i, oldQueue;
  var len = queue.length;
  while (len) {
    oldQueue = queue;
    queue = [];
    i = -1;
    while (++i < len) {
      oldQueue[i]();
    }
    len = queue.length;
  }
  draining = false;
}

module.exports = immediate;
function immediate(task) {
  if (queue.push(task) === 1 && !draining) {
    scheduleDrain();
  }
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],3:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],4:[function(require,module,exports){
'use strict';
var immediate = require('immediate');

/* istanbul ignore next */
function INTERNAL() {}

var handlers = {};

var REJECTED = ['REJECTED'];
var FULFILLED = ['FULFILLED'];
var PENDING = ['PENDING'];

module.exports = Promise;

function Promise(resolver) {
  if (typeof resolver !== 'function') {
    throw new TypeError('resolver must be a function');
  }
  this.state = PENDING;
  this.queue = [];
  this.outcome = void 0;
  if (resolver !== INTERNAL) {
    safelyResolveThenable(this, resolver);
  }
}

Promise.prototype["catch"] = function (onRejected) {
  return this.then(null, onRejected);
};
Promise.prototype.then = function (onFulfilled, onRejected) {
  if (typeof onFulfilled !== 'function' && this.state === FULFILLED ||
    typeof onRejected !== 'function' && this.state === REJECTED) {
    return this;
  }
  var promise = new this.constructor(INTERNAL);
  if (this.state !== PENDING) {
    var resolver = this.state === FULFILLED ? onFulfilled : onRejected;
    unwrap(promise, resolver, this.outcome);
  } else {
    this.queue.push(new QueueItem(promise, onFulfilled, onRejected));
  }

  return promise;
};
function QueueItem(promise, onFulfilled, onRejected) {
  this.promise = promise;
  if (typeof onFulfilled === 'function') {
    this.onFulfilled = onFulfilled;
    this.callFulfilled = this.otherCallFulfilled;
  }
  if (typeof onRejected === 'function') {
    this.onRejected = onRejected;
    this.callRejected = this.otherCallRejected;
  }
}
QueueItem.prototype.callFulfilled = function (value) {
  handlers.resolve(this.promise, value);
};
QueueItem.prototype.otherCallFulfilled = function (value) {
  unwrap(this.promise, this.onFulfilled, value);
};
QueueItem.prototype.callRejected = function (value) {
  handlers.reject(this.promise, value);
};
QueueItem.prototype.otherCallRejected = function (value) {
  unwrap(this.promise, this.onRejected, value);
};

function unwrap(promise, func, value) {
  immediate(function () {
    var returnValue;
    try {
      returnValue = func(value);
    } catch (e) {
      return handlers.reject(promise, e);
    }
    if (returnValue === promise) {
      handlers.reject(promise, new TypeError('Cannot resolve promise with itself'));
    } else {
      handlers.resolve(promise, returnValue);
    }
  });
}

handlers.resolve = function (self, value) {
  var result = tryCatch(getThen, value);
  if (result.status === 'error') {
    return handlers.reject(self, result.value);
  }
  var thenable = result.value;

  if (thenable) {
    safelyResolveThenable(self, thenable);
  } else {
    self.state = FULFILLED;
    self.outcome = value;
    var i = -1;
    var len = self.queue.length;
    while (++i < len) {
      self.queue[i].callFulfilled(value);
    }
  }
  return self;
};
handlers.reject = function (self, error) {
  self.state = REJECTED;
  self.outcome = error;
  var i = -1;
  var len = self.queue.length;
  while (++i < len) {
    self.queue[i].callRejected(error);
  }
  return self;
};

function getThen(obj) {
  // Make sure we only access the accessor once as required by the spec
  var then = obj && obj.then;
  if (obj && typeof obj === 'object' && typeof then === 'function') {
    return function appyThen() {
      then.apply(obj, arguments);
    };
  }
}

function safelyResolveThenable(self, thenable) {
  // Either fulfill, reject or reject with error
  var called = false;
  function onError(value) {
    if (called) {
      return;
    }
    called = true;
    handlers.reject(self, value);
  }

  function onSuccess(value) {
    if (called) {
      return;
    }
    called = true;
    handlers.resolve(self, value);
  }

  function tryToUnwrap() {
    thenable(onSuccess, onError);
  }

  var result = tryCatch(tryToUnwrap);
  if (result.status === 'error') {
    onError(result.value);
  }
}

function tryCatch(func, value) {
  var out = {};
  try {
    out.value = func(value);
    out.status = 'success';
  } catch (e) {
    out.status = 'error';
    out.value = e;
  }
  return out;
}

Promise.resolve = resolve;
function resolve(value) {
  if (value instanceof this) {
    return value;
  }
  return handlers.resolve(new this(INTERNAL), value);
}

Promise.reject = reject;
function reject(reason) {
  var promise = new this(INTERNAL);
  return handlers.reject(promise, reason);
}

Promise.all = all;
function all(iterable) {
  var self = this;
  if (Object.prototype.toString.call(iterable) !== '[object Array]') {
    return this.reject(new TypeError('must be an array'));
  }

  var len = iterable.length;
  var called = false;
  if (!len) {
    return this.resolve([]);
  }

  var values = new Array(len);
  var resolved = 0;
  var i = -1;
  var promise = new this(INTERNAL);

  while (++i < len) {
    allResolver(iterable[i], i);
  }
  return promise;
  function allResolver(value, i) {
    self.resolve(value).then(resolveFromAll, function (error) {
      if (!called) {
        called = true;
        handlers.reject(promise, error);
      }
    });
    function resolveFromAll(outValue) {
      values[i] = outValue;
      if (++resolved === len && !called) {
        called = true;
        handlers.resolve(promise, values);
      }
    }
  }
}

Promise.race = race;
function race(iterable) {
  var self = this;
  if (Object.prototype.toString.call(iterable) !== '[object Array]') {
    return this.reject(new TypeError('must be an array'));
  }

  var len = iterable.length;
  var called = false;
  if (!len) {
    return this.resolve([]);
  }

  var i = -1;
  var promise = new this(INTERNAL);

  while (++i < len) {
    resolver(iterable[i]);
  }
  return promise;
  function resolver(value) {
    self.resolve(value).then(function (response) {
      if (!called) {
        called = true;
        handlers.resolve(promise, response);
      }
    }, function (error) {
      if (!called) {
        called = true;
        handlers.reject(promise, error);
      }
    });
  }
}

},{"immediate":2}],5:[function(require,module,exports){
"use strict";

// Extends method
// (taken from http://code.jquery.com/jquery-1.9.0.js)
// Populate the class2type map
var class2type = {};

var types = [
  "Boolean", "Number", "String", "Function", "Array",
  "Date", "RegExp", "Object", "Error"
];
for (var i = 0; i < types.length; i++) {
  var typename = types[i];
  class2type["[object " + typename + "]"] = typename.toLowerCase();
}

var core_toString = class2type.toString;
var core_hasOwn = class2type.hasOwnProperty;

function type(obj) {
  if (obj === null) {
    return String(obj);
  }
  return typeof obj === "object" || typeof obj === "function" ?
    class2type[core_toString.call(obj)] || "object" :
    typeof obj;
}

function isWindow(obj) {
  return obj !== null && obj === obj.window;
}

function isPlainObject(obj) {
  // Must be an Object.
  // Because of IE, we also have to check the presence of
  // the constructor property.
  // Make sure that DOM nodes and window objects don't pass through, as well
  if (!obj || type(obj) !== "object" || obj.nodeType || isWindow(obj)) {
    return false;
  }

  try {
    // Not own constructor property must be Object
    if (obj.constructor &&
      !core_hasOwn.call(obj, "constructor") &&
      !core_hasOwn.call(obj.constructor.prototype, "isPrototypeOf")) {
      return false;
    }
  } catch ( e ) {
    // IE8,9 Will throw exceptions on certain host objects #9897
    return false;
  }

  // Own properties are enumerated firstly, so to speed up,
  // if last one is own, then all properties are own.
  var key;
  for (key in obj) {}

  return key === undefined || core_hasOwn.call(obj, key);
}


function isFunction(obj) {
  return type(obj) === "function";
}

var isArray = Array.isArray || function (obj) {
  return type(obj) === "array";
};

function extend() {
  // originally extend() was recursive, but this ended up giving us
  // "call stack exceeded", so it's been unrolled to use a literal stack
  // (see https://github.com/pouchdb/pouchdb/issues/2543)
  var stack = [];
  var i = -1;
  var len = arguments.length;
  var args = new Array(len);
  while (++i < len) {
    args[i] = arguments[i];
  }
  var container = {};
  stack.push({args: args, result: {container: container, key: 'key'}});
  var next;
  while ((next = stack.pop())) {
    extendInner(stack, next.args, next.result);
  }
  return container.key;
}

function extendInner(stack, args, result) {
  var options, name, src, copy, copyIsArray, clone,
    target = args[0] || {},
    i = 1,
    length = args.length,
    deep = false,
    numericStringRegex = /\d+/,
    optionsIsArray;

  // Handle a deep copy situation
  if (typeof target === "boolean") {
    deep = target;
    target = args[1] || {};
    // skip the boolean and the target
    i = 2;
  }

  // Handle case when target is a string or something (possible in deep copy)
  if (typeof target !== "object" && !isFunction(target)) {
    target = {};
  }

  // extend jQuery itself if only one argument is passed
  if (length === i) {
    /* jshint validthis: true */
    target = this;
    --i;
  }

  for (; i < length; i++) {
    // Only deal with non-null/undefined values
    if ((options = args[i]) != null) {
      optionsIsArray = isArray(options);
      // Extend the base object
      for (name in options) {
        //if (options.hasOwnProperty(name)) {
        if (!(name in Object.prototype)) {
          if (optionsIsArray && !numericStringRegex.test(name)) {
            continue;
          }

          src = target[name];
          copy = options[name];

          // Prevent never-ending loop
          if (target === copy) {
            continue;
          }

          // Recurse if we're merging plain objects or arrays
          if (deep && copy && (isPlainObject(copy) ||
              (copyIsArray = isArray(copy)))) {
            if (copyIsArray) {
              copyIsArray = false;
              clone = src && isArray(src) ? src : [];

            } else {
              clone = src && isPlainObject(src) ? src : {};
            }

            // Never move original objects, clone them
            stack.push({
              args: [deep, clone, copy],
              result: {
                container: target,
                key: name
              }
            });

          // Don't bring in undefined values
          } else if (copy !== undefined) {
            if (!(isArray(options) && isFunction(copy))) {
              target[name] = copy;
            }
          }
        }
      }
    }
  }

  // "Return" the modified object by setting the key
  // on the given container
  result.container[result.key] = target;
}


module.exports = extend;



},{}],6:[function(require,module,exports){
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var lie = _interopDefault(require('lie'));

/* istanbul ignore next */
var PouchPromise = typeof Promise === 'function' ? Promise : lie;

module.exports = PouchPromise;
},{"lie":4}],7:[function(require,module,exports){
/*
    Copyright 2014-2015, Marten de Vries

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

"use strict";

var nodify = require("promise-nodify");

exports.installStaticWrapperMethods = function (PouchDB, handlers) {
  //set an 'alternative constructor' so the constructor can be easily
  //wrapped, since wrapping 'real' constructors is hard.
  PouchDB.new = PouchDB.new || function (name, options, callback) {
    return new PouchDB(name, options, callback);
  };
  PouchDB.destroy = PouchDB.destroy || function (name, options, callback) {
    var args = parseBaseArgs(PouchDB, this, options, callback);
    var db = new PouchDB(name, args.options);
    var promise = db.destroy();
    nodify(promise, args.callback);
    return promise;
  };

  installWrappers(PouchDB, handlers, exports.createStaticWrapperMethod);
};

exports.installWrapperMethods = function (db, handlers) {
  installWrappers(db, handlers, exports.createWrapperMethod);
};

function installWrappers(base, handlers, createWrapperMethod) {
  for (var name in handlers) {
    if (!handlers.hasOwnProperty(name)) {
      continue;
    }
    var info = getBaseAndName(base, name);
    var original = info.base[info.name];
    if (!original) {
      //no method to wrap
      continue;
    }
    if (original.hasOwnProperty("_handlers")) {
      if (original._handlers.indexOf(handlers[name]) !== -1) {
        throw new Error("Wrapper method for '" + name + "' already installed: " + handlers[name]);
      }
      original._handlers.push(handlers[name]);
    } else {
      info.base[info.name] = createWrapperMethod(name, original, handlers[name], base);
    }
  }
}

function getBaseAndName(base, name) {
  name = name.split(".");
  while (name.length > 1) {
    base = base[name.shift(0)];
  }
  return {
    base: base,
    name: name[0]
  };
}

exports.createStaticWrapperMethod = function (name, original, handler, PouchDB) {
  //PouchDB is optional
  return createWrapper(name, original, handler, staticWrapperBuilders, PouchDB);
};

exports.createWrapperMethod = function (name, original, handler, db) {
  //db is optional
  return createWrapper(name, original, handler, wrapperBuilders, db);
};

function createWrapper(name, original, handler, theWrapperBuilders, thisVal) {
  //thisVal is optional
  var buildWrapper = theWrapperBuilders[name];
  if (typeof createWrapper === "undefined") {
    throw new Error("No known wrapper for method name: " + name); //coverage: ignore
  }
  var handlers = [handler];
  var wrapper = buildWrapper(thisVal, original, handlers);
  wrapper._original = original;
  wrapper._handlers = handlers;
  return wrapper;
}

var wrapperBuilders = {};

wrapperBuilders.destroy = function (db, destroy, handlers) {
  return function (options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    return callHandlers(handlers, args, makeCall(destroy));
  };
};

wrapperBuilders.put = function (db, put, handlers) {
  return function (doc, docId, docRev, options, callback) {
    var args = {};
    args.base = db || this;
    args.db = db || this; //backwards compatibility
    var argsList = Array.prototype.slice.call(arguments);
    //parsing code borrowed from PouchDB (adapted).
    args.doc = argsList.shift();
    var id = '_id' in args.doc;
    while (true) {
      var temp = argsList.shift();
      var temptype = typeof temp;
      if (temptype === "string" && !id) {
        args.doc._id = temp;
        id = true;
      } else if (temptype === "string" && id && !('_rev' in args.doc)) {
        args.doc._rev = temp;
      } else if (temptype === "object") {
        args.options = temp;
      } else if (temptype === "function") {
        args.callback = temp;
      }
      if (!argsList.length) {
        break;
      }
    }
    args.options = args.options || {};
    return callHandlers(handlers, args, function () {
      return put.call(this, args.doc, args.options);
    });
  };
};

wrapperBuilders.post = function (db, post, handlers) {
  return function (doc, options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    args.doc = doc;
    return callHandlers(handlers, args, function () {
      return post.call(this, args.doc, args.options);
    });
  };
};

wrapperBuilders.get = function (db, get, handlers) {
  return function(docId, options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    args.docId = docId;
    return callHandlers(handlers, args, function () {
      return get.call(this, args.docId, args.options);
    });
  };
};

wrapperBuilders.remove = function (db, remove, handlers) {
  return function (docOrId, optsOrRev, opts, callback) {
    var args;

    //originally borrowed from PouchDB
    if (typeof optsOrRev === 'string') {
      // id, rev, opts, callback style
      args = parseBaseArgs(db, this, opts, callback);
      args.doc = {
        _id: docOrId,
        _rev: optsOrRev
      };
    } else {
      // doc, opts, callback style
      args = parseBaseArgs(db, this, optsOrRev, opts);
      args.doc = docOrId;
    }

    return callHandlers(handlers, args, function () {
      return remove.call(this, args.doc, args.options);
    });
  };
};

wrapperBuilders.bulkDocs = function (db, bulkDocs, handlers) {
  return function (docs, options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    //support the deprecated signature.
    if ('new_edits' in docs) {
      args.options.new_edits = docs.new_edits;
    }
    args.docs = docs.docs || docs;
    return callHandlers(handlers, args, function () {
      return bulkDocs.call(this, args.docs, args.options);
    });
  };
};

wrapperBuilders.allDocs = function (db, allDocs, handlers) {
  return function (options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    return callHandlers(handlers, args, makeCallWithOptions(allDocs, args));
  };
};

wrapperBuilders.changes = function (db, changes, handlers) {
  return function (options, callback) {
    //the callback argument is no longer documented. (And deprecated?)
    var args = parseBaseArgs(db, this, options, callback);
    return callHandlers(handlers, args, makeCallWithOptions(changes, args));
  };
};

wrapperBuilders.sync = function (db, replicate, handlers) {
  return function (url, options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    args.url = url;
    return callHandlers(handlers, args, function () {
      return replicate.call(this, args.url, args.options);
    });
  };
};

wrapperBuilders["replicate.from"] = wrapperBuilders.sync;
wrapperBuilders["replicate.to"] = wrapperBuilders.sync;

wrapperBuilders.putAttachment = function (db, putAttachment, handlers) {
  return function (docId, attachmentId, rev, doc, type, options, callback) {
    //options is not an 'official' argument. But some plug-ins need it
    //and maybe (?) also the http adapter.

    //valid calls:
    //- "id", "aid", "rev", new Blob(), "text/plain", {}, function () {}
    //- "id", "aid", new Blob(), "text/plain", {}, function () {}
    //- "id", "aid", new Blob(), "text/plain"
    var args;
    if (typeof type === "string") {
      //rev is specified
      args = parseBaseArgs(db, this, options, callback);
      args.rev = rev;
      args.doc = doc;
      args.type = type;
    } else {
      //rev is unspecified
      args = parseBaseArgs(db, this, type, options);
      args.rev = null;
      args.doc = rev;
      args.type = doc;
    }
    //fixed arguments
    args.docId = docId;
    args.attachmentId = attachmentId;

    return callHandlers(handlers, args, function () {
      return putAttachment.call(this, args.docId, args.attachmentId, args.rev, args.doc, args.type);
    });
  };
};

wrapperBuilders.getAttachment = function (db, getAttachment, handlers) {
  return function (docId, attachmentId, options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    args.docId = docId;
    args.attachmentId = attachmentId;
    return callHandlers(handlers, args, function () {
      return getAttachment.call(this, args.docId, args.attachmentId, args.options);
    });
  };
};

wrapperBuilders.removeAttachment = function (db, removeAttachment, handlers) {
  return function (docId, attachmentId, rev, options, callback) {
    //see note on the options argument at putAttachment.
    var args = parseBaseArgs(db, this, options, callback);
    args.docId = docId;
    args.attachmentId = attachmentId;
    args.rev = rev;
    return callHandlers(handlers, args, function () {
      return removeAttachment.call(this, args.docId, args.attachmentId, args.rev);
    });
  };
};

wrapperBuilders.query = function (db, query, handlers) {
  return function (fun, options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    args.fun = fun;
    return callHandlers(handlers, args, function () {
      return query.call(this, args.fun, args.options);
    });
  };
};

wrapperBuilders.viewCleanup = function (db, viewCleanup, handlers) {
  return function (options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    return callHandlers(handlers, args, makeCallWithOptions(viewCleanup, args));
  };
};

wrapperBuilders.info = function (db, info, handlers) {
  return function (options, callback) {
    //see note on the options argument at putAttachment.
    var args = parseBaseArgs(db, this, options, callback);
    return callHandlers(handlers, args, makeCall(info));
  };
};

wrapperBuilders.compact = function (db, compact, handlers) {
  return function (options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    return callHandlers(handlers, args, makeCallWithOptions(compact, args));
  };
};

wrapperBuilders.revsDiff = function (db, revsDiff, handlers) {
  return function (diff, options, callback) {
    //see note on the options argument at putAttachment.
    var args = parseBaseArgs(db, this, options, callback);
    args.diff = diff;
    return callHandlers(handlers, args, function () {
      return revsDiff.call(this, args.diff);
    });
  };
};

//Plug-in wrapperBuilders; only of the plug-ins for which a wrapper
//has been necessary.

wrapperBuilders.list = function (db, orig, handlers) {
  return function (path, options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    args.path = path;

    return callHandlers(handlers, args, function () {
      return orig.call(this, args.path, args.options);
    });
  };
};

wrapperBuilders.rewriteResultRequestObject = wrapperBuilders.list;
wrapperBuilders.show = wrapperBuilders.list;
wrapperBuilders.update = wrapperBuilders.list;

wrapperBuilders.getSecurity = function (db, getSecurity, handlers) {
  return function (options, callback) {
    var args = parseBaseArgs(db, this, options, callback);
    return callHandlers(handlers, args, makeCallWithOptions(getSecurity, args));
  };
};

wrapperBuilders.putSecurity = function (db, putSecurity, handlers) {
  return function (secObj, options, callback) {
    //see note on the options argument at putAttachment.
    var args = parseBaseArgs(db, this, options, callback);
    args.secObj = secObj;
    return callHandlers(handlers, args, function () {
      return putSecurity.call(this, args.secObj);
    });
  };
};

//static
var staticWrapperBuilders = {};

staticWrapperBuilders.new = function (PouchDB, construct, handlers) {
  return function (name, options, callback) {
    var args;
    if (typeof name === "object") {
      args = parseBaseArgs(PouchDB, this, name, options);
    } else {
      args = parseBaseArgs(PouchDB, this, options, callback);
      args.options.name = name;
    }
    return callHandlers(handlers, args, function () {
      return construct.call(this, args.options);
    });
  };
};

staticWrapperBuilders.destroy = function (PouchDB, destroy, handlers) {
  return function (name, options, callback) {
    var args;
    if (typeof name === "object") {
      args = parseBaseArgs(PouchDB, this, name, options);
    } else {
      args = parseBaseArgs(PouchDB, this, options, callback);
      args.options.name = name;
    }
    if (args.options.internal) {
      return destroy.apply(PouchDB, arguments);
    }
    return callHandlers(handlers, args, function () {
      var name = args.options.name;
      delete args.options.name;

      return destroy.call(this, name, args.options);
    });
  };
};

staticWrapperBuilders.replicate = function (PouchDB, replicate, handlers) {
  return function (source, target, options, callback) {
    //no callback
    var args = parseBaseArgs(PouchDB, this, options, callback);
    args.source = source;
    args.target = target;
    return callHandlers(handlers, args, function () {
      return replicate.call(this, args.source, args.target, args.options);
    });
  };
};

staticWrapperBuilders.allDbs = function (PouchDB, allDbs, handlers) {
  return function (options, callback) {
    var args = parseBaseArgs(PouchDB, this, options, callback);
    return callHandlers(handlers, args, makeCall(allDbs));
  };
};

//Wrap .plugin()? .on()? .defaults()? No use case yet, but it's
//possible...

function parseBaseArgs(thisVal1, thisVal2, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  return {
    base: thisVal1 || thisVal2,
    db: thisVal1 || thisVal2, //backwards compatibility
    options: options || {},
    callback: callback
  };
}

function callHandlers(handlers, args, method) {
  var callback = args.callback;
  delete args.callback;

  //build a chain of handlers: the bottom handler calls the 'real'
  //method, the other handlers call other handlers.
  method = method.bind(args.base);
  for (var i = handlers.length - 1; i >= 0; i -= 1) {
    method = handlers[i].bind(null, method, args);
  }
  //start running the chain.
  var promise = method();
  nodify(promise, callback);
  return promise;
}

function makeCall(func) {
  return function () {
    return func.call(this);
  };
}

function makeCallWithOptions(func, args) {
  return function () {
    return func.call(this, args.options);
  };
}

exports.uninstallWrapperMethods = function (db, handlers) {
  uninstallWrappers(db, handlers);
};

exports.uninstallStaticWrapperMethods = function (PouchDB, handlers) {
  uninstallWrappers(PouchDB, handlers);
};

function uninstallWrappers(base, handlers) {
  for (var name in handlers) {
    if (!handlers.hasOwnProperty(name)) {
      continue;
    }
    var info = getBaseAndName(base, name);
    var wrapper = info.base[info.name];
    if (typeof wrapper === "undefined") {
      //method doesn't exist, so was never wrapped in the first place.
      continue;
    }

    var idx;
    try {
      idx = wrapper._handlers.indexOf(handlers[name]);
    } catch (err) {
      idx = -1;
    }
    if (idx === -1) {
      throw new Error("Wrapper method for '" + name + "' not installed: " + handlers[name]);
    }
    wrapper._handlers.splice(idx, 1);
    if (!wrapper._handlers.length) {
      //fall back to the original on the prototype.
      delete info.base[info.name];
      if (info.base[info.name] !== wrapper._original) {
        //nothing or something unexpected was on the prototype. (E.g.
        //replicate.to). Reset the original manually.
        info.base[info.name] = wrapper._original;
      }
    }
  }
}

},{"promise-nodify":9}],8:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

(function () {
  try {
    cachedSetTimeout = setTimeout;
  } catch (e) {
    cachedSetTimeout = function () {
      throw new Error('setTimeout is not defined');
    }
  }
  try {
    cachedClearTimeout = clearTimeout;
  } catch (e) {
    cachedClearTimeout = function () {
      throw new Error('clearTimeout is not defined');
    }
  }
} ())
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = cachedSetTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    cachedClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        cachedSetTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],9:[function(require,module,exports){
/*
  Copyright 2013-2014, Marten de Vries

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

"use strict";

module.exports = function nodify(promise, callback) {
  if (typeof callback === "function") {
    promise.then(function (resp) {
      callback(null, resp);
    }, function (err) {
      callback(err, null);
    });
  }
};

},{}],10:[function(require,module,exports){
(function (process){
'use strict';

var Promise = require('pouchdb-promise');
/* istanbul ignore next */
exports.once = function (fun) {
  var called = false;
  return exports.getArguments(function (args) {
    if (called) {
      console.trace();
      throw new Error('once called  more than once');
    } else {
      called = true;
      fun.apply(this, args);
    }
  });
};
/* istanbul ignore next */
exports.getArguments = function (fun) {
  return function () {
    var len = arguments.length;
    var args = new Array(len);
    var i = -1;
    while (++i < len) {
      args[i] = arguments[i];
    }
    return fun.call(this, args);
  };
};
/* istanbul ignore next */
exports.toPromise = function (func) {
  //create the function we will be returning
  return exports.getArguments(function (args) {
    var self = this;
    var tempCB = (typeof args[args.length - 1] === 'function') ? args.pop() : false;
    // if the last argument is a function, assume its a callback
    var usedCB;
    if (tempCB) {
      // if it was a callback, create a new callback which calls it,
      // but do so async so we don't trap any errors
      usedCB = function (err, resp) {
        process.nextTick(function () {
          tempCB(err, resp);
        });
      };
    }
    var promise = new Promise(function (fulfill, reject) {
      try {
        var callback = exports.once(function (err, mesg) {
          if (err) {
            reject(err);
          } else {
            fulfill(mesg);
          }
        });
        // create a callback for this invocation
        // apply the function in the orig context
        args.push(callback);
        func.apply(self, args);
      } catch (e) {
        reject(e);
      }
    });
    // if there is a callback, call it back
    if (usedCB) {
      promise.then(function (result) {
        usedCB(null, result);
      }, usedCB);
    }
    promise.cancel = function () {
      return this;
    };
    return promise;
  });
};

exports.inherits = require('inherits');
exports.Promise = Promise;
exports.extend = require('pouchdb-extend');
exports.clone = function (obj) {
  return exports.extend(true, {}, obj);
};

exports.isLocalId = function (id) {
  return (/^_local/).test(id);
};

}).call(this,require('_process'))
},{"_process":8,"inherits":3,"pouchdb-extend":5,"pouchdb-promise":6}]},{},[1]);
