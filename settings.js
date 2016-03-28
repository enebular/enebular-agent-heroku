var path = require('path');

var settings = {
  debugMaxLength: 10000000,
  autoInstallModules: true,
  httpAdminRoot: '/red',
  httpNodeRoot: '/',
  nodesDir: path.join(__dirname, 'nodes'),
  functionGlobalContext: { },    // enables global context
  httpNodeCors: {
    origin: "*",
    methods: "GET,PUT,POST,DELETE"
  }
};

if (process.env.ISSUER && process.env.USER_ID) {
  settings.storageModule = require('./enebularstorage');
  settings.enebularUrl = process.env.ISSUER ? (process.env.ISSUER + '/api') : "http://localhost:7000/api";
  settings.userId = process.env.USER_ID;
  settings.projectId = process.env.PROJECT_ID;
  settings.flowId = process.env.FLOW_ID;
  settings.accessToken = process.env.ACCESS_TOKEN;
  settings.mongoUrl = process.env.MONGO_URI || process.env.MONGOLAB_URI;
  settings.mongoAppname = 'enebular';
} else {
  settings.userDir = path.join(__dirname);
}

module.exports = settings;