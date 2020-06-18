const request = require('request')
const path = require('path')
const { promisify } = require('util')
const { execFile } = require('child_process')
const execFileAsync = promisify(execFile)
const fs = require('fs')
const mutil = require('./mongodbutil')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

let appname

const needDownloadFlow = async () => {
  let doc = await mutil.getCollectionData(appname)
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

const savePrivateNodeFilesToMongoDB = async (packages) => {
  console.log('savePrivateNodeFilesToMongoDB', packages)
  if (!packages) {
    return
  }
  for (let name in packages) {
    if (
      typeof packages[name] === 'object' &&
      packages[name].type === 'privatenode'
    ) {
      await downloadAndSavePrivateNode(name, packages[name].url)
    }
  }
}

const downloadAndSavePrivateNode = async (packageName, url) => {
  console.log('downloadAndSavePrivateNode:', packageName, url)
  const { err, res, body } = await new Promise((resolve, reject) => {
    request.get(url, { encoding: null }, (err, res, body) => {
      //console.log(`download ${packageName} `, err, res, body)
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
      let collection = await mutil.privateNodeCollection()
      let buffer = new Buffer.from(body)
      let base64str = buffer.toString('base64')
      let privateNodeInfo = { packageName: packageName, data: base64str }
      await new Promise((resolve, reject) => {
        collection.insertOne(privateNodeInfo, (err, res) => {
          if (err) {
            reject(err)
          } else {
            // console.log(res)
            resolve()
          }
        })
      })
    }
  }
}

// npmを使ったインストールを行う
// packageは以下の2パタンのパッケージ文字列の配列
// ・<package name>@<version>
// ・<File(tgz) path>
const installNPMModule = async (packages) => {
  let result = await execFileAsync(npmCommand, ['install', ...packages], {
    cwd: path.resolve(__dirname)
  })
  return result
}

const getPrivateNodePackageStringForInstall = async (packageName) => {
  console.log('installPrivateNodePackage:' + packageName)
  const collection = await mutil.privateNodeCollection()
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
  let packageString = await new Promise((resolve, reject) => {
    console.log(`save /tmp/${packageName}.tgz`)
    fs.writeFile(`/tmp/${packageName}.tgz`, data, (err) => {
      if (err) {
        console.error('Failed to save privatenode file: ' + packageName)
        return reject(err)
      }
      //Test check file
      if (fs.existsSync(`/tmp/${packageName}.tgz`)) {
        console.log('success save privatenode !')
      } else {
        console.log('fail save privatenode !')
      }
      // return package string
      console.log(`install file:/tmp/${packageName}.tgz`)
      resolve(`file:/tmp/${packageName}.tgz`)
    })
  })
  return packageString
}

const installPackages = async (packages) => {
  if (!packages) {
    return
  }
  const names = Object.keys(packages)
  let packageStrings = await Promise.all(
    names.map((name) => {
      if (
        typeof packages[name] === 'object' &&
        packages[name].type === 'privatenode'
      ) {
        return getPrivateNodePackageStringForInstall(name)
      } else {
        // ユーザがインストールしたノードのパッケージ文字列取得
        return `${name}@${packages[name]}`
      }
    })
  )
  await new Promise((resolve, reject) => {
    console.log(`install nodes: ${packageStrings}`)
    installNPMModule(packageStrings)
      .then((result) => {
        console.log(`install node packages success: ${packageStrings}`)
        resolve(result)
      })
      .catch((err) => {
        console.log(`install node packages fail: ${packageStrings}`, err)
        reject(err)
      })
  })
}

// enebular
// Save flow/credentials/packages/secureLink information to MongoDB
// Save PrivateNode to MongoDB if exists
const prepareEnebularFlow = async () => {
  var url = process.env.SECURE_LINK
  if (!url) {
    throw new Error('SECURE_LINK not defined')
  }
  await mutil.removePrivateNodeCollection()
  await mutil.saveDataToMongoDBCollection({ settings: null }, appname)
  const data = await new Promise((resolve, reject) => {
    request.get({ url: url, json: false }, (err, res, body) => {
      if (err) {
        return reject(err)
      }
      if (res.statusCode != 200) {
        return resolve(null)
      }
      if (body) {
        let data = JSON.parse(body)
        resolve(data)
      }
    })
  })
  let flow = data && data.flow ? data.flow : []
  await mutil.saveDataToMongoDBCollection({ flow }, appname)
  let credentials = data && data.cred ? data.cred : {}
  await mutil.saveDataToMongoDBCollection(
    {
      credentials: mutil.bconv(credentials)
    },
    appname
  )
  if (data && data.packages) {
    await mutil.saveDataToMongoDBCollection(
      { packages: data.packages },
      appname
    )
    await savePrivateNodeFilesToMongoDB(data.packages)
  }
  await mutil.saveDataToMongoDBCollection({ secureLink: url }, appname)
}

const installNodes = async () => {
  try {
    appname = require('./settings').mongoAppname || require('os').hostname()
    console.log('Presigned URLからFlowの取得が必要か判定')
    const need = await needDownloadFlow()
    if (need) {
      console.log('Download flow pack from S3')
      await prepareEnebularFlow()
    }
    // Node-REDのノード(プライベートノード含む)のインストール
    const data = await mutil.getCollectionData(appname)
    if (data && data.packages) {
      await installPackages(data.packages)
    }
  } catch (err) {
    throw err
  } finally {
    mutil.close()
  }
}

module.exports = installNodes
