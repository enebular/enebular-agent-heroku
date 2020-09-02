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
var pgutil = require('./pgutil')
const e = require('express')

var settings
var appname

function timeoutWrap(func) {
  return when.promise(function (resolve, reject, notify) {
    var promise = func().timeout(5000, 'timeout')
    promise.then(function (a, b, c, d) {
      //heartBeatLastSent = (new Date()).getTime();
      resolve(a, b, c, d)
    })
    promise.otherwise(function (err) {
      console.log('func', func)
      console.log('timeout err', err)
      console.log('TIMEOUT: ', func.name)
      if (err == 'timeout') {
        reject(err)
      }
    })
  })
}

function getFlows() {
  console.log('getFlows')
  return when.promise(async (resolve, reject, notify) => {
    try {
      const data = await pgutil.loadConfig(appname)
      if (data && data.flows) {
        resolve(data.flows)
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
      let secureLink = process.env.SECURE_LINK
      await pgutil.saveConfig(appname, { appname, flows, secureLink })
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
      const data = await pgutil.loadConfig(appname)
      console.log('********* getCredentials data', data)
      if (data && data.credentials) {
        console.log('********* getCredentials resolve')
        resolve(data.credentials)
      } else {
        console.log('********* getCredentials reject {}')
        resolve({})
      }
    } catch (err) {
      console.log('********* getCredentials reject', err)
      reject(err)
    }
  })
}

function saveCredentials(credentials) {
  console.log('saveCredentials')
  return when.promise(async (resolve, reject, notify) => {
    try {
      await pgutil.saveConfig(appname, { appname, credentials })
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
      const data = await pgutil.loadConfig(appname)
      if (data && data.settings) {
        resolve(data.settings)
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
      await pgutil.saveConfig(appname, { appname, settings })
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

function getLibraryEntry(type, path) {
  console.log('getLibraryEntry', type, path)
  return when.promise(async (resolve, reject, notify) => {
    try {
      const data = await pgutil.loadLib(appname, type, path)
      if (data && data.body) {
        // データを要求された場合は見つかったデータを返す
        resolve(data.body)
      } else {
        // ディレクトリを指定された場合はそのパスに存在するデータの一覧を返す
        if (path != '' && path.substr(-1) != '/') {
          path = path + '/'
        }
        let list = await pgutil.loadLibList(appname, type, path)
        let dirs = []
        let files = []
        for (var i = 0; i < list.length; i++) {
          let d = list[i]
          let subpath = d.path.substr(path.length)
          let parts = subpath.split('/')
          if (parts.length == 1) {
            let meta = d.meta
            meta.fn = parts[0]
            files.push(meta)
          } else if (dirs.indexOf(parts[0]) == -1) {
            dirs.push(parts[0])
          }
        }
        resolve(dirs.concat(files))
        /*        libCollection
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
          })*/
      }
    } catch (err) {
      reject(err)
    }
  })
}

function saveLibraryEntry(type, path, meta, body) {
  console.log('saveLibraryEntry', type, path, meta, body)
  return when.promise(async (resolve, reject, notify) => {
    try {
      await pgutil.saveLib(appname, {
        appname,
        type,
        path,
        meta,
        body,
      })
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

var pgstorage = {
  init: function (_settings) {
    settings = _settings
    appname = settings.pgAppname || require('os').hostname()
    return when.promise(async (resolve, reject, notify) => {
      try {
        const _pool = pgutil.initPG()
        // _poolを返却することで正しい？
        resolve(_pool)
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
    return timeoutWrap(getSettings)
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
  mapNodeTypes: function (flows, credentials) {
    // extract credential type from flows
    for (let props in credentials) {
      for (let i = 0; i < flows.length; i++) {
        const item = flows[i]
        if (item.id === props) {
          credentials[props].type = item.type
          break
        }
      }
    }
    return credentials
  },
}

module.exports = pgstorage
