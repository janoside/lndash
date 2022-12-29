const hashjs = require('hash.js');

const os = require('os');
const path = require('path');
const url = require('url');


let rpcConfigs = [];

if (process.env.LND_ADMIN_NODE_COUNT) {
	for (let i = 1; i <= parseInt(process.env.LND_ADMIN_NODE_COUNT); i++) {
		let host = process.env["LND_ADMIN_RPC_HOST_" + i] || "127.0.0.1";
		let port = process.env["LND_ADMIN_RPC_PORT_" + i] || 10009;
		let adminMacaroonFilepath = process.env["LND_ADMIN_MACAROON_FILEPATH_" + i] || path.join(os.homedir(), '.lnd', 'admin.macaroon');
		let tlsCertFilepath = process.env["LND_ADMIN_TLS_CERT_FILEPATH_" + i] || path.join(os.homedir(), '.lnd', 'tls.cert');

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
	rpcConfigs:rpcConfigs
};
