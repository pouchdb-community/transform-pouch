'use strict'

const Promise = require('pouchdb-promise')

exports.once = function (fun) {
  let called = false
  return exports.getArguments(function (args) {
    if (called) {
      console.trace()
      throw new Error('once called  more than once')
    } else {
      called = true
      fun.apply(this, args)
    }
  })
}

exports.getArguments = function (fun) {
  return function () {
    const len = arguments.length
    const args = new Array(len)
    let i = -1
    while (++i < len) {
      args[i] = arguments[i]
    }
    return fun.call(this, args)
  }
}

exports.toPromise = function (func) {
  // create the function we will be returning
  return exports.getArguments(function (args) {
    const self = this
    const tempCB = (typeof args[args.length - 1] === 'function') ? args.pop() : false
    // if the last argument is a function, assume its a callback
    let usedCB
    if (tempCB) {
      // if it was a callback, create a new callback which calls it,
      // but do so async so we don't trap any errors
      usedCB = function (err, resp) {
        process.nextTick(function () {
          tempCB(err, resp)
        })
      }
    }
    const promise = new Promise(function (resolve, reject) {
      try {
        const callback = exports.once(function (err, mesg) {
          if (err) {
            reject(err)
          } else {
            resolve(mesg)
          }
        })
        // create a callback for this invocation
        // apply the function in the orig context
        args.push(callback)
        func.apply(self, args)
      } catch (e) {
        reject(e)
      }
    })
    // if there is a callback, call it back
    if (usedCB) {
      promise.then(function (result) {
        usedCB(null, result)
      }, usedCB)
    }
    promise.cancel = function () {
      return this
    }
    return promise
  })
}

exports.inherits = require('inherits')

exports.clone = function (obj) {
  return exports.extend(true, {}, obj)
}

exports.isLocalId = function (id) {
  return (/^_local/).test(id)
}
