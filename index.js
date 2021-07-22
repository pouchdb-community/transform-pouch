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

  const handlers = {
    async get (orig) {
      const response = await orig()

      if (!Array.isArray(response)) {
        return outgoing(response)
      }

      // open_revs style, it's a list of docs
      await Promise.all(response.map(async (row) => {
        if (row.ok) {
          row.ok = await outgoing(row.ok)
        }
      }))
      return response
    },

    async bulkDocs (orig, args) {
      args.docs = await Promise.all(args.docs.map((doc) => {
        return incoming(doc)
      }))
      return orig()
    },

    async allDocs (orig) {
      const response = await orig()

      await Promise.all(response.rows.map(async (row) => {
        if (row.doc) {
          row.doc = await outgoing(row.doc)
        }
      }))
      return response
    },

    async bulkGet (orig) {
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
    },

    changes (orig) {
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

      return Object.assign(changes, {
        on (event, listener) {
          const origListener = listener
          if (event === 'change') {
            listener = async (change) => {
              origListener(await modifyChange(change))
            }
          } else if (event === 'complete') {
            listener = async (res) => {
              origListener(await modifyChanges(res))
            }
          }
          return origOn.call(changes, event, listener)
        },

        then (resolve, reject) {
          return origThen.call(changes, modifyChanges).then(resolve, reject)
        }
      })
    }
  }

  if (db.type() === 'http') {
    Object.assign(handlers, {
      // Basically puts get routed through ._bulkDocs unless the adapter has a ._put method defined,
      // which the adapter does.
      // So wrapping .put when pouchdb is using the http adapter will fix the remote replication.
      async put (orig, args) {
        args.doc = await incoming(args.doc)
        return orig()
      },

      async query (orig) {
        const response = await orig()

        await Promise.all(response.rows.map(async (row) => {
          if (row.doc) {
            row.doc = await outgoing(row.doc)
          }
        }))
        return response
      }
    })
  }

  wrappers.installWrapperMethods(db, handlers)
}

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports)
}
