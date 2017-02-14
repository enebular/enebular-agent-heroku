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
  settings.storageModule = require('./mongodbstorage');
  settings.enebularHost = process.env.ISSUER || "http://localhost:7000";
  settings.enebularUrl = settings.enebularHost + '/api';
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