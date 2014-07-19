Filter Pouch
=====

[![Build Status](https://travis-ci.org/nolanlawson/filter-pouch.svg)](https://travis-ci.org/nolanlawson/filter-pouch)

Apply a **filter function** to documents before and after they are stored in the database. These functions apply invisibly to `get()`, `put()`, `post()`, `bulkDocs()`, `allDocs()`, and also to documents added via replication.

There are a few different uses for this:

* Encrypt and decript sensitive document fields
* Compress and uncompress large content before storing
* Remove fields, add fields, or modify user-provided fields

Usage
----------

To use this plugin, include it after `pouchdb.js` in your HTML page:

```html
<script src="pouchdb.js"></script>
<script src="pouchdb.filter-pouch.js"></script>
```

Or to use it in Node.js, just npm install it:

```
npm install filter-pouch
```

And then attach it to the `PouchDB` object:

```js
var PouchDB = require('pouchdb');
PouchDB.plugin(require('filter-pouch'));
```

API
--------

When you instantiate a new DB, initiate the filtering like so:

```js
var pouch = new PouchDB('mydb');
pouch.filter({
  incoming: function (doc) {
    // do something to the document before storage
    return doc;
  }
  outgoing: function (doc) {
    // do something to the document before storage
    return doc;
  }
});
```

You can provide an `incoming` function, an `outgoing` function, or both.

Your filter functions **must** return the document itself or a new document.

Example: Encryption
----------

Using the Node.js crypto library (you would need something different in a browser), let's first set up our encrypt/decrypt functions:

```js
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
```

Obviously you would want to change the `'password'` to be something only the user knows!

Next, let's set up our filters:

```js
pouch.filter({
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
```

Now, the documents are encrypted whenever they're stored in the database. If you want to verify, try opening them with a `Pouch` where you haven't set up any `filters`.  You'll see documents like:

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

Building
----
    npm install
    npm run build


Testing
----

### In Node

This will run the tests in Node using LevelDB:

    npm test
    
You can also check for 100% code coverage using:

    npm run coverage

If you have mocha installed globally you can run single test with:
```
TEST_DB=local mocha --reporter spec --grep search_phrase
```

The `TEST_DB` environment variable specifies the database that PouchDB should use (see `package.json`).

### In the browser

Run `npm run dev` and then point your favorite browser to [http://127.0.0.1:8001/test/index.html](http://127.0.0.1:8001/test/index.html).

The query param `?grep=mysearch` will search for tests matching `mysearch`.

### Automated browser tests

You can run e.g.

    CLIENT=selenium:firefox npm test
    CLIENT=selenium:phantomjs npm test

This will run the tests automatically and the process will exit with a 0 or a 1 when it's done. Firefox uses IndexedDB, and PhantomJS uses WebSQL.