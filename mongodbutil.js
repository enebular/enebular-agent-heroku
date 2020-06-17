var mongo = require('mongodb')
var when = require('when')
var util = require('util')

var settings

var mongodb

exports.jconv = (credentials) => {
  var jconvs = {}
  for (id in credentials) {
    jconvs[id.replace('_', '.')] = credentials[id]
  }
  return jconvs
}

exports.bconv = (credentials) => {
  var bconvs = {}
  for (id in credentials) {
    bconvs[id.replace('.', '_')] = credentials[id]
  }
  return bconvs
}

exports.db = async () => {
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

exports.getCollection = async (collectionName) => {
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

exports.mainCollection = async () => {
  return getCollection('nodered')
}

exports.libCollection = async () => {
  return getCollection('nodered' + '-lib')
}

exports.getCollectionData = async (appname) => {
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

exports.saveDataToMongoDBCollection = async (data, appname) => {
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

exports.privateNodeCollection = async () => {
  return getCollection('nodered' + '-privatenode')
}

exports.removePrivateNodeCollection = async () => {
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

exports.close = () => {
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
