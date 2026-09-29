const mysql = require('mysql2/promise');
const config = require('./src/config.js');

module.exports = async function globalSetup() {
  const connection = await mysql.createConnection({
    host: config.db.connection.host,
    user: config.db.connection.user,
    password: config.db.connection.password,
    connectTimeout: config.db.connection.connectTimeout,
  });
  try {
    await connection.query(`DROP DATABASE IF EXISTS ${config.db.connection.database}`);
  } finally {
    await connection.end();
  }
};
