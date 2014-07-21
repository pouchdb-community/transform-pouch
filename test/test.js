/*jshint expr:true */
'use strict';

var Pouch = require('pouchdb');

var plugin = require('../');
Pouch.plugin(plugin);

var chai = require('chai');
chai.use(require("chai-as-promised"));

var should = chai.should();
var Promise = require('bluebird');

var dbs;
if (process.browser) {
  dbs = 'testdb' + Math.random() +
    ',http://localhost:5984/testdb' + Math.round(Math.random() * 100000);
} else {
  dbs = process.env.TEST_DB;
}

dbs.split(',').forEach(function (db) {
  var dbType = /^http/.test(db) ? 'http' : 'local';
  tests(db, dbType);
});

function tests(dbName, dbType) {
  describe(dbType + ': basic tests', function () {

    var db;

    beforeEach(function () {
      db = new Pouch(dbName);
      return db;
    });
    afterEach(function () {
      return Pouch.destroy(dbName);
    });

    it('filters on PUT', function () {
      db.filter({
        incoming: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });
      return db.put({_id: 'foo'}).then(function () {
        return db.get('foo');
      }).then(function (doc) {
        doc._id.should.equal('foo');
        doc.foo.should.equal('baz');
      });
    });

    it('filters on POST', function () {
      db.filter({
        incoming: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });
      return db.post({}).then(function (res) {
        return db.get(res.id);
      }).then(function (doc) {
        doc._id.should.be.a('string');
        doc.foo.should.equal('baz');
      });
    });


    it('filters on GET', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });
      return db.put({_id: 'foo'}).then(function () {
        return db.get('foo');
      }).then(function (doc) {
        doc._id.should.equal('foo');
        doc.foo.should.equal('baz');
      });
    });

    it('skips local docs', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });
      return db.put({_id: '_local/foo'}).then(function () {
        return db.get('_local/foo');
      }).then(function (doc) {
        doc._id.should.equal('_local/foo');
        should.not.exist(doc.foo);
      });
    });

    it('skips local docs, incoming', function () {
      db.filter({
        incoming: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });
      return db.put({_id: '_local/foo'}).then(function () {
        return db.get('_local/foo');
      }).then(function (doc) {
        doc._id.should.equal('_local/foo');
        should.not.exist(doc.foo);
      });
    });

    it('skips local docs, post', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });
      return db.post({_id: '_local/foo'}).then(function () {
        return db.get('_local/foo');
      }).then(function (doc) {
        doc._id.should.equal('_local/foo');
        should.not.exist(doc.foo);
      });
    });

    it('skips local docs, bulkDocs', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });
      return db.bulkDocs([{_id: '_local/foo'}]).then(function () {
        return db.get('_local/foo');
      }).then(function (doc) {
        doc._id.should.equal('_local/foo');
        should.not.exist(doc.foo);
      });
    });

    it('skips deleted docs', function () {
      db.filter({
        incoming: function (doc) {
          doc.foo.baz = 'baz';
          return doc;
        }
      });
      var doc = {_id: 'foo', foo: {}};
      return db.put(doc).then(function (res) {
        doc._rev = res.rev;
        return db.get('foo');
      }).then(function (doc) {
        doc.foo.baz.should.equal('baz');
        return db.remove(doc);
      });
    });

    // TODO: convert sync errors in user code into async errors
    it.skip('handles sync errors', function () {
      db.filter({
        incoming: function (doc) {
          doc.foo.baz = 'baz';
          return doc;
        }
      });
      var doc = {_id: 'foo'};
      return db.put(doc).then(function (res) {
        should.not.exist(res);
      }).catch(function (err) {
        should.exist(err);
      });
    });

    it('filters on GET with options', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });
      return db.put({_id: 'foo'}).then(function () {
        return db.get('foo', {});
      }).then(function (doc) {
        doc._id.should.equal('foo');
        doc.foo.should.equal('baz');
      });
    });

    it('filters on GET with missing open_revs', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });
      return db.put({_id: 'foo'}).then(function () {
        return db.get('foo', {revs: true, open_revs: ['1-DNE']});
      }).then(function (docs) {
        docs.should.have.length(1);
        docs[0].missing.should.equal('1-DNE');
      });
    });

    it('filters on GET with missing and non-missing open_revs', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });
      var rev;
      return db.put({_id: 'foo'}).then(function (res) {
        rev = res.rev;
        return db.get('foo', {revs: true, open_revs: ['1-DNE', rev]});
      }).then(function (docs) {
        docs.should.have.length(2);
        var okRes = docs[0].ok ? docs[0] : docs[1];
        var missingRes = docs[0].ok ? docs[1] : docs[0];
        missingRes.missing.should.equal('1-DNE');
        okRes.ok._rev.should.equal(rev);
      });
    });

    it('filters on GET, not found', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });
      return db.put({_id: 'foo'}).then(function () {
        return db.get('quux');
      }).then(function (doc) {
        should.not.exist(doc);
      }).catch(function (err) {
        should.exist(err);
      });
    });

    it('filters on bulk_docs', function () {
      db.filter({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz';
          return doc;
        }
      });
      return db.bulkDocs([{_id: 'toto'}, {_id: 'lala'}]).then(function (res) {
        return db.get(res[0].id).then(function (doc) {
          doc.foo.should.equal('toto_baz');
        }).then(function () {
          return db.get(res[1].id);
        }).then(function (doc) {
          doc.foo.should.equal('lala_baz');
        });
      });
    });

    it('filters on bulk_docs, object style', function () {
      db.filter({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz';
          return doc;
        }
      });
      return db.bulkDocs({docs: [{_id: 'toto'}, {_id: 'lala'}]}).then(function (res) {
        return db.get(res[0].id).then(function (doc) {
          doc.foo.should.equal('toto_baz');
        }).then(function () {
          return db.get(res[1].id);
        }).then(function (doc) {
          doc.foo.should.equal('lala_baz');
        });
      });
    });

    it('filters on all_docs, incoming', function () {
      db.filter({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz';
          return doc;
        }
      });
      return db.bulkDocs({docs: [{_id: 'toto'}, {_id: 'lala'}]}).then(function () {
        return db.allDocs({include_docs: true}).then(function (res) {
          res.rows.should.have.length(2);
          res.rows[0].doc.foo.should.equal('lala_baz');
          res.rows[1].doc.foo.should.equal('toto_baz');
        });
      });
    });

    it('filters on all_docs, outgoing', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = doc._id + '_baz';
          return doc;
        }
      });
      return db.bulkDocs({docs: [{_id: 'toto'}, {_id: 'lala'}]}).then(function () {
        return db.allDocs({include_docs: true}).then(function (res) {
          res.rows.should.have.length(2);
          res.rows[0].doc.foo.should.equal('lala_baz');
          res.rows[1].doc.foo.should.equal('toto_baz');
        });
      });
    });

    it('filters on all_docs no opts, outgoing', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = doc._id + '_baz';
          return doc;
        }
      });
      return db.bulkDocs({docs: [{_id: 'toto'}, {_id: 'lala'}]}).then(function () {
        return db.allDocs().then(function (res) {
          res.rows.should.have.length(2);
          should.not.exist(res.rows[0].doc);
          should.not.exist(res.rows[1].doc);
        });
      });
    });

    it('filters on query, incoming', function () {
      db.filter({
        incoming: function (doc) {
          doc.foo = doc._id + '_baz';
          return doc;
        }
      });
      var mapFun = {
        map: function (doc) {
          emit(doc._id);
        }
      };
      return db.bulkDocs({docs: [{_id: 'toto'}, {_id: 'lala'}]}).then(function () {
        return db.query(mapFun, {include_docs: true}).then(function (res) {
          res.rows.should.have.length(2);
          res.rows[0].doc.foo.should.equal('lala_baz');
          res.rows[1].doc.foo.should.equal('toto_baz');
        });
      });
    });

    it('filters on query, outgoing', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = doc._id + '_baz';
          return doc;
        }
      });
      var mapFun = {
        map: function (doc) {
          emit(doc._id);
        }
      };
      return db.bulkDocs({docs: [{_id: 'toto'}, {_id: 'lala'}]}).then(function () {
        return db.query(mapFun, {include_docs: true}).then(function (res) {
          res.rows.should.have.length(2);
          res.rows[0].doc.foo.should.equal('lala_baz');
          res.rows[1].doc.foo.should.equal('toto_baz');
        });
      });
    });

    it('filters on query no opts, outgoing', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = doc._id + '_baz';
          return doc;
        }
      });
      var mapFun = {
        map: function (doc) {
          emit(doc._id);
        }
      };
      return db.bulkDocs({docs: [{_id: 'toto'}, {_id: 'lala'}]}).then(function () {
        return db.query(mapFun).then(function (res) {
          res.rows.should.have.length(2);
          should.not.exist(res.rows[0].doc);
          should.not.exist(res.rows[1].doc);
        });
      });
    });

    it('filters ingoing and outgoing', function () {
      db.filter({
        ingoing: function (doc) {
          doc.foo = doc.foo.toUpperCase();
          return doc;
        },
        outgoing: function (doc) {
          doc.foo = doc.foo.toLowerCase();
          return doc;
        }
      });
      return db.put({_id: 'doc', foo: 'bar'}).then(function () {
        return db.get('doc');
      }).then(function (doc) {
        doc.foo.should.equal('bar');
      });
    });
  });

  describe(dbType + ': advanced tests', function () {

    var db;

    beforeEach(function () {
      db = new Pouch(dbName);
      return db;
    });
    afterEach(function () {
      return Pouch.destroy(dbName);
    });

    var encrypt;
    var decrypt;
    if (typeof process !== 'undefined' && !process.browser) {
      var crypto = require('crypto');

      encrypt = function (text) {
        var cipher = crypto.createCipher('aes-256-cbc', 'password');
        var crypted = cipher.update(text, 'utf8', 'base64');
        return crypted + cipher.final('base64');
      };

      decrypt = function (text) {
        var decipher = crypto.createDecipher('aes-256-cbc', 'password');
        var dec = decipher.update(text, 'base64', 'utf8');
        return dec + decipher.final('utf8');
      };
    } else { // browser
      encrypt = btoa;
      decrypt = atob;
    }

    function filter(db) {
      db.filter({
        incoming: function (doc) {
          Object.keys(doc).forEach(function (field) {
            if (field !== '_id' && field !== '_rev') {
              doc[field] = encrypt(doc[field]);
            }
          });
          return doc;
        },
        outgoing: function (doc) {
          Object.keys(doc).forEach(function (field) {
            if (field !== '_id' && field !== '_rev') {
              doc[field] = decrypt(doc[field]);
            }
          });
          return doc;
        }
      });
    }

    it('test encryption/decryption', function () {
      filter(db);
      return db.put({_id: 'doc', secret: 'my super secret text!'}).then(function () {
        return db.get('doc');
      }).then(function (doc) {
        doc.secret.should.equal('my super secret text!');
        return new Pouch(dbName).get('doc');
      }).then(function (doc) {
        doc.secret.should.equal(encrypt('my super secret text!'));
      });
    });

    it('test encryption/decryption with posts', function () {
      filter(db);
      var id;
      return db.post({secret: 'my super secret text!'}).then(function (res) {
        id = res.id;
        return db.get(res.id);
      }).then(function (doc) {
        doc.secret.should.equal('my super secret text!');
        return new Pouch(dbName).get(id);
      }).then(function (doc) {
        doc.secret.should.equal(encrypt('my super secret text!'));
      });
    });

    it('test encryption/decryption with bulkdocs/alldocs', function () {
      filter(db);
      return db.bulkDocs([{_id: 'doc', secret: 'my super secret text!'}]).then(function () {
        return db.allDocs({keys: ['doc'], include_docs: true});
      }).then(function (res) {
        res.rows.should.have.length(1);
        res.rows[0].doc.secret.should.equal('my super secret text!');
        return new Pouch(dbName).allDocs({keys: ['doc'], include_docs: true});
      }).then(function (res) {
        res.rows.should.have.length(1);
        res.rows[0].doc.secret.should.equal(encrypt('my super secret text!'));
      });
    });

    it('test encryption/decryption with bulkdocs/query', function () {
      filter(db);

      var mapFun = {
        map: function (doc) {
          emit(doc._id);
        }
      };

      return db.bulkDocs([{_id: 'doc', secret: 'my super secret text!'}]).then(function () {
        return db.query(mapFun, {keys: ['doc'], include_docs: true});
      }).then(function (res) {
        res.rows.should.have.length(1);
        res.rows[0].doc.secret.should.equal('my super secret text!');
        return new Pouch(dbName).query(mapFun, {keys: ['doc'], include_docs: true});
      }).then(function (res) {
        res.rows.should.have.length(1);
        res.rows[0].doc.secret.should.equal(encrypt('my super secret text!'));
      });
    });

    it('test encryption/decryption with bulkdocs/changes complete', function () {
      filter(db);

      function changesCompletePromise(db, opts) {
        return new Promise(function (resolve, reject) {
          db.changes(opts).on('complete', resolve).on('error', reject);
        });
      }

      return db.bulkDocs([{_id: 'doc', secret: 'my super secret text!'}]).then(function () {
        return changesCompletePromise(db, {include_docs: true});
      }).then(function (res) {
        res.results.should.have.length(1);
        res.results[0].doc.secret.should.equal('my super secret text!');
        return changesCompletePromise(new Pouch(dbName), {include_docs: true});
      }).then(function (res) {
        res.results.should.have.length(1);
        res.results[0].doc.secret.should.equal(encrypt('my super secret text!'));
      });
    });

    it('test encryption/decryption with bulkdocs/changes single change', function () {
      filter(db);

      function changesCompletePromise(db, opts) {
        return new Promise(function (resolve, reject) {
          db.changes(opts).on('change', resolve).on('error', reject);
        });
      }

      return db.bulkDocs([{_id: 'doc', secret: 'my super secret text!'}]).then(function () {
        return changesCompletePromise(db, {include_docs: true});
      }).then(function (res) {
        res.doc.secret.should.equal('my super secret text!');
        return changesCompletePromise(new Pouch(dbName), {include_docs: true});
      }).then(function (res) {
        res.doc.secret.should.equal(encrypt('my super secret text!'));
      });
    });

    it('test encryption/decryption with bulkdocs/changes complete, promise style', function () {
      filter(db);

      function changesCompletePromise(db, opts) {
        return db.changes(opts);
      }

      return db.bulkDocs([{_id: 'doc', secret: 'my super secret text!'}]).then(function () {
        return changesCompletePromise(db, {include_docs: true});
      }).then(function (res) {
        res.results.should.have.length(1);
        res.results[0].doc.secret.should.equal('my super secret text!');
        return changesCompletePromise(new Pouch(dbName), {include_docs: true});
      }).then(function (res) {
        res.results.should.have.length(1);
        res.results[0].doc.secret.should.equal(encrypt('my super secret text!'));
      });
    });

    it('test encryption/decryption with bulkdocs/changes complete, no docs', function () {
      filter(db);

      function changesCompletePromise(db, opts) {
        return db.changes(opts);
      }

      return db.bulkDocs([{_id: 'doc', secret: 'my super secret text!'}]).then(function () {
        return changesCompletePromise(db, {});
      }).then(function (res) {
        res.results.should.have.length(1);
        should.not.exist(res.results[0].doc);
        return changesCompletePromise(new Pouch(dbName), {});
      }).then(function (res) {
        res.results.should.have.length(1);
        should.not.exist(res.results[0].doc);
      });
    });

    it('test encryption/decryption with bulkdocs/changes complete, old style', function () {
      filter(db);

      function changesCompletePromise(db, opts) {
        return new Promise(function (resolve, reject) {
          opts.complete = function (err, res) {
            if (err) {
              reject(err);
            } else {
              resolve(res);
            }
          };
          db.changes(opts);
        });
      }

      return db.bulkDocs([{_id: 'doc', secret: 'my super secret text!'}]).then(function () {
        return changesCompletePromise(db, {include_docs: true});
      }).then(function (res) {
          res.results.should.have.length(1);
          res.results[0].doc.secret.should.equal('my super secret text!');
          return changesCompletePromise(new Pouch(dbName), {include_docs: true});
        }).then(function (res) {
          res.results.should.have.length(1);
          res.results[0].doc.secret.should.equal(encrypt('my super secret text!'));
        });
    });
  });

  describe(dbType + ': replication tests', function () {

    var db;
    var remote;

    beforeEach(function () {

      db = new Pouch(dbName);
      remote = new Pouch(dbName + '_other');
    });

    afterEach(function () {
      return Pouch.destroy(dbName).then(function () {
        return Pouch.destroy(dbName + '_other');
      });
    });

    it('test replication filters incoming', function () {
      db.filter({
        incoming: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });

      return remote.put({_id: 'doc'}).then(function () {
        return new Promise(function (resolve, reject) {
          remote.replicate.to(db).on('complete', resolve).on('error', reject);
        });
      }).then(function () {
        return db.get('doc');
      }).then(function (doc) {
        doc.foo.should.equal('baz');
      });
    });

    it('test replication filters outgoing', function () {
      db.filter({
        outgoing: function (doc) {
          doc.foo = 'baz';
          return doc;
        }
      });

      return db.put({_id: 'doc'}).then(function () {
        return new Promise(function (resolve, reject) {
          db.replicate.to(remote).on('complete', resolve).on('error', reject);
        });
      }).then(function () {
        return remote.get('doc');
      }).then(function (doc) {
        doc.foo.should.equal('baz');
      });
    });
  });
}
