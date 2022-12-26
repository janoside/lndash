const util = require('util');


var debug = require("debug");
var debugLog = debug("lndash:rpc");

var utils = require("./utils.js");
var fs = require("fs");
var grpc = require("@grpc/grpc-js");
var protoLoader = require('@grpc/proto-loader');
var path = require('path');

var networkInfo = null;
var fullNetworkDescription = null;
var fullNetworkDescriptionDate = new Date(0);
var pendingFNDRequest = false;

var localChannels = null;
var localClosedChannels = null;
var localPendingChannels = null;

function parseRpcConfig(rpcConfig) {
	let host = null;
	let port = 10009;

	let macaroon = null;
	let lndCert = null;

	if (rpcConfig.type == "fileInput") {
		host = rpcConfig.host;
		port = rpcConfig.port;

		// Lnd admin macaroon is at ~/.lnd/admin.macaroon on Linux and
		// ~/Library/Application Support/Lnd/admin.macaroon on Mac
		let m = fs.readFileSync(rpcConfig.adminMacaroonFilepath);
		macaroon = m.toString('hex');

		//debugLog("macHex: " + macaroon);

		//  Lnd cert is at ~/.lnd/tls.cert on Linux and
		//  ~/Library/Application Support/Lnd/tls.cert on Mac
		lndCert = fs.readFileSync(rpcConfig.tlsCertFilepath);

		//debugLog("fileInput.cert: " + lndCert);

	} else if (rpcConfig.type == "rawTextInput") {
		host = rpcConfig.host;
		port = rpcConfig.port;

		macaroon = rpcConfig.adminMacaroonHex;
		lndCert = Buffer.from(rpcConfig.tlsCertAscii, 'utf-8');

	} else if (rpcConfig.type == "lndconnectString") {
		let lndconnectString = rpcConfig.lndconnectString;
		let parsedData = utils.parseLndconnectString(lndconnectString);

		//debugLog("lndconnectString.cert: " + parsedData.tlsCertAscii);

		host = parsedData.host;
		port = parsedData.port;
		macaroon = parsedData.adminMacaroonHex;
		lndCert = Buffer.from(parsedData.tlsCertAscii, 'utf-8');
	}

	return [host, port, macaroon, lndCert];
}

function buildProtocolConnector(rpcConfig) {
	[host, port, macaroon, lndCert] = parseRpcConfig(rpcConfig);


	// Ref: https://github.com/lightningnetwork/lnd/blob/master/docs/grpc/javascript.md

	// Due to updated ECDSA generated tls.cert we need to let gprc know that
	// we need to use that cipher suite otherwise there will be a handhsake
	// error when we communicate with the lnd rpc server.
	process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';


	// build meta data credentials
	let metadata = new grpc.Metadata();
	metadata.add('macaroon', macaroon);
	let macaroonCreds = grpc.credentials.createFromMetadataGenerator((_args, callback) => {
		callback(null, metadata);
	});

	let sslCreds = grpc.credentials.createSsl(lndCert);

	// combine the cert credentials and the macaroon auth credentials
	// such that every call is properly encrypted and authenticated
	let credentials = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

	let protoFilepath = path.join(global.packageRootDir, 'rpc.proto');

	let packageDefinition = protoLoader.loadSync(
		protoFilepath,
		{
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true
		}
	);

	let protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

	let lnrpc = protoDescriptor.lnrpc;

	// uncomment to print available function of RPC protocol
	//debugLog(lnrpc);

	let lndConnection = new lnrpc.Lightning(`${host}:${port}`, credentials, {'grpc.max_receive_message_length': 100*1024*1024});

	return lndConnection;
}

async function connect(rpcConfig, index) {
	debugLog(`Connecting to LND Node: ${rpcConfig.host}:${rpcConfig.port}`);

	let lndConnection = buildProtocolConnector(rpcConfig);
	
	let getInfo = util.promisify(lndConnection.GetInfo.bind(lndConnection));

	let response = await getInfo({});

	if (response == null) {
		throw new Error("No response for node.getInfo()");
	}

	if (response != null) {
		debugLog("Connected to LND @ " + rpcConfig.host + ":" + rpcConfig.port + " via RPC.\n\nGetInfo=" + JSON.stringify(response, null, 4));
	}

	global.lndConnections.byIndex[index] = lndConnection;
	global.lndConnections.byAlias[response.alias] = lndConnection;
	global.lndConnections.aliases.push(response.alias);
	global.lndConnections.indexes.push(index);

	if (index == 0) {
		global.lndRpc = lndConnection;
	}

	lndConnection.internal_index = index;
	lndConnection.internal_alias = response.alias;
	lndConnection.internal_pubkey = response.identity_pubkey;
	lndConnection.internal_version = response.version;

	return {lndConnection:lndConnection, index:index};
}

