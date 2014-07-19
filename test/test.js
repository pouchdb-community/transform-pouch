/*jshint expr:true */
'use strict';

var Pouch = require('pouchdb');

var plugin = require('../');
Pouch.plugin(plugin);

var chai = require('chai');
chai.use(require("chai-as-promised"));

var should = chai.should();
require('bluebird'); // var Promise = require('bluebird');

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

    if (typeof process !== 'undefined' && !process.browser) {
      it('test encryption/decryption (node)', function () {

        var crypto = require('crypto');

        function encrypt(text) {
          var cipher = crypto.createCipher('aes-256-cbc', 'password');
          var crypted = cipher.update(text, 'utf8', 'base64');
          return crypted + cipher.final('base64');
        }

        function decrypt(text) {
          var decipher = crypto.createDecipher('aes-256-cbc', 'password');
          var dec = decipher.update(text, 'base64', 'utf8');
          return dec + decipher.final('utf8');
        }

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

        return db.put({_id: 'doc', secret: 'my super secret text!'}).then(function () {
          return db.get('doc');
        }).then(function (doc) {
          doc.secret.should.equal('my super secret text!');
          return new Pouch(dbName).get('doc');
        }).then(function (doc) {
          doc.secret.should.equal('JB/ga3ItEZIUum4UpPSjDF+o78atHpZUsVD7JIELlaE=');
        });
      });
    } else { // browser
      it('test compression/decompression', function () {

        function compress(text) {
          return btoa(text);
        }

        function uncompress(text) {
          return atob(text);
        }

        db.filter({
          incoming: function (doc) {
            Object.keys(doc).forEach(function (field) {
              if (field !== '_id' && field !== '_rev') {
                doc[field] = compress(doc[field]);
              }
            });
            return doc;
          },
          outgoing: function (doc) {
            Object.keys(doc).forEach(function (field) {
              if (field !== '_id' && field !== '_rev') {
                doc[field] = uncompress(doc[field]);
              }
            });
            return doc;
          }
        });

        return db.put({_id: 'doc', secret: 'my super secret text!'}).then(function () {
          return db.get('doc');
        }).then(function (doc) {
            doc.secret.should.equal('my super secret text!');
            return new Pouch(dbName).get('doc');
          }).then(function (doc) {
            doc.secret.should.equal('bXkgc3VwZXIgc2VjcmV0IHRleHQh');
          });
      });
    }
  });
}
