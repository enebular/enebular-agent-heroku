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

var request = require('request')
var mongo = require('mongodb')
var when = require('when')
var util = require('util')
var RED = require('@uhuru/enebular-node-red')
var fs = require('fs')

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

const privateNodeCollection = async () => {
  return getCollection('nodered' + '-privatenode')
}

const removePrivateNodeCollection = async () => {
  let collection = await privateNodeCollection()
  await new Promise((resolve, reject) => {
    collection.drop((err, delOK) => {
      if (err) {
        reject(err)
      } else {
        if (delOK) {
          console.log('Collection deleted')
          resolve()
        }
      }
    })
  })
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
      let secureLinkSame = await isSecureLinkSame()
      if (!secureLinkSame) {
        await prepareEnebularFlow()
      }
      const data = await getCollectionData()
      if (data && data.packages) {
        await installPackages(data.packages)
      }
      if (data && dattat.flow) {
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
        resolve(jconv(doc.settings))
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

const isSecureLinkSame = async () => {
  let doc = await getCollectionData()
  if (doc && doc.secureLink && doc.secureLink === process.env.secure_link) {
    return true
  } else {
    return false
  }
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
    .otherwise(function (err) {
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
    .otherwise(function (err) {
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
  },

  // test
  db: db,
  getCollection: getCollection,
  mainCollection: mainCollection
}

const downloadAndSavePrivateNode = async (packageName, url) => {
  const { err, res, body } = await new Promise((resolve, reject) => {
    request.get(url, { encoding: null }, (err, res, body) => {
      resolve(err, res, body)
    })
  })
  if (err) {
    throw err
  } else {
    if (res.statusCode != 200) {
      console.error('Failed to download privatenode' + res.statusCode)
      throw new Error(
        'Failed to download privatenode: status code:' + res.statusCode
      )
    } else {
      let collection = await privateNodeCollection()
      let buffer = new Buffer.from(body)
      let base64str = buffer.toString('base64')
      let privateNodeInfo = { packageName: packageName, data: base64str }
      await new Promise((resolve, reject) => {
        collection.insertOne(privateNodeInfo, (err, res) => {
          if (err) {
            reject(err)
          } else {
            console.log(res)
            resolve()
          }
        })
      })
    }
  }
}

const savePrivateNodeFilesToMongoDB = async (packages) => {
  if (!packages) {
    return
  }
  await removePrivateNodeCollection()
  for (let name in packages) {
    if (
      typeof packages[name] === 'object' &&
      packages[name].type === 'privatenode'
    ) {
      await downloadAndSavePrivateNode(name, packages[name].url)
    }
  }
}

const installPrivateNodePackage = async (packageName) => {
  const collection = await privateNodeCollection()
  let doc = await new Promise((resolve, reject) => {
    collection.findOne({ packageName: packageName }, (err, doc) => {
      if (err) {
        reject(err)
      } else {
        if (doc && doc.data) {
          resolve(doc)
        } else {
          reject(
            new Error(`Failed to find private node packages: ${packageName}`)
          )
        }
      }
    })
  })
  // Save data to /tmp
  let data = new Buffer(doc.data, 'base64')
  await new Promise((resolve, reject) => {
    fs.writeFile(`/tmp/${packageName}.tgz`, data, function (err) {
      if (err) {
        console.error('Failed to save privatenode file: ' + packageName)
        reject(new Error('Failed to save privatenode file: ' + packageName))
      }
    })
    // install
    RED.nodes
      .installModule(`file:/tmp/${packageName}.tgz`)
      .then(() => {
        resolve()
      })
      .catch((err) => {
        reject(err)
      })
  })
}

const installPackages = async (packages) => {
  if (!packages && !names) {
    return
  }
  for (let name in packages) {
    if (
      typeof packages[name] === 'object' &&
      packages[name].type === 'privatenode'
    ) {
      await installPrivateNodePackage(name)
    } else {
      await new Promise((resolve, reject) => {
        RED.nodes
          .installModule(packages[name])
          .then(() => {
            resolve()
          })
          .catch((err) => {
            console.error(`install err ${name}`, err)
            reject(err)
          })
      })
    }
  }
}

// enebular
// Save flow/credentials/packages/secureLink information to MongoDB
// Save PrivateNode to MongoDB if exists
const prepareEnebularFlow = async () => {
  var url = process.env.SECURE_LINK
  const data = await new Promise((resolve, reject) => {
    request.get({ url: url, json: false }, (err, res, body) => {
      if (err) {
        reject(err)
        return
      }
      if (res.statusCode != 200) {
        resolve(null)
        return
      }
      if (body) {
        let data = JSON.parse(body)
        resolve(data)
      }
    })
  })
  if (data && data.flow) {
    await saveDataToMongoDBCollection({ flow: data.flow })
  }
  if (data && data.credentials) {
    await saveDataToMongoDBCollection({
      credentials: bconv(data.credentials)
    })
  }
  if (data && data.packages) {
    await saveDataToMongoDBCollection({ packages: data.packages })
    await savePrivateNodeFilesToMongoDB(data.packages)
  }
  await saveDataToMongoDBCollection({ secureLink: url })
}

module.exports = mongostorage
