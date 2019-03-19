const hashjs = require('hash.js');

var os = require('os');
var path = require('path');
var url = require('url');

var ifxUri = process.env.LND_ADMIN_INFLUXDB_URI ? url.parse(process.env.LND_ADMIN_INFLUXDB_URI, true) : { query: { } };
var ifxAuth = ifxUri.auth ? ifxUri.auth.split(':') : [];
var ifxActive = !!process.env.LND_ADMIN_ENABLE_INFLUXDB || Object.keys(process.env).some(k => k.startsWith('LND_ADMIN_INFLUXDB_'));

var pwdHash = hashjs.sha256().update(process.env.LND_ADMIN_LOGIN_PASSWORD || "admin").digest('hex');

console.log("pwdHash: " + pwdHash);

module.exports = {
	rpc: {
		host:process.env.LND_ADMIN_RPC_HOST || "127.0.0.1",
		port:process.env.LND_ADMIN_RPC_PORT || 10009,
		adminMacaroonFilepath:process.env.LND_ADMIN_ADMIN_MACAROON_FILEPATH || path.join(os.homedir(), '.lnd', 'admin.macaroon'),
		tlsCertFilepath:process.env.LND_ADMIN_TLS_CERT_FILEPATH || path.join(os.homedir(), '.lnd', 'tls.cert'),
	},

	influxdb:{
		active: ifxActive,
		host: ifxUri.hostname || process.env.BTCEXP_INFLUXDB_HOST || "127.0.0.1",
		port: ifxUri.port || process.env.BTCEXP_INFLUXDB_PORT || 8086,
		database: ifxUri.pathname && ifxUri.pathname.substr(1) || process.env.BTCEXP_INFLUXDB_DBNAME || "influxdb",
		username: ifxAuth[0] || process.env.BTCEXP_INFLUXDB_USER || "admin",
		password: ifxAuth[1] || process.env.BTCEXP_INFLUXDB_PASS || "admin"
	},

	adminUsername:process.env.LND_ADMIN_LOGIN_USERNAME || "admin",
	adminPasswordSha256:pwdHash
};
