var path = require('path')
var when = require('when')

var userDir = path.resolve(__dirname)

var settings = {
  debugMaxLength: 10000000,
  autoInstallModules: true,
  httpAdminRoot: '/red',
  httpNodeRoot: '/',
  nodesDir: path.join(__dirname, 'nodes'),
  functionGlobalContext: {}, // enables global context
  httpNodeCors: {
    origin: '*',
    methods: 'GET,PUT,POST,DELETE'
  },
  editorTheme: {
    userMenu: false,
    page: {
      title: '',
      favicon: path.join(userDir, 'node-red', 'img', 'favicon.ico'),
      css: path.join(userDir, 'node-red', 'css', 'index.css')
    },
    header: {
      title: '',
      image: path.join(userDir, 'node-red', 'img', 'enebular_logo.svg')
    },
    palette: {
      editable: true
    },
    httpNodeCors: {
      origin: '*',
      methods: 'GET,PUT,POST,DELETE'
    },
    menu: {
      'menu-item-import-library': true,
      'menu-item-export-library': true
    }
  },
  adminAuth: {
    type: 'credentials',
    users: function (username) {
      if (process.env.USERNAME == username) {
        return when.resolve({ username: username, permissions: '*' })
      } else {
        return when.resolve(null)
      }
    },
    authenticate: function (username, password) {
      if (
        process.env.USERNAME == username &&
        process.env.PASSWORD == password
      ) {
        return when.resolve({ username: username, permissions: '*' })
      } else {
        return when.resolve(null)
      }
    }
  }
}

if (process.env.ISSUER) {
  settings.storageModule = require('./pgstorage')
  settings.enebularHost = process.env.ISSUER || 'http://localhost:7000'
  settings.enebularUrl = settings.enebularHost
  settings.secure_link = process.env.SECURE_LINK
  settings.flow_expired = Number(process.env.FLOW_EXPIRED)
  settings.pgAppname = 'enebular'
} else {
  settings.userDir = path.join(__dirname)
}

module.exports = settings
