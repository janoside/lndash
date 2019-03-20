const hashjs = require('hash.js');

var os = require('os');
var path = require('path');
var url = require('url');

var ifxUri = process.env.LND_ADMIN_INFLUXDB_URI ? url.parse(process.env.LND_ADMIN_INFLUXDB_URI, true) : { query: { } };
var ifxAuth = ifxUri.auth ? ifxUri.auth.split(':') : [];
var ifxActive = !!process.env.LND_ADMIN_ENABLE_INFLUXDB || Object.keys(process.env).some(k => k.startsWith('LND_ADMIN_INFLUXDB_'));

var pwdHash = hashjs.sha256().update(process.env.LND_ADMIN_LOGIN_PASSWORD || "admin").digest('hex');

console.log("pwdHash: " + pwdHash);

var rpcConfigs = [];

if (process.env.LND_ADMIN_NODE_COUNT) {
	for (var i = 1; i <= parseInt(process.env.LND_ADMIN_NODE_COUNT); i++) {
		var host = process.env["LND_ADMIN_RPC_HOST_" + i] || "127.0.0.1";
		var port = process.env["LND_ADMIN_RPC_PORT_" + i] || 10009;
		var adminMacaroonFilepath = process.env["LND_ADMIN_MACAROON_FILEPATH_" + i] || path.join(os.homedir(), '.lnd', 'admin.macaroon');
		var tlsCertFilepath = process.env["LND_ADMIN_TLS_CERT_FILEPATH_" + i] || path.join(os.homedir(), '.lnd', 'tls.cert');

		rpcConfigs.push({host:host, port:port, adminMacaroonFilepath:adminMacaroonFilepath, tlsCertFilepath:tlsCertFilepath});
	}

} else {
	rpcConfigs.push({
		host: (process.env.LND_ADMIN_RPC_HOST || "127.0.0.1"),
		port: (process.env.LND_ADMIN_RPC_PORT || 10009),
		adminMacaroonFilepath:process.env.LND_ADMIN_ADMIN_MACAROON_FILEPATH || path.join(os.homedir(), '.lnd', 'admin.macaroon'),
		tlsCertFilepath:process.env.LND_ADMIN_TLS_CERT_FILEPATH || path.join(os.homedir(), '.lnd', 'tls.cert'),
	});
}

module.exports = {
	rpcConfigs:rpcConfigs,

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
