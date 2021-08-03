/* global describe, it, beforeEach, afterEach, emit, atob, btoa */
'use strict'

const assert = require('assert').strict
const PouchDB = require('pouchdb')
PouchDB.plugin(require('.'))

const COUCH_URL = process.env.COUCH_URL || 'http://localhost:5984'
const DB_NAME = 'testdb'
const LOCAL_DB = DB_NAME
const REMOTE_DB = COUCH_URL + '/' + DB_NAME
let TEST_DBS

// allow specifying a specific adapter (local or http) to use
if (process.env.TEST_DB === 'local') {
  TEST_DBS = [LOCAL_DB]
} else if (process.env.TEST_DB === 'http') {
  TEST_DBS = [REMOTE_DB]
} else {
  TEST_DBS = [LOCAL_DB, REMOTE_DB]
}

// run tests for local and http adapters
TEST_DBS.forEach(function (db) {
  const dbType = /^http/.test(db) ? 'http' : 'local'
  tests(db, dbType)
})

function tests (dbName, dbType) {
  describe(dbType + ': basic tests', function () {
    this.timeout(30000)

    let db

    beforeEach(function () {
      db = new PouchDB(dbName)
    })
    afterEach(function () {
      return db.destroy()
    })

    it('transforms on PUT', async function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })

      await db.put({ _id: 'foo' })
      const doc = await db.get('foo')

      assert.equal(doc._id, 'foo')
      assert.equal(doc.foo, 'baz')
    })

    it('transforms on PUT, with a promise', async function () {
      db.transform({
        incoming: async function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })

      await db.put({ _id: 'foo' })
      const doc = await db.get('foo')

      assert.equal(doc._id, 'foo')
      assert.equal(doc.foo, 'baz')
    })

    it('transforms on POST', async function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      const res = await db.post({})
      const doc = await db.get(res.id)
      assert.equal(typeof doc._id, 'string')
      assert.equal(doc.foo, 'baz')
    })

    it('transforms on POST, with a promise', async function () {
      db.transform({
        incoming: async function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      const res = await db.post({})
      const doc = await db.get(res.id)
      assert.equal(typeof doc._id, 'string')
      assert.equal(doc.foo, 'baz')
    })

    it('transforms on GET', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      await db.put({ _id: 'foo' })
      const doc = await db.get('foo')
      assert.equal(doc._id, 'foo')
      assert.equal(doc.foo, 'baz')
    })

    it('transforms on GET, with a promise', async function () {
      db.transform({
        outgoing: async function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      await db.put({ _id: 'foo' })
      const doc = await db.get('foo')
      assert.equal(doc._id, 'foo')
      assert.equal(doc.foo, 'baz')
    })

    it('skips local docs', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      await db.put({ _id: '_local/foo' })
      const doc = await db.get('_local/foo')
      assert.equal(doc._id, '_local/foo')
      assert(!('foo' in doc))
    })

    it('skips local docs, incoming', async function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      await db.put({ _id: '_local/foo' })
      const doc = await db.get('_local/foo')
      assert.equal(doc._id, '_local/foo')
      assert(!('foo' in doc))
    })

    it('skips local docs, post', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      await db.post({ _id: '_local/foo' })
      const doc = await db.get('_local/foo')
      assert.equal(doc._id, '_local/foo')
      assert(!('foo' in doc))
    })

    it('skips local docs, bulkDocs', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      await db.bulkDocs([{ _id: '_local/foo' }])
      const doc = await db.get('_local/foo')
      assert.equal(doc._id, '_local/foo')
      assert(!('foo' in doc))
    })

    it('skips deleted docs', async function () {
      await db.put({ _id: 'foo', foo: {} })
      const doc = await db.get('foo')
      let transformCalledOnDelete = false

      db.transform({
        incoming: function (doc) {
          transformCalledOnDelete = true
          return doc
        }
      })

      await db.remove(doc)
      assert.equal(transformCalledOnDelete, false)
    })

    it('transforms deleted docs with custom properties', async function () {
      await db.put({ _id: 'foo', foo: {} })
      const doc = await db.get('foo')
      let transformCalledOnDelete = false

      db.transform({
        incoming: function (doc) {
          transformCalledOnDelete = true
          return doc
        }
      })

      doc.foo = 'baz'
      doc._deleted = true
      await db.put(doc)
      assert.equal(transformCalledOnDelete, true)
    })

    it('handles sync errors', async function () {
      db.transform({
        incoming: function (doc) {
          doc.foo.baz = 'baz'
          return doc
        }
      })

      let res, err
      try {
        res = await db.put({ _id: 'foo' })
      } catch (error) {
        err = error
      }
      assert.equal(res, undefined)
      assert.notEqual(err, undefined)
    })

    it('handles async errors', async function () {
      db.transform({
        incoming: function () {
          return Promise.reject(new Error('flunking you'))
        }
      })

      let res, err
      try {
        res = await db.put({ _id: 'foo' })
      } catch (error) {
        err = error
      }
      assert.equal(res, undefined)
      assert.notEqual(err, undefined)
    })

    it('handles cancel', function () {
      db.transform()
      const syncHandler = db.sync('my_gateway', {})
      return syncHandler.cancel()
    })

    it('transforms on GET with options', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      await db.put({ _id: 'foo' })
      const doc = await db.get('foo', {})
      assert.equal(doc._id, 'foo')
      assert.equal(doc.foo, 'baz')
    })

    it('transforms on GET with missing open_revs', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      await db.put({ _id: 'foo' })
      const docs = await db.get('foo', { revs: true, open_revs: ['1-DNE'] })
      assert.equal(docs.length, 1)
      assert.equal(docs[0].missing, '1-DNE')
    })

    it('transforms on GET with missing and non-missing open_revs', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      const res = await db.put({ _id: 'foo' })
      const rev = res.rev
      const docs = await db.get('foo', { revs: true, open_revs: ['1-DNE', rev] })
      assert.equal(docs.length, 2)
      const okRes = docs[0].ok ? docs[0] : docs[1]
      const missingRes = docs[0].ok ? docs[1] : docs[0]
      assert.equal(missingRes.missing, '1-DNE')
      assert.equal(okRes.ok._rev, rev)
    })

    it('transforms on GET, not found', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      await db.put({ _id: 'foo' })
      let doc, err
      try {
        doc = await db.get('quux')
      } catch (error) {
        err = error
      }
      assert.equal(doc, undefined)
      assert.notEqual(err, undefined)
    })

    it('transforms on bulkGet()', async function () {
      db.transform({
        outgoing: async function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })

      await db.bulkDocs([{ _id: 'toto' }, { _id: 'lala' }])
      const docs = await db.bulkGet({ docs: [{ id: 'toto' }, { id: 'lala' }] })

      assert.equal(docs.results[0].docs[0].ok.foo, 'baz')
      assert.equal(docs.results[1].docs[0].ok.foo, 'baz')
    })

    it('transforms on bulk_docs', async function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      const res = await db.bulkDocs([{ _id: 'toto' }, { _id: 'lala' }])
      const doc0 = await db.get(res[0].id)
      assert.equal(doc0.foo, 'toto_baz')
      const doc1 = await db.get(res[1].id)
      assert.equal(doc1.foo, 'lala_baz')
    })

    it('transforms on bulk_docs, new_edits=false 1', async function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      const docsA = [{
        _id: 'selenium-global',
        _rev: '5-3b6e1f9846c7aa2ae80ba871cd8bf084',
        _deleted: true,
        _revisions: {
          start: 5,
          ids: [
            '3b6e1f9846c7aa2ae80ba871cd8bf084',
            '84870906995eb23f6375900296226df6'
          ]
        }
      }]
      const docsB = [{
        _id: 'selenium-global',
        _rev: '4-84870906995eb23f6375900296226df6',
        _revisions: {
          start: 4,
          ids: [
            '84870906995eb23f6375900296226df6',
            '941073451900f1d92a9a39dde8938339'
          ]
        }
      }]
      const docsC = [
        {
          _id: 'selenium-global',
          _rev: '3-8b3a09799ad70999277f0859f0aa1add',
          _revisions: {
            start: 3,
            ids: [
              '8b3a09799ad70999277f0859f0aa1add',
              '10ade0f791a6b0dab76dde12d3ffce74'
            ]
          }
        },
        {
          _id: 'selenium-global',
          _rev: '2-61cb022c4e5f3a702a969e6ac17fea79',
          _revisions: {
            start: 2,
            ids: [
              '61cb022c4e5f3a702a969e6ac17fea79',
              '54f0c85a4a6329bd8885470aef5104d7'
            ]
          }
        },
        {
          _id: 'selenium-global',
          _rev: '12-787d8aa4043f18d8a8747708afcce370',
          _revisions: {
            start: 12,
            ids: [
              '787d8aa4043f18d8a8747708afcce370',
              '9d02f7a6634530eafdcc36df0cab54ff',
              '328c111479b9aae37cb0c6c38545059b',
              'c9902a757278d99e60dd1571113687c5',
              '7c8b0e3a8c6191317664ffafe2a6f40a',
              'e3f4590f30f77ecfafa638235a4d4e24',
              '80a589649d8c86e7408d1745edac0484',
              'f7893b80dbeef9566a99c2d879477cf7',
              '67b0eb503ba35fd34c5acab77cf9552e',
              '5b6eeae4b4edf20a2e5b87a333cb9c5c',
              '2913efa5e4a43a53dca80b66bba9b7dc',
              '1c0833f56ec15a816a8b2901b7a48176'
            ]
          }
        }
      ]

      let results = await db.bulkDocs({ docs: docsA, new_edits: false })
      results.forEach(function (result) {
        assert(!('error' in result), 'no doc update coflict')
      })

      results = await db.bulkDocs({ docs: docsB, new_edits: false })
      results.forEach(function (result) {
        assert(!('error' in result), 'no doc update coflict')
      })

      results = await db.bulkDocs({ docs: docsC, new_edits: false })
      results.forEach(function (result) {
        assert(!('error' in result), 'no doc update coflict')
      })
    })

    it('transforms on bulk_docs, new_edits=false 2', async function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      const docsA = [{
        _id: 'selenium-global',
        _rev: '5-3b6e1f9846c7aa2ae80ba871cd8bf084',
        _deleted: true,
        _revisions: {
          start: 5,
          ids: [
            '3b6e1f9846c7aa2ae80ba871cd8bf084',
            '84870906995eb23f6375900296226df6'
          ]
        }
      }]
      const docsB = [{
        _id: 'selenium-global',
        _rev: '4-84870906995eb23f6375900296226df6',
        _revisions: {
          start: 4,
          ids: [
            '84870906995eb23f6375900296226df6',
            '941073451900f1d92a9a39dde8938339'
          ]
        }
      }]
      const docsC = [
        {
          _id: 'selenium-global',
          _rev: '3-8b3a09799ad70999277f0859f0aa1add',
          _revisions: {
            start: 3,
            ids: [
              '8b3a09799ad70999277f0859f0aa1add',
              '10ade0f791a6b0dab76dde12d3ffce74'
            ]
          }
        },
        {
          _id: 'selenium-global',
          _rev: '2-61cb022c4e5f3a702a969e6ac17fea79',
          _revisions: {
            start: 2,
            ids: [
              '61cb022c4e5f3a702a969e6ac17fea79',
              '54f0c85a4a6329bd8885470aef5104d7'
            ]
          }
        },
        {
          _id: 'selenium-global',
          _rev: '12-787d8aa4043f18d8a8747708afcce370',
          _revisions: {
            start: 12,
            ids: [
              '787d8aa4043f18d8a8747708afcce370',
              '9d02f7a6634530eafdcc36df0cab54ff',
              '328c111479b9aae37cb0c6c38545059b',
              'c9902a757278d99e60dd1571113687c5',
              '7c8b0e3a8c6191317664ffafe2a6f40a',
              'e3f4590f30f77ecfafa638235a4d4e24',
              '80a589649d8c86e7408d1745edac0484',
              'f7893b80dbeef9566a99c2d879477cf7',
              '67b0eb503ba35fd34c5acab77cf9552e',
              '5b6eeae4b4edf20a2e5b87a333cb9c5c',
              '2913efa5e4a43a53dca80b66bba9b7dc',
              '1c0833f56ec15a816a8b2901b7a48176'
            ]
          }
        }
      ]

      let results = await db.bulkDocs(docsA, { new_edits: false })
      results.forEach(function (result) {
        assert(!('error' in result), 'no doc update coflict')
      })

      results = await db.bulkDocs(docsB, { new_edits: false })
      results.forEach(function (result) {
        assert(!('error' in result), 'no doc update coflict')
      })

      results = await db.bulkDocs(docsC, { new_edits: false })
      results.forEach(function (result) {
        assert(!('error' in result), 'no doc update coflict')
      })
    })

    it('transforms on bulk_docs, object style', async function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      const res = await db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }] })
      let doc = await db.get(res[0].id)
      assert.equal(doc.foo, 'toto_baz')
      doc = await db.get(res[1].id)
      assert.equal(doc.foo, 'lala_baz')
    })

    it('transforms on all_docs, incoming', async function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      await db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }] })
      const res = await db.allDocs({ include_docs: true })
      assert.equal(res.rows.length, 2)
      assert.equal(res.rows[0].doc.foo, 'lala_baz')
      assert.equal(res.rows[1].doc.foo, 'toto_baz')
    })

    it('transforms on all_docs, outgoing', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      await db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }] })
      const res = await db.allDocs({ include_docs: true })
      assert.equal(res.rows.length, 2)
      assert.equal(res.rows[0].doc.foo, 'lala_baz')
      assert.equal(res.rows[1].doc.foo, 'toto_baz')
    })

    it('transforms on all_docs no opts, outgoing', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      await db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }] })
      const res = await db.allDocs()
      assert.equal(res.rows.length, 2)
      assert(!('doc' in res.rows[0]))
      assert(!('doc' in res.rows[1]))
    })

    it('transforms on query, incoming', async function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })

      const ddoc = {
        _id: '_design/index',
        views: {
          index: {
            map: function (doc) {
              emit(doc._id)
            }.toString()
          }
        }
      }

      await db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }, ddoc] })
      const res = await db.query('index', { include_docs: true })
      assert.equal(res.rows.length, 2)
      assert.equal(res.rows[0].doc.foo, 'lala_baz')
      assert.equal(res.rows[1].doc.foo, 'toto_baz')
    })

    it('transforms on query, outgoing', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      const ddoc = {
        _id: '_design/index',
        views: {
          index: {
            map: function (doc) {
              emit(doc._id)
            }.toString()
          }
        }
      }
      await db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }, ddoc] })
      const res = await db.query('index', { include_docs: true })
      assert.equal(res.rows.length, 2)
      assert.equal(res.rows[0].doc.foo, 'lala_baz')
      assert.equal(res.rows[1].doc.foo, 'toto_baz')
    })

    it('transforms on query no opts, outgoing', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      const ddoc = {
        _id: '_design/index',
        views: {
          index: {
            map: function (doc) {
              emit(doc._id)
            }.toString()
          }
        }
      }
      await db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }, ddoc] })
      const res = await db.query('index')
      assert.equal(res.rows.length, 2)
      assert(!('doc' in res.rows[0]))
      assert(!('doc' in res.rows[1]))
    })

    it('transforms ingoing and outgoing', async function () {
      db.transform({
        ingoing: function (doc) {
          doc.foo = doc.foo.toUpperCase()
          return doc
        },
        outgoing: function (doc) {
          doc.foo = doc.foo.toLowerCase()
          return doc
        }
      })
      await db.put({ _id: 'doc', foo: 'bar' })
      const doc = await db.get('doc')
      assert.equal(doc.foo, 'bar')
    })
  })

  describe(dbType + ': advanced tests', function () {
    this.timeout(30000)

    let db

    beforeEach(function () {
      db = new PouchDB(dbName)
      return db
    })
    afterEach(function () {
      return db.destroy()
    })

    let encrypt
    let decrypt
    if (typeof process !== 'undefined' && !process.browser) {
      const crypto = require('crypto')

      encrypt = function (text) {
        // eslint-disable-next-line
        const cipher = crypto.createCipher('aes-256-cbc', 'password')
        const crypted = cipher.update(text, 'utf8', 'base64')
        return crypted + cipher.final('base64')
      }

      decrypt = function (text) {
        // eslint-disable-next-line
        const decipher = crypto.createDecipher('aes-256-cbc', 'password')
        const dec = decipher.update(text, 'base64', 'utf8')
        return dec + decipher.final('utf8')
      }
    } else { // browser
      encrypt = btoa
      decrypt = atob
    }

    function transform (db) {
      db.transform({
        incoming: function (doc) {
          // designDocs should be ignored
          // the !doc._id check is for a db.post (without an id)
          if (!doc._id || (doc._id && !doc._id.startsWith('_design'))) {
            Object.keys(doc).forEach(function (field) {
              if (field !== '_id' && field !== '_rev') {
                doc[field] = encrypt(doc[field])
              }
            })
          }
          return doc
        },
        outgoing: function (doc) {
          // designDocs should be ignored
          if (doc._id && doc._id.startsWith('_design')) {
            return doc
          }

          Object.keys(doc).forEach(function (field) {
            if (field !== '_id' && field !== '_rev') {
              doc[field] = decrypt(doc[field])
            }
          })
          return doc
        }
      })
    }

    it('test encryption/decryption with puts', async function () {
      transform(db)
      const id = 'doc'
      const secret = 'my super secret text!'
      await db.put({ _id: id, secret })
      // check that it gets decrypted
      let doc = await db.get(id)
      assert.equal(doc.secret, secret)
      // check that it's encrypted
      const db2 = new PouchDB(dbName)
      doc = await db2.get(id)
      assert.equal(doc.secret, encrypt(secret))
    })

    it('test encryption/decryption with posts', async function () {
      transform(db)
      const res = await db.post({ secret: 'my super secret text!' })
      const id = res.id
      let doc = await db.get(id)
      assert.equal(doc.secret, 'my super secret text!')
      doc = await new PouchDB(dbName).get(id)
      assert.equal(doc.secret, encrypt('my super secret text!'))
    })

    it('test encryption/decryption with bulkdocs/alldocs', async function () {
      const id = 'doc'
      const secret = 'my super secret text!'
      transform(db)
      await db.bulkDocs([{ _id: id, secret }])
      let res = await db.allDocs({ keys: [id], include_docs: true })
      assert.equal(res.rows.length, 1)
      assert.equal(res.rows[0].doc.secret, secret)
      res = await new PouchDB(dbName).allDocs({ keys: [id], include_docs: true })
      assert.equal(res.rows.length, 1)
      assert.equal(res.rows[0].doc.secret, encrypt(secret))
    })

    it('test encryption/decryption with bulkdocs/query', async function () {
      transform(db)

      const ddoc = {
        _id: '_design/index',
        views: {
          index: {
            map: function (doc) {
              emit(doc._id)
            }.toString()
          }
        }
      }

      await db.bulkDocs([{ _id: 'doc', secret: 'my super secret text!' }, ddoc])
      let res = await db.query('index', { keys: ['doc'], include_docs: true })
      assert.equal(res.rows.length, 1)
      assert.equal(res.rows[0].doc.secret, 'my super secret text!')
      res = await new PouchDB(dbName).query('index', { keys: ['doc'], include_docs: true })
      assert.equal(res.rows.length, 1)
      assert.equal(res.rows[0].doc.secret, encrypt('my super secret text!'))
    })

    it('test encryption/decryption with bulkdocs/changes complete', async function () {
      transform(db)

      function changesCompletePromise (db, opts) {
        return new Promise(function (resolve, reject) {
          db.changes(opts).on('complete', resolve).on('error', reject)
        })
      }

      await db.bulkDocs([{ _id: 'doc', secret: 'my super secret text!' }])
      let res = await changesCompletePromise(db, { include_docs: true })
      assert.equal(res.results.length, 1)
      assert.equal(res.results[0].doc.secret, 'my super secret text!')
      res = await changesCompletePromise(new PouchDB(dbName), { include_docs: true })
      assert.equal(res.results.length, 1)
      assert.equal(res.results[0].doc.secret, encrypt('my super secret text!'))
    })

    it('test encryption/decryption with bulkdocs/changes single change', async function () {
      transform(db)

      function changesCompletePromise (db, opts) {
        return new Promise(function (resolve, reject) {
          db.changes(opts).on('change', resolve).on('error', reject)
        })
      }

      await db.bulkDocs([{ _id: 'doc', secret: 'my super secret text!' }])
      let res = await changesCompletePromise(db, { include_docs: true })
      assert.equal(res.doc.secret, 'my super secret text!')
      res = await changesCompletePromise(new PouchDB(dbName), { include_docs: true })
      assert.equal(res.doc.secret, encrypt('my super secret text!'))
    })

    it('test encryption/decryption with bulkdocs/changes complete, promise style', async function () {
      transform(db)
      const id = 'doc'
      const secret = 'my super secret text!'

      function changesCompletePromise (db, opts) { return db.changes(opts) }

      await db.bulkDocs([{ _id: id, secret }])
      let res = await changesCompletePromise(db, { include_docs: true })
      assert.equal(res.results.length, 1)
      assert.equal(res.results[0].doc.secret, secret)
      res = await changesCompletePromise(new PouchDB(dbName), { include_docs: true })
      assert.equal(res.results.length, 1)
      assert.equal(res.results[0].doc.secret, encrypt(secret))
    })

    it('test encryption/decryption with bulkdocs/changes complete, no docs', async function () {
      transform(db)
      const id = 'doc'
      const secret = 'my super secret text!'

      function changesCompletePromise (db, opts) { return db.changes(opts) }

      await db.bulkDocs([{ _id: id, secret }])
      let res = await changesCompletePromise(db, {})
      assert.equal(res.results.length, 1)
      assert(!('doc' in res.results[0]))
      res = await changesCompletePromise(new PouchDB(dbName), {})
      assert.equal(res.results.length, 1)
      assert(!('doc' in res.results[0]))
    })

    it('makes sure that the .changes wrapper returns the value (#43)', async function () {
      db.transform({})
      const documentId = 'some-id'

      await db.put({
        _id: '_design/some_view',
        views: {
          some_view: {
            map: function (doc) {
              emit(doc.id, doc.value)
            }.toString(),
            reduce: '_sum'
          }
        }
      })
      await db.put({ _id: documentId, value: 5 })
      const response = await db.query('some_view')
      assert.equal(response.rows.length, 1)
    })

    // only works locally, since the remote Couch can't see the
    // unencrypted field
    if (dbType === 'local') {
      it('test encryption/decryption with map/reduce', async function () {
        transform(db)
        const id = 'doc'
        const secret = 'my super secret text!'
        const mapFun = {
          map: function (doc) {
            emit(doc.secret)
          }
        }
        await db.put({ _id: id, secret })
        let res = await db.query(mapFun)
        assert.equal(res.rows.length, 1)
        assert.equal(res.rows[0].key, secret)
        res = await new PouchDB(dbName).query(mapFun)
        assert.equal(res.rows.length, 1)
        assert.equal(res.rows[0].key, encrypt(secret))
      })
    }
  })

  describe(dbType + ': replication tests', function () {
    this.timeout(30000)

    let db
    let remote

    // Utility function - complex test incoming
    const defer = function () {
      let resolve, reject
      const promise = new Promise(function () {
        resolve = arguments[0]
        reject = arguments[1]
      })
      return {
        resolve: resolve,
        reject: reject,
        promise: promise
      }
    }

    beforeEach(function () {
      db = new PouchDB(dbName)
      remote = new PouchDB(dbName + '_other')
    })

    afterEach(async function () {
      await db.destroy()
      await remote.destroy()
    })

    it('test replication transforms incoming', async function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })

      await remote.put({ _id: 'doc' })

      await new Promise(function (resolve, reject) {
        remote.replicate.to(db).on('complete', resolve).on('error', reject)
      })

      const doc = await db.get('doc')
      assert.equal(doc.foo, 'baz')
    })

    it('test replication transforms outgoing', async function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })

      await db.put({ _id: 'doc' })

      await new Promise(function (resolve, reject) {
        db.replicate.to(remote).on('complete', resolve).on('error', reject)
      })

      const doc = await remote.get('doc')
      assert.equal(doc.foo, 'baz')
    })

    it('test live replication transforms', async function () {
      // We need to wait until the "incoming" change has happened.
      // We'll use a re-assignable deferred object so we can wait multiple times
      let d

      db.transform({
        incoming: function (doc) {
          doc.foo = 'baz'
          // Resolve anything that's waiting for the incoming handler to finish
          setTimeout(function () {
            d.resolve()
          }, 100)
          return doc
        },
        outgoing: function (doc) {
          doc.boo = 'lal'
          // Resolve anything that's waiting for the outgoing handler to finish
          setTimeout(function () {
            d.resolve()
          }, 100)
          return doc
        }
      })

      // Ongoing live replication
      const syncHandler = remote.sync(db, { live: true })

      // Wait to give replication a chance
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Reset the incoming listener
      d = defer()
      await remote.put({ _id: 'doc' })
      // Wait for the incoming listener - everything's updated
      await d.promise

      let doc = await db.get('doc')
      assert('boo' in doc)
      assert('foo' in doc)
      assert.equal(doc.foo, 'baz')

      doc = await remote.get('doc')
      // Reset the incoming listener
      d = defer()
      await remote.put({ _id: 'doc', _rev: doc._rev, moo: 'bar' })
      // Wait for the incoming listener - everything's updated
      await d.promise

      doc = await db.get('doc')
      assert('moo' in doc)
      assert('foo' in doc)
      assert('boo' in doc)
      assert.equal(doc.foo, 'baz')
      assert.equal(doc.moo, 'bar')
      assert.equal(doc.boo, 'lal')

      await syncHandler.cancel()
    })
  })
}
