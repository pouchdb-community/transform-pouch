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

  // create incoming handler, which transforms documents before write
  const incoming = function (doc) {
    if (!isUntransformable(doc) && config.incoming) {
      return config.incoming(doc)
    }
    return doc
  }

  // create outgoing handler, which transforms documents after read
  const outgoing = function (doc) {
    if (!isUntransformable(doc) && config.outgoing) {
      return config.outgoing(doc)
    }
    return doc
  }

  const handlers = {
    async get (orig, ...args) {
      const response = await orig(...args)

      if (Array.isArray(response)) {
        // open_revs style, it's a list of docs
        await Promise.all(response.map(async (row) => {
          if (row.ok) {
            row.ok = await outgoing(row.ok)
          }
        }))
        return response
      } else {
        // response is just one doc
        return outgoing(response)
      }
    },

    async bulkDocs (orig, docs, ...args) {
      if (docs.docs) {
        // docs can be an object and not just a list
        docs.docs = await Promise.all(docs.docs.map(incoming))
      } else {
        // docs is just a list
        docs = await Promise.all(docs.map(incoming))
      }
      return orig(docs, ...args)
    },

    async allDocs (orig, ...args) {
      const response = await orig(...args)

      await Promise.all(response.rows.map(async (row) => {
        // run docs through outgoing handler if include_docs was true
        if (row.doc) {
          row.doc = await outgoing(row.doc)
        }
      }))
      return response
    },

    async bulkGet (orig, ...args) {
      const mapDoc = async (doc) => {
        // only run the outgoing handler if the doc exists ("ok")
        // istanbul ignore else
        if (doc.ok) {
          return { ok: await outgoing(doc.ok) }
        } else {
          return doc
        }
      }
      const mapResult = async (result) => {
        const { id, docs } = result
        // istanbul ignore else
        if (id && docs && Array.isArray(docs)) {
          // only modify docs if everything looks ok
          return { id, docs: await Promise.all(docs.map(mapDoc)) }
        } else {
          // result wasn't ok so we return it unmodified
          return result
        }
      }
      let { results, ...res } = await orig(...args)
      results = await Promise.all(results.map(mapResult))
      return { results, ...res }
    },

    changes (orig, ...args) {
      async function modifyChange (change) {
        // transform a change only if it includes a doc
        if (change.doc) {
          change.doc = await outgoing(change.doc)
          return change
        }
        return change
      }

      async function modifyChanges (res) {
        // transform the response only if it contains results
        if (res.results) {
          res.results = await Promise.all(res.results.map(modifyChange))
          return res
        }
        return res
      }

      const changes = orig(...args)
      const { on: origOn, then: origThen } = changes

      return Object.assign(changes, {
        // wrap all listeners, but specifically those for 'change' and 'complete'
        on (event, listener) {
          const origListener = listener
          if (event === 'change') {
            listener = async (change) => {
              origListener(await modifyChange(change))
            }
          } else if (event === 'complete') {
            // the 'complete' event returns all relevant changes,
            // so we submit them all for transformation
            listener = async (res) => {
              origListener(await modifyChanges(res))
            }
          }
          return origOn.call(changes, event, listener)
        },

        // `.changes` can be awaited. it then returns all relevant changes
        // which we pass to our handler for possible transformation
        then (resolve, reject) {
          return origThen.call(changes, modifyChanges).then(resolve, reject)
        }
      })
    }
  }

  if (db.type() === 'http') {
    // when using its http adapter, pouchdb uses the adapter's `._put` method,
    // rather than `._bulkDocs`,
    // so we have to wrap `.put` in addition to `.bulkDocs`.
    handlers.put = async function (orig, doc, ...args) {
      doc = await incoming(doc)
      return orig(doc, ...args)
    }
    // when using its http adapter, pouchdb cannot intercept query results with `.get`
    // so we must wrap the `.query` method directly to transform query results.
    handlers.query = async function (orig, ...args) {
      const response = await orig(...args)
      await Promise.all(response.rows.map(async (row) => {
        // modify result rows if they contain a doc
        if (row.doc) {
          row.doc = await outgoing(row.doc)
        }
        // because js passes objects by reference,
        // there is no need to return anything after updating the row object.
      }))
      return response
    }
  }

  wrappers.install(db, handlers)
}

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.plugin(exports)
}
