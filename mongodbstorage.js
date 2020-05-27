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

var mongo = require('mongodb')
var when = require('when')
var util = require('util')

var settings

var mongodb
var appname

//var heartBeatLastSent = (new Date()).getTime();
//
//setInterval(function () {
//    var now = (new Date()).getTime();
//    if (mongodb && now - heartBeatLastSent > 15000) {
//        heartBeatLastSent = now;
//        mongodb.command({ ping: 1}, function (err, result) {});
//    }
//}, 15000);

function jconv(credentials) {
  var jconvs = {}
  for (id in credentials) {
    jconvs[id.replace('_', '.')] = credentials[id]
  }
  return jconvs
}

function bconv(credentials) {
  var bconvs = {}
  for (id in credentials) {
    bconvs[id.replace('.', '_')] = credentials[id]
  }
  return bconvs
}

const db = async () => {
  return new Promise((resolve, reject) => {
    if (!mongodb) {
      mongo.MongoClient.connect(
        settings.mongoUrl,
        {
          db: {
            retryMiliSeconds: 1000,
            numberOfRetries: 3
          },
          server: {
            poolSize: 1,
            auto_reconnect: true,
            socketOptions: {
              socketTimeoutMS: 10000,
              keepAlive: 1
            }
          }
        },
        (err, _db) => {
          if (err) {
            util.log('Mongo DB error:' + err)
            reject(err)
          } else {
            mongodb = _db
            resolve(_db)
          }
        }
      )
    } else {
      resolve(mongodb)
    }
  })
}

const getCollection = async (collectionName) => {
  const _db = await db()
  const _collection = await new Promise((resolve, reject) => {
    _db.collection(
      settings.mongoCollection || collectionName,
      (err, _collection) => {
        if (err) {
          util.log('Mongo DB error:' + err)
          reject(err)
        } else {
          resolve(_collection)
        }
      }
    )
  })
  return _collection
}

const mainCollection = async () => {
  return getCollection('nodered')
}

const libCollection = async () => {
  return getCollection('nodered' + '-lib')
}

function close() {
  return when.promise(function (resolve, reject, notify) {
    if (mongodb) {
      mongodb.close(true, function (err, result) {
        if (err) {
          util.log('Mongo DB error:' + err)
          reject(err)
        } else {
          resolve()
        }
      })
      mongodb = null
    }
  })
}

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
        close()
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

const getCollectionData = async () => {
  let collection = await mainCollection()
  let data = await new Promise((resolve, reject) => {
    collection.findOne({ appname: appname }, function (err, doc) {
      if (err) {
        reject(err)
      } else {
        resolve(doc)
      }
    })
  })
  return data
}

function getFlows() {
  console.log('getFlows')
  return when.promise(async (resolve, reject, notify) => {
    try {
      const data = await getCollectionData()
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
      await saveDataToMongoDBCollection({ appname, flow: flows })
      let secureLink = process.env.SECURE_LINK
      await saveDataToMongoDBCollection({ secureLink })
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
      const data = await getCollectionData()
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
      await saveDataToMongoDBCollection({
        appname,
        credentials: bconv(credentials)
      })
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
      const data = await getCollectionData()
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
      await saveDataToMongoDBCollection({
        appname,
        settings: bconv(settings)
      })
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

const saveDataToMongoDBCollection = async (data) => {
  return new Promise((resolve, reject) => {
    data['appname'] = appname
    mainCollection()
      .then((collection) => {
        collection.update(
          { appname: appname },
          { $set: data },
          { upsert: true },
          (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          }
        )
      })
      .catch((err) => {
        reject(err)
      })
  })
}

function getLibraryEntry(type, path) {
  var defer = when.defer()
  libCollection()
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
  libCollection()
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