async function connectAllNodes() {
	global.lndConnections = {
		byIndex: {},
		byAlias: {},

		aliases:[],
		indexes:[]
	};

	for (let i = 0; i < global.adminCredentials.lndNodes.length; i++) {
		let rpcConfig = global.adminCredentials.lndNodes[i];

		let response = await connect(rpcConfig, i);

		debugLog(`RPC Connected: ${response.index}`);

		if (response.index == 0) {
			await refreshCachedValues(true);
		}
	}
}

async function connectActiveNode() {
	global.lndConnections = {
		byIndex: {},
		byAlias: {},

		aliases:[],
		indexes:[]
	};

	let rpcConfig = global.adminCredentials.lndNodes[0];

	let response = await connect(rpcConfig, 0);

	debugLog(`RPC Connected: ${response.index}`);

	if (response.index == 0) {
		await refreshCachedValues(true);
	}
}


async function refreshCachedValues(forceFullRefresh=false) {
	var startTime = new Date();

	await refreshFullNetworkDescription(forceFullRefresh);
	await refreshLocalChannels();
	await refreshLocalPendingChannels();
	await refreshLocalClosedChannels();
	await getNetworkInfo();

	debugLog(`Refreshed network graph in ${(new Date().getTime() - startTime.getTime())}ms`);
}


async function getFullNetworkDescription(acceptCachedValues=false) {
	if (acceptCachedValues && fullNetworkDescription) {
		return fullNetworkDescription;

	} else {
		return await refreshFullNetworkDescription();
	}
}

async function refreshFullNetworkDescription(forceRefresh=false) {
	if (!forceRefresh && pendingFNDRequest) {
		// avoid piling up these heavy requests
		return null;
	}

	try {
		pendingFNDRequest = true;

		var startTime = new Date();

		let describeGraph = util.promisify(lndRpc.describeGraph.bind(lndRpc));
		
		let describeGraphResponse = await describeGraph({include_unannounced:true});//, function(err, describeGraphResponse) {
		
		if (describeGraphResponse == null) {
			throw new Error("null describeGraph response");
		}

		var nodeInfoByPubkey = {};

		if (!forceRefresh) {
			if (fullNetworkDescription && fullNetworkDescription.nodeInfoByPubkey) {
				nodeInfoByPubkey = fullNetworkDescription.nodeInfoByPubkey;
			}
		}

		var promises = [];
		var refreshedNodeCount = 0;
		var currentNodePubkeys = [];
		describeGraphResponse.nodes.forEach(async (node) => {
			// build list of current node pubkeys to assist in clearing out cached-but-now-gone nodes
			currentNodePubkeys.push(node.pub_key);

			if (forceRefresh || node.last_update * 1000 > fullNetworkDescriptionDate.getTime()) {
				//debugLog("Refreshing node details: " + node.last_update + " - " + fullNetworkDescriptionDate.getTime());
				refreshedNodeCount++;

				let getNodeInfo = util.promisify(lndRpc.getNodeInfo.bind(lndRpc));

				let nodeInfoResponse = await getNodeInfo({pub_key:node.pub_key});

				nodeInfoByPubkey[node.pub_key] = nodeInfoResponse;
			}
		});

		for (var pubkey in nodeInfoByPubkey) {
			if (nodeInfoByPubkey.hasOwnProperty(pubkey)) {
				if (!currentNodePubkeys.includes(pubkey)) {
					// the node for this pubkey is cached but was absent from latest DescribeGraph response...remove it
					delete nodeInfoByPubkey[pubkey];

					debugLog("Removing deleted cached node: pubkey=%s", pubkey);
				}
			}
		}

		fullNetworkDescription = compileFullNetworkDescription(describeGraphResponse, nodeInfoByPubkey);
		fullNetworkDescriptionDate = new Date();

		if (refreshedNodeCount > 0) {
			debugLog(`Refreshed ${refreshedNodeCount} nodes in ${(new Date().getTime() - startTime.getTime())}ms`);
		}
		

		pendingFNDRequest = false;

		return fullNetworkDescription;

	} finally {
		pendingFNDRequest = false;
	}
}

