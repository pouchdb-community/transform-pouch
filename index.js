'use strict'

const utils = require('./pouch-utils')
const wrappers = require('pouchdb-wrappers')

function isntInternalKey (key) {
  return key[0] !== '_'
}

function isUntransformable (doc) {
  const isLocal = typeof doc._id === 'string' && utils.isLocalId(doc._id)

  if (isLocal) {
    return true
  }

  if (doc._deleted) {
    return Object.keys(doc).filter(isntInternalKey).length === 0
  }

  return false
}

// api.filter provided for backwards compat with the old "filter-pouch"
exports.transform = exports.filter = function transform (config) {
  const db = this

  const incoming = function (doc) {
    if (!isUntransformable(doc) && config.incoming) {
      return config.incoming(utils.clone(doc))
    }
    return doc
  }
  const outgoing = function (doc) {
    if (!isUntransformable(doc) && config.outgoing) {
      return config.outgoing(utils.clone(doc))
    }
    return doc
  }

  const handlers = {}

  if (db.type() === 'http') {
    // Basically puts get routed through ._bulkDocs unless the adapter has a ._put method defined,
    // which the adapter does.
    // So wrapping .put when pouchdb is using the http adapter will fix the remote replication.
    handlers.put = function (orig, args) {
      try {
        args.doc = incoming(args.doc)
        return Promise.resolve(args.doc).then(function (doc) {
          args.doc = doc
          return orig()
        })
      } catch (error) {
        return Promise.reject(error)
      }
    }
    handlers.query = function (orig) {
      const none = {}
      return orig().then(function (res) {
        return Promise.all(res.rows.map(function (row) {
          if (row.doc) {
            return outgoing(row.doc)
          }
          return none
        })).then(function (resp) {
          resp.forEach(function (doc, i) {
            if (doc === none) {
              return
            }
            res.rows[i].doc = doc
          })
          return res
        })
      })
    }
  }

  handlers.get = function (orig) {
    return orig().then(function (res) {
      if (Array.isArray(res)) {
        const none = {}
        // open_revs style, it's a list of docs
        return Promise.all(res.map(function (row) {
          if (row.ok) {
            return outgoing(row.ok)
          }
          return none
        })).then(function (resp) {
          resp.forEach(function (doc, i) {
            if (doc === none) {
              return
            }
            res[i].ok = doc
          })
          return res
        })
      } else {
        return outgoing(res)
      }
    })
  }

  handlers.bulkDocs = function (orig, args) {
    for (let i = 0; i < args.docs.length; i++) {
      args.docs[i] = incoming(args.docs[i])
    }
    return Promise.all(args.docs).then(function (docs) {
      args.docs = docs
      return orig()
    })
  }

  handlers.allDocs = function (orig) {
    return orig().then(function (res) {
      const none = {}
      return Promise.all(res.rows.map(function (row) {
        if (row.doc) {
          return outgoing(row.doc)
        }
        return none
      })).then(function (resp) {
        resp.forEach(function (doc, i) {
          if (doc === none) {
            return
          }
          res.rows[i].doc = doc
        })
        return res
      })
    })
  }

  handlers.bulkGet = function (orig) {
    return orig().then(function (res) {
      const none = {}
      return Promise.all(res.results.map(function (result) {
        if (result.id && result.docs && Array.isArray(result.docs)) {
          return {
            docs: result.docs.map(function (doc) {
              if (doc.ok) {
                return { ok: outgoing(doc.ok) }
              } else {
                return doc
              }
            }),
            id: result.id
          }
        } else {
          return none
        }
      })).then(function (results) {
        return { results: results }
      })
    })
  }
  handlers.changes = function (orig) {
    function modifyChange (change) {
      if (change.doc) {
        return Promise.resolve(outgoing(change.doc)).then(function (doc) {
          change.doc = doc
          return change
        })
      }
      return Promise.resolve(change)
    }

    function modifyChanges (res) {
      if (res.results) {
        return Promise.all(res.results.map(modifyChange)).then(function (results) {
          res.results = results
          return res
        })
      }
      return Promise.resolve(res)
    }

    const changes = orig()
    // override some events
    const origOn = changes.on
    changes.on = function (event, listener) {
      if (event === 'change') {
        return origOn.apply(changes, [event, function (change) {
          modifyChange(change).then(function (resp) {
            process.nextTick(function () {
              listener(resp)
            })
          })
        }])
      } else if (event === 'complete') {
        return origOn.apply(changes, [event, function (res) {
          modifyChanges(res).then(function (resp) {
            process.nextTick(function () {
              listener(resp)
            })
          })
        }])
      }
      return origOn.apply(changes, [event, listener])
    }

    const origThen = changes.then
    changes.then = function (resolve, reject) {
      return origThen.apply(changes, [function (res) {
        return modifyChanges(res).then(resolve, reject)
      }, reject])
    }
    return changes
  }
  wrappers.installWrapperMethods(db, handlers)
}

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports)
}
