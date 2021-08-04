Transform Pouch
=====

[![.github/workflows/transform-pouch.yml](https://github.com/pouchdb-community/transform-pouch/actions/workflows/transform-pouch.yml/badge.svg)](https://github.com/pouchdb-community/transform-pouch/actions/workflows/transform-pouch.yml)

Apply a *transform function* to documents before and after they are stored in the database. These functions are triggered invisibly for every `get()`, `put()`, `post()`, `bulkDocs()`, `bulkGet()`, `allDocs()`, `changes()`, and also to documents added via replication.

This allows you to:

* Encrypt and decrypt sensitive document fields
* Compress and uncompress large content (e.g. to avoid hitting [browser storage limits](http://pouchdb.com/faq.html#data_limits))
* Remove or modify documents before storage (e.g. to massage data from CouchDB)

*__Note:__ This plugin was formerly known as `filter-pouch`, but was renamed to be less confusing. The `filter()` API is still supported, but deprecated.*

## Usage

Just npm install it:

```
npm install transform-pouch
```

And then attach it to the `PouchDB` object:

```js
var PouchDB = require('pouchdb');
PouchDB.plugin(require('transform-pouch'));
```

You can also use `npm run build` to compile browser-ready bundles.

## API

When you create a new PouchDB, you need to configure the transform functions:

```js
var pouch = new PouchDB('mydb');
pouch.transform({
  incoming: function (doc) {
    // do something to the document before storage
    return doc;
  },
  outgoing: function (doc) {
    // do something to the document after retrieval
    return doc;
  }
});
```

You can also use Promises:

```js
var pouch = new PouchDB('mydb');
pouch.transform({
  incoming: function (doc) {
    return Promise.resolve(doc);
  },
  outgoing: function (doc) {
    return Promise.resolve(doc);
  }
});
```

Notes:

* You can provide an `incoming` function, an `outgoing` function, or both.
* Your transform function **must** return the document itself, or a new document (or a promise for such).
* `incoming` functions apply to `put()`, `post()`, `bulkDocs()`, and incoming replications.
* `outgoing` functions apply to `get()`, `allDocs()`, `bulkGet()`, `changes()`, `query()`, and outgoing replications.
* The `incoming`/`outgoing` methods can be async or sync &ndash; just return a Promise for a doc, or the doc itself.

## Example: Encryption

**Update!** Check out [crypto-pouch](https://github.com/calvinmetcalf/crypto-pouch), which is based on this plugin, and runs in both the browser and Node. The instructions below will only work in Node.

Using the Node.js crypto library, let's first set up our encrypt/decrypt functions:

```js
var crypto = require('crypto');

var cipher = crypto.createCipher('aes-256-cbc', 'password');
var decipher = crypto.createDecipher('aes-256-cbc', 'password');

function encrypt(text) {
  var crypted = cipher.update(text, 'utf8', 'base64');
  return crypted + cipher.final('base64');
}

function decrypt(text) {
  var dec = decipher.update(text, 'base64', 'utf8');
  return dec + decipher.final('utf8');
}
```

Obviously you would want to change the `'password'` to be something only the user knows!

Next, let's set up our transforms:

```js
pouch.transform({
  incoming: function (doc) {
    Object.keys(doc).forEach(function (field) {
      if (field !== '_id' && field !== '_rev' && field !== '_revisions') {
        doc[field] = encrypt(doc[field]);
      }
    });
    return doc;
  },
  outgoing: function (doc) {
    Object.keys(doc).forEach(function (field) {
      if (field !== '_id' && field !== '_rev' && field !== '_revisions') {
        doc[field] = decrypt(doc[field]);
      }
    });
    return doc;
  }
});
```

(`transform-pouch` will automatically ignore deleted documents, so you don't need to handle that case.)

Now, the documents are encrypted whenever they're stored in the database. If you want to verify, try opening them with a `Pouch` where you haven't set up any `transforms`.  You'll see documents like:

```js
{
  secret: 'YrAtAEbvp0bPLil8EpbNeA==',
  _id: 'doc',
  _rev: '1-bfc37cd00225f68671fe3187c054f9e3'
}
```

whereas privileged users will see:

```js
{
  secret: 'my super secret text!',
  _id: 'doc',
  _rev: '1-bfc37cd00225f68671fe3187c054f9e3'
}
```

This works for remote CouchDB databases as well.  In fact, only the encrypted data is sent over the wire, so it's ideal for protecting sensitive information.

## Note on query()

Since the remote CouchDB doesn't have accesss to the untransformed document, map/reduce functions that are executed directly against CouchDB will be applied to the untransformed version. PouchDB doesn't have this limitation, because everything is local.

So for instance, if you try to `emit()` an encrypted field in your map function:

```js
function (doc) {
  emit(doc.secret, 'shhhhh');
}
```

... the emitted key will be encrypted when you `query()` the remote database, but decrypted when you `query()` a local database. So be aware that the `query()` functionality is not exactly the same.

## Building

You can build transform-pouch for the browser with `npm run build`:

    npm install
    npm run build

This will place browser bundles, minified and unminified, in the `dist/` folder.

## Testing

You can run the test suite with `npm test`.

To run tests in Node specifically, using LevelDB:

    npm run test:node

You can also run tests in a headless browser with [mochify](https://www.npmjs.com/package/mochify):

    npm run test:browser

You can also check for code coverage using:

    npm run coverage

You can run single test using options from [mocha](https://www.npmjs.com/package/mocha):

```
TEST_DB=local npm run test:node -- --reporter spec --grep search_phrase
```

The `TEST_DB` environment variable specifies the database that PouchDB should use.
You may specify either `local` (which uses LevelDB) or `http` (which uses the `$COUCH_URL` environment variable to connect to a CouchDB installation.)

# License

[Apache-2.0](./LICENSE)