function compileFullNetworkDescription(describeGraphResponse, nodeInfoByPubkey) {
	var fnd = {};
	fnd.lastUpdate = new Date();

	fnd.nodes = {};
	fnd.nodeInfoByPubkey = nodeInfoByPubkey;
	fnd.nodes.sortedByLastUpdate = [];
	fnd.nodes.sortedByChannelCount = [];
	fnd.nodes.sortedByTotalCapacity = [];

	describeGraphResponse.nodes.sort(function(a, b) {
		return b.last_update - a.last_update;
	});

	describeGraphResponse.nodes.forEach(function(node) {
		fnd.nodes.sortedByLastUpdate.push(nodeInfoByPubkey[node.pub_key]);
	});

	fnd.nodes.sortedByChannelCount = fnd.nodes.sortedByLastUpdate.slice(0); // shallow copy
	fnd.nodes.sortedByChannelCount.sort(function(a, b) {
		var channelDiff = b.num_channels - a.num_channels;

		if (channelDiff == 0) {
			return b.last_update - a.last_update;

		} else {
			return channelDiff;
		}
	});

	fnd.nodes.sortedByTotalCapacity = fnd.nodes.sortedByLastUpdate.slice(0); // shallow copy
	fnd.nodes.sortedByTotalCapacity.sort(function(a, b) {
		var capacityDiff = b.total_capacity - a.total_capacity;

		if (capacityDiff == 0) {
			return b.last_update - a.last_update;

		} else {
			return capacityDiff;
		}
	});


	

	fnd.channels = {};
	fnd.channelsById = {};
	fnd.parsedChannelIds = {};

	fnd.channels.sortedByLastUpdate = describeGraphResponse.edges;
	fnd.channels.sortedByCapacity = describeGraphResponse.edges.slice(0);
	fnd.channels.sortedByOpenBlockHeight = describeGraphResponse.edges.slice(0);

	fnd.channels.sortedByLastUpdate.forEach(function(channel) {
		fnd.channelsById[channel.channel_id] = channel;

		fnd.parsedChannelIds[channel.channel_id] = utils.parseChannelId(channel.channel_id);
	});

	fnd.channels.sortedByLastUpdate.sort(function(a, b) {
		return b.last_update - a.last_update;
	});

	fnd.channels.sortedByCapacity.sort(function(a, b) {
		var capacityDiff = b.capacity - a.capacity;

		if (capacityDiff == 0) {
			return b.last_update - a.last_update;

		} else {
			return capacityDiff;
		}
	});

	fnd.channels.sortedByOpenBlockHeight.sort(function(a, b) {
		var aBlockHeight = fnd.parsedChannelIds[a.channel_id].blockHeight;
		var bBlockHeight = fnd.parsedChannelIds[b.channel_id].blockHeight;
		var blockHeightDiff = bBlockHeight - aBlockHeight;

		if (blockHeightDiff == 0) {
			return b.last_update - a.last_update;

		} else {
			return blockHeightDiff;
		}
	});

	return fnd;
}




async function getLocalChannels(acceptCachedValues=false) {
	if (acceptCachedValues && localChannels) {
		return localChannels;
	}


	return await refreshLocalChannels();
}

async function getLocalClosedChannels(acceptCachedValues=false) {
	if (acceptCachedValues && localClosedChannels) {
		return localClosedChannels;

	} else {
		return await refreshLocalClosedChannels();
	}
}

async function getLocalPendingChannels(acceptCachedValues=false) {
	if (acceptCachedValues && localPendingChannels) {
		return localPendingChannels;

	} else {
		return await refreshLocalPendingChannels();
	}
}

async function refreshLocalChannels() {
	let listChannels = util.promisify(lndRpc.ListChannels.bind(lndRpc));
	let listChannelsResponse = await listChannels({});

	var byId = {};
	var byTxid = {};

	listChannelsResponse.channels.forEach(function(channel) {
		byId[channel.chan_id] = channel;

		if (channel.channel_point != null) {
			byTxid[channel.channel_point.substring(0, channel.channel_point.indexOf(":"))] = channel;
		}
	});

	localChannels = {};
	localChannels.channels = listChannelsResponse.channels;
	localChannels.byId = byId;
	localChannels.byTxid = byTxid;

	return localChannels;
}

