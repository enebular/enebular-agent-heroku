var fs = require('fs');
var path = require('path');
var http = require('http');
var express = require('express');
var session = require('express-session');
var RED = require('node-red');
var settings = require('./settings');
var bodyParser = require('body-parser');
var app = express();

var server = http.createServer(app);

app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({ secret: '4r13ysgyYD' }));

var JWTAuth = require('./jwt');

var public_key_path = process.env.PUBLIC_KEY_PATH || './public.pem';
app.all("/red/*", JWTAuth(public_key_path, {
  issuer: process.env.ISSUER
}));

app.use('/red', express.static('public'));
app.set('view engine', 'ejs');

RED.init(server, settings);
app.use(settings.httpAdminRoot, RED.httpAdmin);
app.use(settings.httpNodeRoot, RED.httpNode);
var port = process.env.PORT || 1880;
server.listen(port);

RED.start();

app.post("/sys/restart", function(req, res) {
	var user_id = req.param('USER_ID');
	var project_id = req.param('PROJECT_ID');
	var flow_id = req.param('FLOW_ID');
	var access_token = req.param('ACCESS_TOKEN');
	console.log(user_id);
	process.send({event:"restart", envs:{
		USER_ID: user_id,
		PROJECT_ID: project_id,
		FLOW_ID: flow_id,
		ACCESS_TOKEN: access_token
	}});
	res.json({err:null});
});
