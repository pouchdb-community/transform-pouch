'use strict'

const Pouch = require('pouchdb-core')
  .plugin(require('pouchdb-mapreduce'))
  .plugin(require('pouchdb-replication'))
  .plugin(require('pouchdb-adapter-memory'))
  .plugin(require('pouchdb-adapter-http'))

const plugin = require('../')
Pouch.plugin(plugin)

const chai = require('chai')
const should = chai.should()

const COUCH_URL = process.env.COUCH_URL || 'http://localhost:5984'
const DB_NAME = 'testdb';

[DB_NAME, COUCH_URL + '/' + DB_NAME].forEach(function (db) {
  const dbType = /^http/.test(db) ? 'http' : 'local'
  tests(db, dbType)
})

function tests (dbName, dbType) {
  describe(dbType + ': basic tests', function () {
    this.timeout(30000)

    let db

    beforeEach(function () {
      db = new Pouch(dbName)
      return db
    })
    afterEach(function () {
      return db.destroy()
    })

    it('transforms on PUT', function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      return db.put({ _id: 'foo' }).then(function () {
        return db.get('foo')
      }).then(function (doc) {
        doc._id.should.equal('foo')
        doc.foo.should.equal('baz')
      })
    })

    it('transforms on PUT, with a promise', function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = 'baz'
          return Promise.resolve(doc)
        }
      })
      return db.put({ _id: 'foo' }).then(function () {
        return db.get('foo')
      }).then(function (doc) {
        doc._id.should.equal('foo')
        doc.foo.should.equal('baz')
      })
    })

    it('transforms on POST', function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      return db.post({}).then(function (res) {
        return db.get(res.id)
      }).then(function (doc) {
        doc._id.should.be.a('string')
        doc.foo.should.equal('baz')
      })
    })

    it('transforms on POST, with a promise', function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = 'baz'
          return Promise.resolve(doc)
        }
      })
      return db.post({}).then(function (res) {
        return db.get(res.id)
      }).then(function (doc) {
        doc._id.should.be.a('string')
        doc.foo.should.equal('baz')
      })
    })

    it('transforms on GET', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      return db.put({ _id: 'foo' }).then(function () {
        return db.get('foo')
      }).then(function (doc) {
        doc._id.should.equal('foo')
        doc.foo.should.equal('baz')
      })
    })

    it('transforms on GET, with a promise', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return Promise.resolve(doc)
        }
      })
      return db.put({ _id: 'foo' }).then(function () {
        return db.get('foo')
      }).then(function (doc) {
        doc._id.should.equal('foo')
        doc.foo.should.equal('baz')
      })
    })

    it('skips local docs', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      return db.put({ _id: '_local/foo' }).then(function () {
        return db.get('_local/foo')
      }).then(function (doc) {
        doc._id.should.equal('_local/foo')
        should.not.exist(doc.foo)
      })
    })

    it('skips local docs, incoming', function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      return db.put({ _id: '_local/foo' }).then(function () {
        return db.get('_local/foo')
      }).then(function (doc) {
        doc._id.should.equal('_local/foo')
        should.not.exist(doc.foo)
      })
    })

    it('skips local docs, post', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      return db.post({ _id: '_local/foo' }).then(function () {
        return db.get('_local/foo')
      }).then(function (doc) {
        doc._id.should.equal('_local/foo')
        should.not.exist(doc.foo)
      })
    })

    it('skips local docs, bulkDocs', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      return db.bulkDocs([{ _id: '_local/foo' }]).then(function () {
        return db.get('_local/foo')
      }).then(function (doc) {
        doc._id.should.equal('_local/foo')
        should.not.exist(doc.foo)
      })
    })

    it('skips deleted docs', function () {
      const doc = { _id: 'foo', foo: {} }
      return db.put(doc).then(function (res) {
        doc._rev = res.rev
        return db.get('foo')
      }).then(function (doc) {
        let transformCalledOnDelete = false
        db.transform({
          incoming: function (doc) {
            transformCalledOnDelete = true
            return doc
          }
        })

        return db.remove(doc).then(function () {
          transformCalledOnDelete.should.equal(false)
        })
      })
    })

    it('transforms deleted docs with custom properties', function () {
      const doc = { _id: 'foo', foo: {} }
      return db.put(doc).then(function (res) {
        doc._rev = res.rev
        return db.get('foo')
      }).then(function (doc) {
        let transformCalledOnDelete = false
        db.transform({
          incoming: function (doc) {
            transformCalledOnDelete = true
            return doc
          }
        })

        doc.foo = 'baz'
        doc._deleted = true
        return db.put(doc).then(function () {
          transformCalledOnDelete.should.equal(true)
        })
      })
    })

    it('handles sync errors', function () {
      db.transform({
        incoming: function (doc) {
          doc.foo.baz = 'baz'
          return doc
        }
      })
      const doc = { _id: 'foo' }
      return db.put(doc).then(function (res) {
        should.not.exist(res)
      }).catch(function (err) {
        should.exist(err)
      })
    })

    it('handles async errors', function () {
      db.transform({
        incoming: function () {
          return Promise.reject(new Error('flunking you'))
        }
      })
      const doc = { _id: 'foo' }
      return db.put(doc).then(function (res) {
        should.not.exist(res)
      }).catch(function (err) {
        should.exist(err)
      })
    })

    it('handles cancel', function () {
      db.transform()
      const syncHandler = db.sync('my_gateway', {})
      return syncHandler.cancel()
    })

    it('transforms on GET with options', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      return db.put({ _id: 'foo' }).then(function () {
        return db.get('foo', {})
      }).then(function (doc) {
        doc._id.should.equal('foo')
        doc.foo.should.equal('baz')
      })
    })

    it('transforms on GET with missing open_revs', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      return db.put({ _id: 'foo' }).then(function () {
        return db.get('foo', { revs: true, open_revs: ['1-DNE'] })
      }).then(function (docs) {
        docs.should.have.length(1)
        docs[0].missing.should.equal('1-DNE')
      })
    })

    it('transforms on GET with missing and non-missing open_revs', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      let rev
      return db.put({ _id: 'foo' }).then(function (res) {
        rev = res.rev
        return db.get('foo', { revs: true, open_revs: ['1-DNE', rev] })
      }).then(function (docs) {
        docs.should.have.length(2)
        const okRes = docs[0].ok ? docs[0] : docs[1]
        const missingRes = docs[0].ok ? docs[1] : docs[0]
        missingRes.missing.should.equal('1-DNE')
        okRes.ok._rev.should.equal(rev)
      })
    })

    it('transforms on GET, not found', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })
      return db.put({ _id: 'foo' }).then(function () {
        return db.get('quux')
      }).then(function (doc) {
        should.not.exist(doc)
      }).catch(function (err) {
        should.exist(err)
      })
    })

    it('transforms on bulk_docs', function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      return db.bulkDocs([{ _id: 'toto' }, { _id: 'lala' }]).then(function (res) {
        return db.get(res[0].id).then(function (doc) {
          doc.foo.should.equal('toto_baz')
        }).then(function () {
          return db.get(res[1].id)
        }).then(function (doc) {
          doc.foo.should.equal('lala_baz')
        })
      })
    })

    it('transforms on bulk_docs, new_edits=false 1', function () {
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
      return db.bulkDocs({ docs: docsA, new_edits: false }).then(function (results) {
        results.forEach(function (result) {
          should.not.exist(result.error, 'no doc update coflict')
        })
      }).then(function () {
        return db.bulkDocs({ docs: docsB, new_edits: false })
      }).then(function (results) {
        results.forEach(function (result) {
          should.not.exist(result.error, 'no doc update coflict')
        })
      }).then(function () {
        return db.bulkDocs({ docs: docsC, new_edits: false })
      }).then(function (results) {
        results.forEach(function (result) {
          should.not.exist(result.error, 'no doc update coflict')
        })
      })
    })

    it('transforms on bulk_docs, new_edits=false 2', function () {
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
      return db.bulkDocs(docsA, { new_edits: false }).then(function (results) {
        results.forEach(function (result) {
          should.not.exist(result.error, 'no doc update coflict')
        })
      }).then(function () {
        return db.bulkDocs(docsB, { new_edits: false })
      }).then(function (results) {
        results.forEach(function (result) {
          should.not.exist(result.error, 'no doc update coflict')
        })
      }).then(function () {
        return db.bulkDocs(docsC, { new_edits: false })
      }).then(function (results) {
        results.forEach(function (result) {
          should.not.exist(result.error, 'no doc update coflict')
        })
      })
    })

    it('transforms on bulk_docs, object style', function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      return db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }] }).then(function (res) {
        return db.get(res[0].id).then(function (doc) {
          doc.foo.should.equal('toto_baz')
        }).then(function () {
          return db.get(res[1].id)
        }).then(function (doc) {
          doc.foo.should.equal('lala_baz')
        })
      })
    })

    it('transforms on all_docs, incoming', function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      return db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }] }).then(function () {
        return db.allDocs({ include_docs: true }).then(function (res) {
          res.rows.should.have.length(2)
          res.rows[0].doc.foo.should.equal('lala_baz')
          res.rows[1].doc.foo.should.equal('toto_baz')
        })
      })
    })

    it('transforms on all_docs, outgoing', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      return db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }] }).then(function () {
        return db.allDocs({ include_docs: true }).then(function (res) {
          res.rows.should.have.length(2)
          res.rows[0].doc.foo.should.equal('lala_baz')
          res.rows[1].doc.foo.should.equal('toto_baz')
        })
      })
    })

    it('transforms on all_docs no opts, outgoing', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = doc._id + '_baz'
          return doc
        }
      })
      return db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }] }).then(function () {
        return db.allDocs().then(function (res) {
          res.rows.should.have.length(2)
          should.not.exist(res.rows[0].doc)
          should.not.exist(res.rows[1].doc)
        })
      })
    })

    it('transforms on query, incoming', function () {
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

      return db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }, ddoc] }).then(function () {
        return db.query('index', { include_docs: true }).then(function (res) {
          res.rows.should.have.length(2)
          res.rows[0].doc.foo.should.equal('lala_baz')
          res.rows[1].doc.foo.should.equal('toto_baz')
        })
      })
    })

    it('transforms on query, outgoing', function () {
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
      return db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }, ddoc] }).then(function () {
        return db.query('index', { include_docs: true }).then(function (res) {
          res.rows.should.have.length(2)
          res.rows[0].doc.foo.should.equal('lala_baz')
          res.rows[1].doc.foo.should.equal('toto_baz')
        })
      })
    })

    it('transforms on query no opts, outgoing', function () {
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
      return db.bulkDocs({ docs: [{ _id: 'toto' }, { _id: 'lala' }, ddoc] }).then(function () {
        return db.query('index').then(function (res) {
          res.rows.should.have.length(2)
          should.not.exist(res.rows[0].doc)
          should.not.exist(res.rows[1].doc)
        })
      })
    })

    it('transforms ingoing and outgoing', function () {
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
      return db.put({ _id: 'doc', foo: 'bar' }).then(function () {
        return db.get('doc')
      }).then(function (doc) {
        doc.foo.should.equal('bar')
      })
    })
  })

  describe(dbType + ': advanced tests', function () {
    this.timeout(30000)

    let db

    beforeEach(function () {
      db = new Pouch(dbName)
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

    it('test encryption/decryption with puts', function () {
      transform(db)
      return db.put({ _id: 'doc', secret: 'my super secret text!' }).then(function () {
        return db.get('doc')
      }).then(function (doc) {
        doc.secret.should.equal('my super secret text!')
        return new Pouch(dbName).get('doc')
      }).then(function (doc) {
        doc.secret.should.equal(encrypt('my super secret text!'))
      })
    })

    it('test encryption/decryption with posts', function () {
      transform(db)
      let id
      return db.post({ secret: 'my super secret text!' }).then(function (res) {
        id = res.id
        return db.get(res.id)
      }).then(function (doc) {
        doc.secret.should.equal('my super secret text!')
        return new Pouch(dbName).get(id)
      }).then(function (doc) {
        doc.secret.should.equal(encrypt('my super secret text!'))
      })
    })

    it('test encryption/decryption with bulkdocs/alldocs', function () {
      transform(db)
      return db.bulkDocs([{ _id: 'doc', secret: 'my super secret text!' }]).then(function () {
        return db.allDocs({ keys: ['doc'], include_docs: true })
      }).then(function (res) {
        res.rows.should.have.length(1)
        res.rows[0].doc.secret.should.equal('my super secret text!')
        return new Pouch(dbName).allDocs({ keys: ['doc'], include_docs: true })
      }).then(function (res) {
        res.rows.should.have.length(1)
        res.rows[0].doc.secret.should.equal(encrypt('my super secret text!'))
      })
    })

    it('test encryption/decryption with bulkdocs/query', function () {
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

      return db.bulkDocs([{ _id: 'doc', secret: 'my super secret text!' }, ddoc]).then(function () {
        return db.query('index', { keys: ['doc'], include_docs: true })
      }).then(function (res) {
        res.rows.should.have.length(1)
        res.rows[0].doc.secret.should.equal('my super secret text!')
        return new Pouch(dbName).query('index', { keys: ['doc'], include_docs: true })
      }).then(function (res) {
        res.rows.should.have.length(1)
        res.rows[0].doc.secret.should.equal(encrypt('my super secret text!'))
      })
    })

    it('test encryption/decryption with bulkdocs/changes complete', function () {
      transform(db)

      function changesCompletePromise (db, opts) {
        return new Promise(function (resolve, reject) {
          db.changes(opts).on('complete', resolve).on('error', reject)
        })
      }

      return db.bulkDocs([{ _id: 'doc', secret: 'my super secret text!' }]).then(function () {
        return changesCompletePromise(db, { include_docs: true })
      }).then(function (res) {
        res.results.should.have.length(1)
        res.results[0].doc.secret.should.equal('my super secret text!')
        return changesCompletePromise(new Pouch(dbName), { include_docs: true })
      }).then(function (res) {
        res.results.should.have.length(1)
        res.results[0].doc.secret.should.equal(encrypt('my super secret text!'))
      })
    })

    it('test encryption/decryption with bulkdocs/changes single change', function () {
      transform(db)

      function changesCompletePromise (db, opts) {
        return new Promise(function (resolve, reject) {
          db.changes(opts).on('change', resolve).on('error', reject)
        })
      }

      return db.bulkDocs([{ _id: 'doc', secret: 'my super secret text!' }]).then(function () {
        return changesCompletePromise(db, { include_docs: true })
      }).then(function (res) {
        res.doc.secret.should.equal('my super secret text!')
        return changesCompletePromise(new Pouch(dbName), { include_docs: true })
      }).then(function (res) {
        res.doc.secret.should.equal(encrypt('my super secret text!'))
      })
    })

    it('test encryption/decryption with bulkdocs/changes complete, promise style', function () {
      transform(db)

      function changesCompletePromise (db, opts) {
        return db.changes(opts)
      }

      return db.bulkDocs([{ _id: 'doc', secret: 'my super secret text!' }]).then(function () {
        return changesCompletePromise(db, { include_docs: true })
      }).then(function (res) {
        res.results.should.have.length(1)
        res.results[0].doc.secret.should.equal('my super secret text!')
        return changesCompletePromise(new Pouch(dbName), { include_docs: true })
      }).then(function (res) {
        res.results.should.have.length(1)
        res.results[0].doc.secret.should.equal(encrypt('my super secret text!'))
      })
    })

    it('test encryption/decryption with bulkdocs/changes complete, no docs', function () {
      transform(db)

      function changesCompletePromise (db, opts) {
        return db.changes(opts)
      }

      return db.bulkDocs([{ _id: 'doc', secret: 'my super secret text!' }]).then(function () {
        return changesCompletePromise(db, {})
      }).then(function (res) {
        res.results.should.have.length(1)
        should.not.exist(res.results[0].doc)
        return changesCompletePromise(new Pouch(dbName), {})
      }).then(function (res) {
        res.results.should.have.length(1)
        should.not.exist(res.results[0].doc)
      })
    })

    it('makes sure that the .changes wrapper returns the value (#43)', function () {
      db.transform({})
      const documentId = 'some-id'

      return db.put({
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
        .then(function () {
          return db.put({ _id: documentId, value: 5 })
        })
        .then(function () {
          return db.query('some_view')
        })
        .then(function (response) {
          response.rows.should.have.length(1)
        })
    })

    // only works locally, since the remote Couch can't see the
    // unencrypted field
    if (dbType === 'local') {
      it('test encryption/decryption with map/reduce', function () {
        transform(db)
        const mapFun = {
          map: function (doc) {
            emit(doc.secret)
          }
        }
        return db.put({ _id: 'doc', secret: 'my super secret text!' }).then(function () {
          return db.query(mapFun)
        }).then(function (res) {
          res.rows.should.have.length(1)
          res.rows[0].key.should.equal('my super secret text!')
          return new Pouch(dbName).query(mapFun)
        }).then(function (res) {
          res.rows.should.have.length(1)
          res.rows[0].key.should.equal(encrypt('my super secret text!'))
        })
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
      db = new Pouch(dbName)
      remote = new Pouch(dbName + '_other')
    })

    afterEach(function () {
      return db.destroy().then(function () {
        return remote.destroy()
      })
    })

    it('test replication transforms incoming', function () {
      db.transform({
        incoming: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })

      return remote.put({ _id: 'doc' }).then(function () {
        return new Promise(function (resolve, reject) {
          remote.replicate.to(db).on('complete', resolve).on('error', reject)
        })
      }).then(function () {
        return db.get('doc')
      }).then(function (doc) {
        doc.foo.should.equal('baz')
      })
    })

    it('test replication transforms outgoing', function () {
      db.transform({
        outgoing: function (doc) {
          doc.foo = 'baz'
          return doc
        }
      })

      return db.put({ _id: 'doc' }).then(function () {
        return new Promise(function (resolve, reject) {
          db.replicate.to(remote).on('complete', resolve).on('error', reject)
        })
      }).then(function () {
        return remote.get('doc')
      }).then(function (doc) {
        doc.foo.should.equal('baz')
      })
    })

    it('test live replication transforms', function () {
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
      const syncHandler = remote.sync(db, {
        live: true
      })

      const setupPromise = new Promise(function (resolve) {
        // Wait to give replication a chance
        setTimeout(resolve, 500)
      })

      // The actual test
      const result = setupPromise.then(function () {
        // Reset the incoming listener
        d = defer()
        return remote.put({ _id: 'doc' })
      }).then(function () {
        // Wait for the incoming listener - everything's updated
        return d.promise
      }).then(function () {
        return db.get('doc')
      }).then(function (doc) {
        doc.should.have.property('boo')
        doc.should.have.property('foo')
        doc.foo.should.equal('baz')
        return remote.get('doc')
      }).then(function (doc) {
        // Reset the incoming listener
        d = defer()
        return remote.put({ _id: 'doc', _rev: doc._rev, moo: 'bar' })
      }).then(function () {
        // Wait for the incoming listener - everything's updated
        return d.promise
      }).then(function () {
        return db.get('doc')
      }).then(function (doc) {
        doc.should.have.property('moo')
        doc.should.have.property('foo')
        doc.should.have.property('boo')
        doc.foo.should.equal('baz')
        doc.moo.should.equal('bar')
        doc.boo.should.equal('lal')
      })

      result.then(function () {
        syncHandler.cancel()
      })
      return result
    })
  })
}