async function refreshLocalClosedChannels() {
	let closedChannels = util.promisify(lndRpc.ClosedChannels.bind(lndRpc));
	let closedChannelsResponse = await closedChannels({});
		
	if (closedChannelsResponse == null) {
		throw new Error("null ClosedChannels response");
	}

	var byId = {};
	var byTxid = {};

	closedChannelsResponse.channels.forEach(function(channel) {
		byId[channel.chan_id] = channel;

		if (channel.channel_point != null) {
			byTxid[channel.channel_point.substring(0, channel.channel_point.indexOf(":"))] = channel;
		}
	});

	localClosedChannels = {};
	localClosedChannels.channels = closedChannelsResponse.channels;
	localClosedChannels.byId = byId;
	localClosedChannels.byTxid = byTxid;

	//debugLog("Closed channels: " + JSON.stringify(localClosedChannels, null, 4));

	return localClosedChannels;
}

async function refreshLocalPendingChannels() {
	let PendingChannels = util.promisify(lndRpc.PendingChannels.bind(lndRpc));
	let pendingChannelsResponse = PendingChannels({});
		
	if (pendingChannelsResponse == null) {
		return new Error("null PendingChannels response");
	}

	var pendingOpenChannels = pendingChannelsResponse.pending_open_channels;
	var pendingCloseChannels = pendingChannelsResponse.pending_closing_channels;
	var pendingForceCloseChannels = pendingChannelsResponse.pending_force_closing_channels;
	var waitingCloseChannels = pendingChannelsResponse.waiting_close_channels;

	// aggregate into single array for ease of use
	var pendingChannels = {};
	pendingChannels.allChannels = [];
	pendingChannels.pendingOpenChannels = pendingOpenChannels;
	pendingChannels.pendingCloseChannels = pendingCloseChannels;
	pendingChannels.pendingForceCloseChannels = pendingForceCloseChannels;
	pendingChannels.waitingCloseChannels = waitingCloseChannels;


	if (pendingOpenChannels) {
		pendingOpenChannels.forEach(function(chan) {
			pendingChannels.allChannels.push(chan);
		});
	}

	if (pendingCloseChannels) {
		pendingCloseChannels.forEach(function(chan) {
			pendingChannels.allChannels.push(chan);
		});
	}

	if (pendingForceCloseChannels) {
		pendingForceCloseChannels.forEach(function(chan) {
			pendingChannels.allChannels.push(chan);
		});
	}

	if (waitingCloseChannels) {
		waitingCloseChannels.forEach(function(chan) {
			pendingChannels.allChannels.push(chan);
		});
	}


	localPendingChannels = pendingChannels;

	return localPendingChannels;
}




async function getInfo() {
	let getInfo = util.promisify(lndRpc.GetInfo.bind(lndRpc));
	return await getInfo({});
}

async function createInvoice(memo, valueSats, expirySeconds) {
	let addInvoice = util.promisify(lndRpc.AddInvoice.bind(lndRpc));
	return await addInvoice({memo:memo, value:valueSats, expiry:expirySeconds});
}

async function connectToPeer(pubKey, address) {
	let connectPeer = util.promisify(lndRpc.ConnectPeer.bind(lndRpc));
	return await connectPeer({addr:{pubkey:pubKey, host:address}});
}

async function disconnectFromPeer(pubKey) {
	let disconnectPeer = util.promisify(lndRpc.DisconnectPeer.bind(lndRpc));
	return await cisconnectPeer({pub_key:pubKey});
}

async function listPayments() {
	let listPayments = util.promisify(lndRpc.ListPayments.bind(lndRpc));
	return await listPayments({});
}

async function getNetworkInfo(acceptCachedValues=false) {
	if (acceptCachedValues && networkInfo != null) {
		return networkInfo;
	}

	let getNetworkInfo = util.promisify(lndRpc.GetNetworkInfo.bind(lndRpc));
	networkInfo = await getNetworkInfo({});

	return networkInfo;
}

async function getChannelFeePolicies() {
	debugLog("getChannelFeePolicies");

	let feeReport = util.promisify(lndRpc.FeeReport.bind(lndRpc));
	return await feeReport({});
}


async function decodeInvoiceString(invoiceStr) {
	let decodePayReq = util.promisify(lnd.DecodePayReq.bind(lndRpc));
	return await decodePayReq({pay_req:invoiceStr});
}

