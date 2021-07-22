'use strict'

const wrappers = require('pouchdb-wrappers')

// determine if a document key is an internal field like _rev
function isntInternalKey (key) {
  return key[0] !== '_'
}

// determine if a document should be transformed
function isUntransformable (doc) {
  // do not transform local documents
  if (typeof doc._id === 'string' && (/^_local/).test(doc._id)) {
    return true
  }
  // do not transform document tombstones
  if (doc._deleted) {
    return Object.keys(doc).filter(isntInternalKey).length === 0
  }

  return false
}

module.exports = {
  transform,
  // api.filter provided for backwards compat with the old "filter-pouch"
  filter: transform
}

function transform (config) {
  const db = this

  const incoming = function (doc) {
    if (!isUntransformable(doc) && config.incoming) {
      return config.incoming(doc)
    }
    return doc
  }
  const outgoing = function (doc) {
    if (!isUntransformable(doc) && config.outgoing) {
      return config.outgoing(doc)
    }
    return doc
  }

  const handlers = {}

  if (db.type() === 'http') {
    // Basically puts get routed through ._bulkDocs unless the adapter has a ._put method defined,
    // which the adapter does.
    // So wrapping .put when pouchdb is using the http adapter will fix the remote replication.
    handlers.put = async function (orig, args) {
      args.doc = await incoming(args.doc)
      return orig()
    }
    handlers.query = async function (orig) {
      const response = await orig()

      await Promise.all(response.rows.map(async function (row) {
        if (row.doc) {
          row.doc = await outgoing(row.doc)
        }
      }))
      return response
    }
  }

  handlers.get = async function (orig) {
    const response = await orig()

    if (!Array.isArray(response)) {
      return outgoing(response)
    }

    // open_revs style, it's a list of docs
    await Promise.all(response.map(async function (row) {
      if (row.ok) {
        row.ok = await outgoing(row.ok)
      }
    }))
    return response
  }

  handlers.bulkDocs = async function (orig, args) {
    args.docs = await Promise.all(args.docs.map(function (doc) {
      return incoming(doc)
    }))
    return orig()
  }

  handlers.allDocs = async function (orig) {
    const response = await orig()

    await Promise.all(response.rows.map(async function (row) {
      if (row.doc) {
        row.doc = await outgoing(row.doc)
      }
    }))
    return response
  }

  handlers.bulkGet = async function (orig) {
    const res = await orig()
    const none = {}
    const results = await Promise.all(res.results.map(async (result) => {
      if (result.id && result.docs && Array.isArray(result.docs)) {
        return {
          docs: await Promise.all(result.docs.map(async (doc) => {
            if (doc.ok) {
              return { ok: await outgoing(doc.ok) }
            } else {
              return doc
            }
          })),
          id: result.id
        }
      } else {
        return none
      }
    }))
    return { results: results }
  }
  handlers.changes = function (orig) {
    async function modifyChange (change) {
      if (change.doc) {
        change.doc = await outgoing(change.doc)
        return change
      }
      return change
    }

    async function modifyChanges (res) {
      if (res.results) {
        res.results = await Promise.all(res.results.map(modifyChange))
        return res
      }
      return res
    }

    const changes = orig()
    const { on: origOn, then: origThen } = changes

    changes.on = function (event, listener) {
      const origListener = listener
      if (event === 'change') {
        listener = async function (change) {
          origListener(await modifyChange(change))
        }
      } else if (event === 'complete') {
        listener = async function (res) {
          origListener(await modifyChanges(res))
        }
      }
      return origOn.call(changes, event, listener)
    }

    changes.then = function (resolve, reject) {
      return origThen.call(changes, modifyChanges).then(resolve, reject)
    }

    return changes
  }
  wrappers.installWrapperMethods(db, handlers)
}

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports)
}
