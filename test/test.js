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
  });
}