async function payInvoice(invoiceStr) {
	debugLog("Sending payment for invoice: " + invoiceStr);

	let sendPaymentSync = util.promisify(lndRpc.SendPaymentSync.bind(lndRpc));
	return await sendPaymentSync({payment_request:invoiceStr});
}

async function sendPayment(destPubkey, amountSat) {
	debugLog("Sending payment: dest=" + destPubkey + ", amt=" + amountSat);

	let sendPaymentSync = util.promisify(lndRpc.SendPaymentSync.bind(lndRpc));
	return await sendPaymentSync({dest_string:destPubkey, amt:amountSat});
}



async function getWalletBalance() {
	let walletBalance = util.promisify(lndRpc.WalletBalance.bind(lndRpc));
	return await walletBalance({});
}

async function getChannelBalance() {
	let channelBalance = util.promisify(lndRpc.ChannelBalance.bind(lndRpc));
	return await channelBalance({});
}

async function getChannelInfo(channelId) {
	let getChanInfo = util.promisify(lndRpc.GetChanInfo.bind(lndRpc));
	return await getChanInfo({chan_id:channelId});
}

async function getOnChainTransactions() {
	let getTransactions = util.promisify(lndRpc.GetTransactions.bind(lndRpc));
	return await getTransactions({});
}

async function getInvoices() {
	let listInvoices = util.promisify(lndRpc.ListInvoices.bind(lndRpc));
	return await listInvoices({num_max_invoices:1000000});
}

function openChannel(remoteNodePubkey, localAmount, sendAmount, private=false) {
	var params = {
		node_pubkey_string:remoteNodePubkey,
		local_funding_amount:localAmount,
		push_sat:sendAmount,
		private:private
	};

	return new Promise(function(resolve, reject) {
		lndRpc.OpenChannelSync(params, function(err, response) {
			if (err) {
				utils.logError("04fh23yg432", err);

				reject(err);

				return;
			}

			debugLog("OpenChannel response (raw): " + JSON.stringify(response));
			debugLog("OpenChannel response (formatted): %o", response);

			if (response.funding_txid_bytes && response.funding_txid_bytes.data) {
				// not sure why this is necessary, but only get proper hex string when reversed
				response.funding_txid_bytes.data.reverse();

				// this gives us the txid
				response.funding_txid_hex = Buffer.from(response.funding_txid_bytes).toString("hex");

				// back to how it was
				response.funding_txid_bytes.data.reverse();
			}

			resolve(response);
		});
	});
}

