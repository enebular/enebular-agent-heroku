var fs = require('fs')
var path = require('path')
var http = require('http')
var express = require('express')
var session = require('express-session')
var RED = require('@uhuru/enebular-node-red')
var settings = require('./settings')
var bodyParser = require('body-parser')
var app = express()
var installNodes = require('./nodes-installer')

var server = http.createServer(app)

app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: '10mb',
  })
)

app.use(bodyParser.json({ extended: true, limit: '10mb' }))

app.use(session({ secret: '4r13ysgyYD' }))

/*
var JWTAuth = require('./jwt');

var public_key_path = process.env.PUBLIC_KEY_PATH || './public.pem';

app.all("/red/*", JWTAuth(public_key_path, {
  issuer: process.env.ISSUER
}));
*/

app.use('/red', express.static('public'))
app.set('view engine', 'ejs')

RED.init(server, settings)
app.use(settings.httpAdminRoot, RED.httpAdmin)
app.use(settings.httpNodeRoot, RED.httpNode)
app.get('/', function (req, res) {
  res.redirect('/red')
})

console.time('nodes install')
installNodes()
  .then(() => {
    console.timeEnd('nodes install')
    RED.start()
    var port = process.env.PORT || 1880
    server.listen(port)
  })
  .catch((err) => {
    console.timeEnd('nodes install')
    //TODO: エラーの場合はDynoの再起動を促すように例外をスローすべきか検討必要
    console.error('privatenode install error', err)
  })
