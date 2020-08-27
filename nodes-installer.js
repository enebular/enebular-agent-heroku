const request = require('request')
const path = require('path')
const { promisify } = require('util')
const { execFile } = require('child_process')
const execFileAsync = promisify(execFile)
const fs = require('fs')
const pgutil = require('./pgutil')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

let appname

const needDownloadFlow = async () => {
  let data = await pgutil.loadConfig(appname)
  if (!process.env.SECURE_LINK) {
    console.log('***** SECURE_LINK', process.env.SECURE_LINK)
    return false
  }
  if (data && data.secureLink && data.secureLink === process.env.SECURE_LINK) {
    return false
  } else {
    return true
  }
}

const savePrivateNodeFilesToPG = async (packages) => {
  console.log('savePrivateNodeFilesToPG', packages)
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
      let buffer = new Buffer.from(body)
      let base64str = buffer.toString('base64')
      await pgutil.savePrivateNodes(appname, {
        appname,
        packageName,
        data: base64str,
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
    cwd: path.resolve(__dirname),
  })
  return result
}

const getPrivateNodePackageStringForInstall = async (packageName) => {
  console.log('installPrivateNodePackage:' + packageName)
  const data = await pgutil.loadPrivateNodes(appname, packageName)
  if (!data || !data.data) {
    throw new Error(`Failed to find private node packages: ${packageName}`)
  }
  // Save decoded data to /tmp
  let decoded = Buffer.from(doc.data, 'base64')
  let packageString = await new Promise((resolve, reject) => {
    console.log(`save /tmp/${packageName}.tgz`)
    fs.writeFile(`/tmp/${packageName}.tgz`, decoded, (err) => {
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
  await pgutil.removePrivateNodes()
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
  let flows = data && data.flow ? data.flow : []
  let credentials = data && data.cred ? data.cred : {}
  let packages = {}
  if (data && data.packages) {
    packages = data.packages
    savePrivateNodeFilesToPG(packages)
  }
  await pgutil.saveConfig(appname, {
    appname,
    flows,
    credentials,
    packages,
    settings: {},
    secureLink: url,
  })
}

const installNodes = async () => {
  try {
    appname = require('./settings').pgAppname || require('os').hostname()
    console.log('Presigned URLからFlowの取得が必要か判定')
    const need = await needDownloadFlow()
    if (need) {
      console.log('Download flow pack from S3')
      await prepareEnebularFlow()
    }
    // Node-REDのノード(プライベートノード含む)のインストール
    const data = await pgutil.loadConfig(appname)
    if (data && data.packages) {
      await installPackages(data.packages)
    }
  } catch (err) {
    throw err
  }
}

module.exports = installNodes
