/**
 * Copyright 2014 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var when = require('when')
var mutil = require('./mongodbutil')

var settings

var appname = require('./settings').mongoAppname || require('os').hostname()

function timeoutWrap(func) {
  return when.promise(function (resolve, reject, notify) {
    var promise = func().timeout(5000, 'timeout')
    promise.then(function (a, b, c, d) {
      //heartBeatLastSent = (new Date()).getTime();
      resolve(a, b, c, d)
    })
    promise.otherwise(function (err) {
      console.log('TIMEOUT: ', func.name)
      if (err == 'timeout') {
        mutil
          .close()
          .then(function () {
            resolve(func())
          })
          .otherwise(function (err) {
            reject(err)
          })
      } else {
        reject(err)
      }
    })
  })
}

function getFlows() {
  console.log('getFlows')
  return when.promise(async (resolve, reject, notify) => {
    try {
      const data = await mutil.getCollectionData(appname)
      if (data && data.flow) {
        resolve(data.flow)
      } else {
        resolve([])
      }
    } catch (err) {
      reject(err)
    }
  })
}

function saveFlows(flows) {
  console.log('saveFlows')
  return when.promise(async (resolve, reject, notify) => {
    try {
      await mutil.saveDataToMongoDBCollection({ flow: flows }, appnme)
      let secureLink = process.env.SECURE_LINK
      await mutil.saveDataToMongoDBCollection({ secureLink }, appname)
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

function getCredentials() {
  console.log('getCredentials')
  return when.promise(async (resolve, reject, notify) => {
    try {
      const data = await mutil.getCollectionData(appname)
      if (data && data.credentials) {
        resolve(jconv(data.credentials))
      } else {
        reject({})
      }
    } catch (err) {
      reject(err)
    }
  })
}

function saveCredentials(credentials) {
  console.log('saveCredentials')
  return when.promise(async (resolve, reject, notify) => {
    try {
      await mutil.saveDataToMongoDBCollection(
        {
          credentials: bconv(credentials)
        },
        appname
      )
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

function getSettings() {
  console.log('getSettings')
  return when.promise(async (resolve, reject, notify) => {
    try {
      const data = await mutil.getCollectionData(appname)
      if (data && data.settings) {
        resolve(jconv(data.settings))
      } else {
        resolve({})
      }
    } catch (err) {
      reject(err)
    }
  })
}

function saveSettings(settings) {
  console.log('saveSettings')
  return when.promise(async (resolve, reject, notify) => {
    try {
      await mutil.saveDataToMongoDBCollection(
        {
          settings: bconv(settings)
        },
        appname
      )
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

function getLibraryEntry(type, path) {
  var defer = when.defer()
  mutil
    .libCollection()
    .then(function (libCollection) {
      libCollection.findOne(
        { appname: appname, type: type, path: path },
        function (err, doc) {
          if (err) {
            defer.reject(err)
          } else if (doc) {
            defer.resolve(doc.data)
          } else {
            if (path != '' && path.substr(-1) != '/') {
              path = path + '/'
            }
            libCollection
              .find(
                { appname: appname, type: type, path: { $regex: path + '.*' } },
                { sort: 'path' }
              )
              .toArray(function (err, docs) {
                if (err) {
                  defer.reject(err)
                } else if (!docs) {
                  defer.reject('not found')
                } else {
                  var dirs = []
                  var files = []
                  for (var i = 0; i < docs.length; i++) {
                    var doc = docs[i]
                    var subpath = doc.path.substr(path.length)
                    var parts = subpath.split('/')
                    if (parts.length == 1) {
                      var meta = doc.meta
                      meta.fn = parts[0]
                      files.push(meta)
                    } else if (dirs.indexOf(parts[0]) == -1) {
                      dirs.push(parts[0])
                    }
                  }
                  defer.resolve(dirs.concat(files))
                }
              })
          }
        }
      )
    })
    .catch(function (err) {
      defer.reject(err)
    })
  return defer.promise
}

function saveLibraryEntry(type, path, meta, body) {
  var defer = when.defer()
  mutil
    .libCollection()
    .then(function (libCollection) {
      libCollection.update(
        { appname: appname, type: type, path: path },
        { appname: appname, type: type, path: path, meta: meta, data: body },
        { upsert: true },
        function (err) {
          if (err) {
            defer.reject(err)
          } else {
            defer.resolve()
          }
        }
      )
    })
    .catch(function (err) {
      defer.reject(err)
    })
  return defer.promise
}

var mongostorage = {
  init: function (_settings) {
    settings = _settings
    appname = settings.mongoAppname || require('os').hostname()
    return when.promise(async (resolve, reject, notify) => {
      try {
        const _db = await db()
        resolve(_db)
      } catch (err) {
        reject(err)
      }
    })
  },
  getFlows: function () {
    return timeoutWrap(getFlows)
  },
  saveFlows: function (flows) {
    return timeoutWrap(function () {
      return saveFlows(flows)
    })
  },

  getCredentials: function () {
    return timeoutWrap(getCredentials)
  },

  saveCredentials: function (credentials) {
    return timeoutWrap(function () {
      return saveCredentials(credentials)
    })
  },

  getSettings: function () {
    return timeoutWrap(function () {
      return getSettings()
    })
  },

  saveSettings: function (data) {
    return timeoutWrap(function () {
      return saveSettings(data)
    })
  },

  getLibraryEntry: function (type, path) {
    return timeoutWrap(function () {
      return getLibraryEntry(type, path)
    })
  },
  saveLibraryEntry: function (type, path, meta, body) {
    return timeoutWrap(function () {
      return saveLibraryEntry(type, path, meta, body)
    })
  }
}

module.exports = mongostorage
