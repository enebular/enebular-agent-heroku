var request = require('request')
const path = require('path')
const { promisify } = require('util')
const { execFile } = require('child_process')
const execFileAsync = promisify(execFile)
const settings = require('./settings')
var fs = require('fs')
var mongo = require('mongodb')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

var mongodb
var appname

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
            console.error('Mongo DB error:' + err)
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
          console.error('Mongo DB error:' + err)
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

function close() {
  return new Promise((resolve, reject) => {
    if (mongodb) {
      mongodb.close(true, function (err, result) {
        if (err) {
          console.error('Mongo DB error:' + err)
          reject(err)
        } else {
          resolve()
        }
      })
      mongodb = null
    }
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

const needDownloadFlow = async () => {
  let doc = await getCollectionData()
  if (!process.env.SECURE_LINK) {
    console.log('***** SECURE_LINK', process.env.SECURE_LINK)
    return false
  }
  if (doc && doc.secureLink && doc.secureLink === process.env.SECURE_LINK) {
    return false
  } else {
    return true
  }
}

const downloadAndSavePrivateNode = async (packageName, url) => {
  console.log('downloadAndSavePrivateNode:', packageName, url)
  const { err, res, body } = await new Promise((resolve, reject) => {
    request.get(url, { encoding: null }, (err, res, body) => {
      console.log(`download ${packageName} `, err, res, body)
      resolve({ err, res, body })
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
  console.log('savePrivateNodeFilesToMongoDB', packages)
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

// npmを使ったインストールを行う
// packageは以下の2パタンを想定
// ・<package name>@<version>
// ・<File(tgz) path>
const installNPMModule = async (package) => {
  let result = await execFileAsync(npmCommand, ['install', package], {
    cwd: path.resolve(__dirname)
  })
  return result
}

const installPrivateNodePackage = async (packageName) => {
  console.log('installPrivateNodePackage:' + packageName)
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
  let data = Buffer.from(doc.data, 'base64')
  await new Promise((resolve, reject) => {
    console.log(`save /tmp/${packageName}.tgz`)
    fs.writeFile(`/tmp/${packageName}.tgz`, data, (err) => {
      if (err) {
        console.error('Failed to save privatenode file: ' + packageName)
        reject(err)
        return
      }
      //Test check file
      if (fs.existsSync(`/tmp/${packageName}.tgz`)) {
        console.log('success save privatenode !')
      } else {
        console.log('fail save privatenode !')
      }
      // install
      console.log(`install file:/tmp/${packageName}.tgz`)
      installNPMModule(`file:/tmp/${packageName}.tgz`)
        .then((result) => {
          resolve(result)
        })
        .catch((err) => {
          reject(err)
        })
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
      /*} else {
      // 通常のNodeのインストールはNode-REDに任せることとしここでは実行しない
      await new Promise((resolve, reject) => {
        installNPMModule(`${name}@${packages[name]}`)
          .then((result) => {
            resolve(result)
          })
          .catch((err) => {
            reject(err)
          })
      })*/
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
  let flow = data && data.flow ? data.flow : []
  await saveDataToMongoDBCollection({ flow })
  let credentials = data && data.cred ? data.cred : {}
  await saveDataToMongoDBCollection({
    credentials: bconv(credentials)
  })
  if (data && data.packages) {
    await saveDataToMongoDBCollection({ packages: data.packages })
    await savePrivateNodeFilesToMongoDB(data.packages)
  }
  await saveDataToMongoDBCollection({ secureLink: url })
}

const main = async () => {
  try {
    console.time('prestart script')
    appname = settings.mongoAppname || require('os').hostname()
    console.log('Presigned URLからFlowの取得が必要か判定')
    const need = await needDownloadFlow()
    if (need) {
      console.log('Download flow pack from S3')
      await prepareEnebularFlow()
    }
    // Node-REDのノード(プライベートノード含む)のインストール
    console.log('install privatenodes')
    const data = await getCollectionData()
    if (data && data.packages) {
      await installPackages(data.packages)
    }
    console.timeEnd('prestart script')
  } catch (err) {
    //TODO: エラーの場合はDynoの再起動を促すように例外をスローすべきか検討必要
    console.error('prestart script error', err)
    console.timeEnd('prestart script')
  } finally {
    close()
  }
}

main().then(() => {
  console.log('finish main')
})
