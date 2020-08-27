const pg = require('pg')
const when = require('when')
const util = require('util')

let pool

const initPG = () => {
  const pgUrl = process.env.DATABASE_URL
  console.log('pgUrl', pgUrl)
  pool = new pg.Pool({ connectionString: pgUrl })
  return pool
}

const createTable = async () => {
  if (!pool) throw new Error('No PG instance')
  console.log('create pg tables')
  const query = `
    CREATE TABLE IF NOT EXISTS eConfigs (
      id SERIAL PRIMARY KEY,
      appname character varying(255) NOT NULL,
      flows text,
      credentials text,
      packages text,
      settings text,
      secureLink text
    );
    CREATE TABLE IF NOT EXISTS eLibs (
      id SERIAL PRIMARY KEY,
      appname character varying(255) NOT NULL,
      type text,
      path text,
      meta text,
      body text
    );
    CREATE TABLE IF NOT EXISTS ePrivateNodes (
      id SERIAL PRIMARY KEY,
      appname character varying(255) NOT NULL,
      packageName text,
      data text
    );
  `
  await doSQL(query, null)
}

const doSQL = async (query, values) => {
  let client
  try {
    if (!pool) throw new Error('No PG instance')
    client = await pool.connect()
    return await client.query(query, values)
  } finally {
    if (client) {
      client.release()
    }
  }
}

const loadConfig = async (appname) => {
  const query = 'SELECT * FROM eConfigs WHERE appname = $1'
  const data = await doSQL(query, [appname])
  if (data && data.rowCount > 0) {
    let retData = data.rows[0]
    for (let key in retData) {
      if (retData[key]) {
        retData[key] = JSON.parse(retData[key])
      }
    }
    return retData
  }
  return null
}

const saveConfig = async (appname, params) => {
  const columns = [
    'appname',
    'flows',
    'credentials',
    'packages',
    'settings',
    'secureLink',
    'id',
  ]
  let data = await loadConfig(appname)
  let query
  let values
  if (data !== null) {
    data = Object.assign(data, params)
    query =
      'UPDATE eConfig SET appname = $1, flows = $2, credentials = $3, packages = $4, settings = $5, secureLink = $6 WHERE id = $7 RETURNING *'
    values = columns.map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  } else {
    data = params
    query =
      'INSERT INTO eConfigs(appname, flows, credentials, packages, settings, secureLink) VALUES($1, $2, $3, $4, $5, $6) RETURNING *'
    values = columns
      .slice(0, 6)
      .map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  }
  console.log('****************** data', JSON.stringify(data))
  console.log('****************** query', query)
  console.log('****************** values', JSON.stringify(values))
  await doSQL(query, values)
}

const loadLib = async (appname, type, path) => {
  const query =
    'SELECT * FROM eLibs WHERE appname = $1 and type = $2 and path = $3'
  const data = await doSQL(query, [appname, type, path])
  if (data && data.rowCount > 0) {
    return data.rows[0]
  }
  return null
}

const saveLib = async (appname, params) => {
  const columns = ['appname', 'type', 'path', 'meta', 'body', 'id']
  let data = await loadLib(appname, params.type, params.path)
  let query
  let values
  if (data !== null) {
    data = Object.assign(data, params)
    query =
      'UPDATE eLibs SET appname = $1, type = $2, path = $3, meta = $4, body = $5 WHERE id = $6 RETURNING *'
    values = columns.map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  } else {
    data = params
    query =
      'INSERT INTO eLibs(appname, type, path, meta, body) VALUES($1, $2, $3, $4, $5) RETURNING *'
    values = columns
      .slice(0, 5)
      .map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  }
  console.log('****************** query', query)
  console.log('****************** values', JSON.stringify(values))
  await doSQL(query, values)
}

const loadPrivateNodes = async (appname, packageName) => {
  const query =
    'SELECT * FROM ePrivateNodes WHERE appname = $1 and packageName = $2'
  const data = await doSQL(query, [appname, packageName])
  if (data && data.rowCount > 0) {
    return data.rows[0]
  }
  return null
}

const savePrivateNodes = async (appname, params) => {
  const columns = ['appname', 'packageName', 'data', 'id']
  let data = await loadPrivateNodes(appname, params.packageName)
  let query
  let values
  if (data !== null) {
    data = Object.assign(data, params)
    query =
      'UPDATE ePrivateNodes SET appname = $1, packageName = $2, data = $3 WHERE id = $4 RETURNING *'
    values = columns.map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  } else {
    data = params
    query =
      'INSERT INTO ePrivateNodes(appname, packageName, data) VALUES($1, $2, $3) RETURNING *'
    values = columns
      .slice(0, 3)
      .map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  }
  console.log('****************** query', query)
  console.log('****************** values', JSON.stringify(values))
  await doSQL(query, values)
}

const removePrivateNodes = async (appname) => {
  const query = 'DELETE FROM ePrivateNodes WHERE appname = $1'
  await doSQL(query, [appname])
}

exports.initPG = initPG
exports.createTable = createTable
exports.loadConfig = loadConfig
exports.saveConfig = saveConfig
exports.loadLib = loadLib
exports.saveLib = saveLib
exports.loadPrivateNodes = savePrivateNodes
exports.removePrivateNodes = removePrivateNodes
