var fs = require('fs')
var path = require('path')
var http = require('http')
var express = require('express')
var session = require('express-session')
var RED = require('@uhuru/node-red')
var settings = require('./settings')
var bodyParser = require('body-parser')
var app = express()
var installNodes = require('./nodes-installer')
const pgutil = require('./pgutil')

pgutil.initPG()
// Postgresにテーブルを作成する。フローがデプロイされる前に実施する(2回目以降はSQLにIF NOT EXITSを付けているため実施されない)。
pgutil.createTable()

var server = http.createServer(app)

app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: '10mb'
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

if (process.env.SECURE_LINK) {
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
      console.error('install error', err)
    })
} else {
  console.log('secure link not found')
  var port = process.env.PORT || 1880
  server.listen(port)
}
