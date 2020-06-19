var mongo = require('mongodb')
var when = require('when')
var util = require('util')

var mongodb

// mongodbに保存できるようにキーに以下の変更を加える
// ・先頭に_を入れる($始まりは許されないため)
// ・.を_に変更する
const bconv = (credentials) => {
  var bconvs = {}
  for (id in credentials) {
    bconvs['_' + id.replace('.', '_')] = credentials[id]
  }
  return bconvs
}
// mongodbから取得する際に元のキーに戻す
const jconv = (credentials) => {
  var jconvs = {}
  for (id in credentials) {
    id = id.substring(1)
    jconvs[id.replace('_', '.')] = credentials[id]
  }
  return jconvs
}

const db = async () => {
  return new Promise((resolve, reject) => {
    if (!mongodb) {
      settings = require('./settings')
      console.log('test******************', settings)
      console.log('test******************', settings.mongoUrl)
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

const getCollectionData = async (appname) => {
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

const saveDataToMongoDBCollection = async (data, appname) => {
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

const privateNodeCollection = async () => {
  return getCollection('nodered' + '-privatenode')
}

const removePrivateNodeCollection = async () => {
  let collection = await privateNodeCollection()
  await new Promise((resolve, reject) => {
    collection.drop((err, delOK) => {
      if (err) {
        // ignore drop collection error because it's happend first time deploy
        console.log('Failed to drop collection but ignored: ', err)
        resolve()
      } else {
        if (delOK) {
          console.log('Collection deleted')
          resolve()
        }
      }
    })
  })
}

const close = () => {
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

exports.jconv = jconv
exports.bconv = bconv
exports.db = db
exports.getCollection = getCollection
exports.mainCollection = mainCollection
exports.libCollection = libCollection
exports.getCollectionData = getCollectionData
exports.saveDataToMongoDBCollection = saveDataToMongoDBCollection
exports.privateNodeCollection = privateNodeCollection
exports.removePrivateNodeCollection = removePrivateNodeCollection
exports.close = close