function closeChannel(txid, txOutput, forceClose, speedType, speedValue) {
	return new Promise(function(resolve, reject) {
		var params = {
			channel_point:{
				funding_txid_str:txid,
				output_index:txOutput
			},
			force:forceClose
		};

		params[speedType] = parseInt(speedValue);
		
		lndRpc.CloseChannel(params, function(err, response) {
			if (err) {
				utils.logError("0s7dfy0asdgf7gasdf", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function signMessage(msg) {
	return new Promise(function(resolve, reject) {
		lndRpc.SignMessage({msg:msg}, function(err, response) {
			if (err) {
				utils.logError("2u9few09fgye", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function verifyMessage(msg, signature) {
	return new Promise(function(resolve, reject) {
		lndRpc.VerifyMessage({msg:msg, signature:signature}, function(err, response) {
			if (err) {
				utils.logError("92ufhwyfegwds", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function queryRoute(targetPubkey, amountSat) {
	return new Promise(function(resolve, reject) {
		lndRpc.QueryRoutes({pub_key:targetPubkey, amt:amountSat, num_routes:1}, function(err, response) {
			if (err) {
				utils.logError("9273rgdcugdcug", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function getForwardingHistory(startTime, endTime, limit, offset) {
	debugLog("getForwardingHistory(%d, %d, %d, %d)", startTime, endTime, limit, offset);

	return new Promise(function(resolve, reject) {
		lndRpc.ForwardingHistory({start_time:startTime, end_time:endTime, index_offset:offset, num_max_events:limit}, function(err, response) {
			if (err) {
				utils.logError("329hruewfdhhd", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function getWalletUtxos(minConfirmations=1, maxConfirmations=100000000) {
	return new Promise(function(resolve, reject) {
		lndRpc.ListUnspent({min_confs:minConfirmations, max_confs:maxConfirmations}, function(err, response) {
			if (err) {
				utils.logError("3420d8hfsdhs0", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function getNewDepositAddress(addressType) {
	var valuesByTypeString = {"p2wkh":0, "np2wkh":1};

	return new Promise(function(resolve, reject) {
		lndRpc.NewAddress({type:valuesByTypeString[addressType]}, function(err, response) {
			if (err) {
				utils.logError("243w087hsd0uhs", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function updateChannelPolicies(txid, txOutputIndex, newPolicies) {
	var params = JSON.parse(JSON.stringify(newPolicies));
	params.chan_point = {funding_txid_str:txid, output_index:txOutputIndex};

	debugLog("updateChannelPolicies: " + JSON.stringify(params));

	return new Promise(function(resolve, reject) {
		lndRpc.UpdateChannelPolicy(params, function(err, response) {
			if (err) {
				utils.logError("0y78df078hgd0asdf", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function updateAllChannelPolicies(newPolicies) {
	var params = JSON.parse(JSON.stringify(newPolicies));
	params.global = true;

	debugLog("updateAllChannelPolicies: " + JSON.stringify(params));

	return new Promise(function(resolve, reject) {
		lndRpc.UpdateChannelPolicy(params, function(err, response) {
			if (err) {
				utils.logError("3208y2w8shgydgher", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

/**
 - addressValueStr: bc1address1a2b3c:[all|12345],...
 - speedType: [target_conf|sat_per_byte]
*/
function sendCoins(addressValueStr, speedType, speedValue) {
	return new Promise(function(resolve, reject) {
		var rpcParams = {};
		rpcParams[speedType] = parseInt(speedValue);

		var addressValues = addressValueStr.split(",");

		if (addressValues.length == 1) {
			var parts = addressValues[0].split(":");
			var address = parts[0];
			var amt = parts[1];

			rpcParams["addr"] = address;

			if (amt == "all") {
				rpcParams["send_all"] = true;

			} else {
				rpcParams["amount"] = parseInt(amt);
			}

			lndRpc.SendCoins(rpcParams, function(err, response) {
				if (err) {
					utils.logError("32r97sdys7gs", err);

					reject(err);

					return;
				}
				
				resolve(response);
			});

		} else {
			var AddrToAmount = {};

			addressValues.forEach(function(str) {
				var parts = str.split(":");
				AddrToAmount[parts[0]] = parseInt(parts[1]);
			});

			rpcParams["AddrToAmount"] = AddrToAmount;

			lndRpc.SendCoins(rpcParams, function(err, response) {
				if (err) {
					utils.logError("23r07hsd07sgh", err);

					reject(err);

					return;
				}

				resolve(response);
			});
		}
	});
}

module.exports = {
	connect: connect,
	connectActiveNode: connectActiveNode,
	connectAllNodes: connectAllNodes,
	refreshCachedValues: refreshCachedValues,

	getFullNetworkDescription: getFullNetworkDescription,
	refreshFullNetworkDescription: refreshFullNetworkDescription,

	getLocalChannels: getLocalChannels,
	refreshLocalChannels: refreshLocalChannels,

	getLocalClosedChannels: getLocalClosedChannels,
	refreshLocalClosedChannels: refreshLocalClosedChannels,

	getLocalPendingChannels: getLocalPendingChannels,
	refreshLocalPendingChannels: refreshLocalPendingChannels,

	connectToPeer: connectToPeer,
	disconnectFromPeer: disconnectFromPeer,

	listPayments: listPayments,
	getNetworkInfo: getNetworkInfo,

	getChannelFeePolicies: getChannelFeePolicies,

	getInfo: getInfo,
	getChannelBalance: getChannelBalance,
	getChannelInfo: getChannelInfo,
	getWalletBalance: getWalletBalance,
	getWalletUtxos: getWalletUtxos,

	openChannel: openChannel,
	closeChannel: closeChannel,

	createInvoice: createInvoice,
	decodeInvoiceString: decodeInvoiceString,

	payInvoice: payInvoice,
	sendPayment: sendPayment,
	
	getOnChainTransactions: getOnChainTransactions,
	getInvoices: getInvoices,

	signMessage:signMessage,
	verifyMessage:verifyMessage,

	queryRoute: queryRoute,
	getForwardingHistory: getForwardingHistory,

	getNewDepositAddress: getNewDepositAddress,
	sendCoins: sendCoins,

	updateChannelPolicies: updateChannelPolicies,
	updateAllChannelPolicies: updateAllChannelPolicies
};
