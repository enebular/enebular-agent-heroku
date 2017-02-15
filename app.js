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

/*
var JWTAuth = require('./jwt');

var public_key_path = process.env.PUBLIC_KEY_PATH || './public.pem';

app.all("/red/*", JWTAuth(public_key_path, {
  issuer: process.env.ISSUER
}));
*/

app.use('/red', express.static('public'));
app.set('view engine', 'ejs');

RED.init(server, settings);
app.use(settings.httpAdminRoot, RED.httpAdmin);
app.use(settings.httpNodeRoot, RED.httpNode);
var port = process.env.PORT || 1880;
server.listen(port);

if(process.env.USER_ID && process.env.PROJECT_ID) {
	RED.start();
	app.get("/red/envs", function(req, res) {
	    res.header("Access-Control-Allow-Origin", settings.enebularHost);
	    res.header("Access-Control-Allow-Credentials", true);
		res.json({
			user_id : process.env.USER_ID,
			project_id : process.env.PROJECT_ID,
			flow_id : process.env.FLOW_ID
		});
	});
	app.get("/red/setcookie", function(req, res) {
		res.redirect(process.env.ISSUER + '/auth/spot/'+process.env.PROJECT_ID+'/'+process.env.FLOW_ID+'?setcookie=true');
	});
}else{
	app.get("/", handle);
	app.get("/red", handle);
	function handle(req, res) {
		res.status(403).send("Forbidden");
	}
}
