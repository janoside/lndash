var utils = require("./utils.js");
var fs = require("fs");
var grpc = require("grpc");


var fullNetworkDescription = null;
var fullNetworkDescriptionDate = new Date(0);
var pendingFNDRequest = false;

var localChannels = null;
var localClosedChannels = null;

function connect(rpcConfig, index) {
	console.log(`Connecting to LND Node: ${rpcConfig}`);

	return new Promise(function(resolve, reject) {
		// Ref: https://github.com/lightningnetwork/lnd/blob/master/docs/grpc/javascript.md

		// Due to updated ECDSA generated tls.cert we need to let gprc know that
		// we need to use that cipher suite otherwise there will be a handhsake
		// error when we communicate with the lnd rpc server.
		process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';

		var host = null;
		var port = 10009;

		var macaroon = null;
		var lndCert = null;

		if (rpcConfig.type == "fileInput") {
			host = rpcConfig.host;
			port = rpcConfig.port;

			// Lnd admin macaroon is at ~/.lnd/admin.macaroon on Linux and
			// ~/Library/Application Support/Lnd/admin.macaroon on Mac
			var m = fs.readFileSync(rpcConfig.adminMacaroonFilepath);
			macaroon = m.toString('hex');

			//console.log("macHex: " + macaroon);

			//  Lnd cert is at ~/.lnd/tls.cert on Linux and
			//  ~/Library/Application Support/Lnd/tls.cert on Mac
			lndCert = fs.readFileSync(rpcConfig.tlsCertFilepath);

			//console.log("fileInput.cert: " + lndCert);

		} else if (rpcConfig.type == "rawTextInput") {
			host = rpcConfig.host;
			port = rpcConfig.port;

			macaroon = rpcConfig.adminMacaroonHex;
			lndCert = Buffer.from(rpcConfig.tlsCertAscii, 'utf-8');

		} else if (rpcConfig.type == "lndconnectString") {
			var lndconnectString = rpcConfig.lndconnectString;
			var parsedData = utils.parseLndconnectString(lndconnectString);

			//console.log("lndconnectString.cert: " + parsedData.tlsCertAscii);

			host = parsedData.host;
			port = parsedData.port;
			macaroon = parsedData.adminMacaroonHex;
			lndCert = Buffer.from(parsedData.tlsCertAscii, 'utf-8');
		}

		try {
			// build meta data credentials
			var metadata = new grpc.Metadata();
			metadata.add('macaroon', macaroon);
			var macaroonCreds = grpc.credentials.createFromMetadataGenerator((_args, callback) => {
				callback(null, metadata);
			});

			var sslCreds = grpc.credentials.createSsl(lndCert);

			// combine the cert credentials and the macaroon auth credentials
			// such that every call is properly encrypted and authenticated
			var credentials = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

			var lnrpcDescriptor = grpc.load("./rpc.proto"); // "rpc.proto"
			var lnrpc = lnrpcDescriptor.lnrpc;

			// uncomment to print available function of RPC protocol
			//console.log(lnrpc);

			var lndConnection = new lnrpc.Lightning(`${host}:${port}`, credentials, {'grpc.max_receive_message_length': 50*1024*1024});

			lndConnection.GetInfo({}, function(err, response) {
				if (err) {
					console.log("Error 3208r2ugddsh: Failed connecting to LND @ " + rpcConfig.host + ":" + rpcConfig.port + " via RPC: " + err + ", error json: " + JSON.stringify(err));

					reject(err);

					return;
				}

				if (response == null) {
					console.log("Error 923ehrfheu: Failed connecting to LND @ " + rpcConfig.host + ":" + rpcConfig.port + " via RPC: null response");

					reject("No response for node.getInfo()");
					
					return;
				}

				if (response != null) {
					console.log("Connected to LND @ " + rpcConfig.host + ":" + rpcConfig.port + " via RPC.\n\nGetInfo=" + JSON.stringify(response, null, 4));
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

				resolve({lndConnection:lndConnection, index:index});
			});

		} catch (err) {
			utils.logError("973gsgd90sgfsgs", err);

			reject(err);

			return;
		}
	});
}

function connectAllNodes() {
	return new Promise(function(resolve, reject) {
		global.lndConnections = {
			byIndex: {},
			byAlias: {},

			aliases:[],
			indexes:[]
		};

		var promises = [];

		var index = -1;
		global.adminCredentials.lndNodes.forEach(function(rpcConfig) {
			index++;

			promises.push(new Promise(function(resolveInner, rejectInner) {
				connect(rpcConfig, index).then(function(response) {
					console.log("RPC connected: " + response.index);

					if (response.index == 0) {
						refreshLocalChannels();
						refreshLocalClosedChannels();

						refreshFullNetworkDescription().then(function() {
							resolveInner();
							
						}).catch(function(err) {
							utils.logError("379regwd9f7gsdgs", err);

							rejectInner(err);
						});
					}
				}).catch(function(err) {
					utils.logError("2397rgsd9gsgs", err);

					rejectInner(err);
				});
			}));
		});

		Promise.all(promises).then(function() {
			resolve();

		}).catch(function(err) {
			utils.logError("23r97sdg97sgs", err);

			reject(err);
		});
	});
}


function getFullNetworkDescription() {
	return new Promise(function(resolve, reject) {
		// try a manual refresh here, but don't wait for it
		if (fullNetworkDescription == null) {
			refreshFullNetworkDescription();
		}

		resolve(fullNetworkDescription);
	});
}

function refreshFullNetworkDescription(forceRefresh=false) {
	if (!forceRefresh && pendingFNDRequest) {
		// avoid piling up these heavy requests
		return new Promise(function(resolve, reject) {
			resolve();
		});
	}

	pendingFNDRequest = true;

	var startTime = new Date();

	console.log("Refreshing network description...");
	
	return new Promise(function(resolve_1, reject_1) {
		lndRpc.describeGraph({include_unannounced:true}, function(err, describeGraphResponse) {
			if (err) {
				console.log("Error 2397gr2039rf6g2: " + err + ", error json: " + JSON.stringify(err));
			}

			if (describeGraphResponse == null) {
				console.log("Error 23ufhg024ge: null describeGraph response");

				pendingFNDRequest = false;

				resolve_1();

				return;
			}

			var nodeInfoByPubkey = {};
			if (fullNetworkDescription && fullNetworkDescription.nodeInfoByPubkey) {
				nodeInfoByPubkey = fullNetworkDescription.nodeInfoByPubkey;
			}

			var promises = [];
			describeGraphResponse.nodes.forEach(function(node) {
				if (node.last_update * 1000 > fullNetworkDescriptionDate.getTime()) {
					//console.log("Refreshing node details: " + node.last_update + " - " + fullNetworkDescriptionDate.getTime());

					promises.push(new Promise(function(resolve_2, reject_2) {
						lndRpc.getNodeInfo({pub_key:node.pub_key}, function(err2, nodeInfoResponse) {
							if (err2) {
								console.log("Error 312r9ygef9y: " + err2);
							}

							nodeInfoByPubkey[node.pub_key] = nodeInfoResponse;

							resolve_2();
						});
					}));
				}
			});

			Promise.all(promises).then(function() {
				fullNetworkDescription = compileFullNetworkDescription(describeGraphResponse, nodeInfoByPubkey);
				fullNetworkDescriptionDate = new Date();

				console.log("Finished refreshing network description; elapsed time: " + (new Date().getTime() - startTime.getTime()));

				pendingFNDRequest = false;

				resolve_1();
			});
		});
	});
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
	fnd.channels.sortedByLastUpdate = describeGraphResponse.edges;
	fnd.channels.sortedByCapacity = describeGraphResponse.edges.slice(0);

	fnd.channels.sortedByLastUpdate.forEach(function(channel) {
		fnd.channelsById[channel.channel_id] = channel;
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

	return fnd;
}




function getLocalChannels() {
	return new Promise(function(resolve, reject) {
		// try a manual refresh here, but don't wait for it
		if (localChannels == null) {
			refreshLocalChannels();
		}

		resolve(localChannels);
	});
}

function getClosedChannels() {
	return new Promise(function(resolve, reject) {
		// try a manual refresh here, but don't wait for it
		if (localClosedChannels == null) {
			refreshLocalClosedChannels();
		}

		resolve(localClosedChannels);
	});
}

function getPendingChannels() {
	return new Promise(function(resolve, reject) {
		lndRpc.PendingChannels({}, function(err, pendingChannelsResponse) {
			if (err) {
				utils.logError("32r08hdsf0h8s", err);
			}

			if (pendingChannelsResponse == null) {
				utils.logError("320r8hsd08hsds", "null PendingChannels response");

				reject("null PendingChannels response");

				return;
			}

			resolve(pendingChannelsResponse);
		});
	});
}

function refreshLocalChannels() {
	var startTime = new Date();

	console.log("Refreshing local channels...");
	
	return new Promise(function(resolve_1, reject_1) {
		lndRpc.ListChannels({}, function(err, listChannelsResponse) {
			if (err) {
				utils.logError("23179egwqeufgsd", err);
			}

			if (listChannelsResponse == null) {
				utils.logError("76dfhg12328", "null listChannels response");

				resolve_1();

				return;
			}

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

			console.log("Finished refreshing local channels; elapsed time: " + (new Date().getTime() - startTime.getTime()));

			resolve_1();
		});
	});
}

function refreshLocalClosedChannels() {
	var startTime = new Date();

	console.log("Refreshing closed channels...");
	
	return new Promise(function(resolve_1, reject_1) {
		lndRpc.ClosedChannels({}, function(err, closedChannelsResponse) {
			if (err) {
				utils.logError("23r07wehf7dsf", err);
			}

			if (closedChannelsResponse == null) {
				utils.logError("2183ryu243r7034w", "null listChannels response");

				resolve_1();

				return;
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

			//console.log("Closed channels: " + JSON.stringify(localClosedChannels, null, 4));

			console.log("Finished refreshing closed channels; elapsed time: " + (new Date().getTime() - startTime.getTime()));

			resolve_1();
		});
	});
}




function createInvoice(memo, valueSats, expirySeconds) {
	return new Promise(function(resolve, reject) {
		lndRpc.AddInvoice({memo:memo, value:valueSats, expiry:expirySeconds}, function(err, response) {
			if (err) {
				utils.logError("29073tgwgedf", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function connectToPeer(pubKey, address) {
	return new Promise(function(resolve, reject) {
		lndRpc.ConnectPeer({addr:{pubkey:pubKey, host:address}}, function(err, response) {
			if (err) {
				utils.logError("82320ghfwreg", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function disconnectFromPeer(pubKey) {
	return new Promise(function(resolve, reject) {
		lndRpc.DisconnectPeer({pub_key:pubKey}, function(err, response) {
			if (err) {
				utils.logError("23r097hwef07ghds", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function listPayments() {
	return new Promise(function(resolve, reject) {
		lndRpc.ListPayments({}, function(err, response) {
			if (err) {
				utils.logError("3297rfhwe7fesuwy", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function getNetworkInfo() {
	return new Promise(function(resolve, reject) {
		lndRpc.GetNetworkInfo({}, function(err, response) {
			if (err) {
				utils.logError("32r9yg4329t655", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function decodeInvoiceString(invoiceStr) {
	return new Promise(function(resolve, reject) {
		lndRpc.DecodePayReq({pay_req:invoiceStr}, function(err, response) {
			if (err) {
				utils.logError("08342ht074gtw", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function payInvoice(invoiceStr) {
	console.log("Sending payment for invoice: " + invoiceStr);

	return new Promise(function(resolve, reject) {
		lndRpc.SendPaymentSync({payment_request:invoiceStr}, function(err, response) {
			if (err) {
				utils.logError("10r38dhf8shf", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function sendPayment(destPubkey, amountSat) {
	console.log("Sending payment: dest=" + destPubkey + ", amt=" + amountSat);

	return new Promise(function(resolve, reject) {
		lndRpc.SendPaymentSync({dest_string:destPubkey, amt:amountSat}, function(err, response) {
			if (err) {
				utils.logError("32r0uhsd0uhds0", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}



function getWalletBalance() {
	return new Promise(function(resolve, reject) {
		lndRpc.WalletBalance({}, function(err, response) {
			if (err) {
				utils.logError("23ge072g30dwevf", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function getChannelBalance() {
	return new Promise(function(resolve, reject) {
		lndRpc.ChannelBalance({}, function(err, response) {
			if (err) {
				utils.logError("0uefbwdbfb", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function getOnChainTransactions() {
	return new Promise(function(resolve, reject) {
		lndRpc.GetTransactions({}, function(err, response) {
			if (err) {
				utils.logError("123084r723yd", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function getInvoices() {
	return new Promise(function(resolve, reject) {
		lndRpc.ListInvoices({num_max_invoices:1000000}, function(err, response) {
			if (err) {
				utils.logError("213r07h23e07few", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

function openChannel(remoteNodePubkey, localAmount, sendAmount) {
	return new Promise(function(resolve, reject) {
		lndRpc.OpenChannelSync({node_pubkey_string:remoteNodePubkey, local_funding_amount:localAmount, push_sat:sendAmount}, function(err, response) {
			if (err) {
				utils.logError("04fh23yg432", err);

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
	connectAllNodes: connectAllNodes,

	getFullNetworkDescription: getFullNetworkDescription,
	refreshFullNetworkDescription: refreshFullNetworkDescription,

	getLocalChannels: getLocalChannels,
	refreshLocalChannels: refreshLocalChannels,

	getClosedChannels: getClosedChannels,
	refreshLocalClosedChannels: refreshLocalClosedChannels,

	getPendingChannels: getPendingChannels,

	connectToPeer: connectToPeer,
	disconnectFromPeer: disconnectFromPeer,

	listPayments: listPayments,
	getNetworkInfo: getNetworkInfo,

	getChannelBalance,
	getWalletBalance,
	getWalletUtxos: getWalletUtxos,

	openChannel: openChannel,

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
	sendCoins: sendCoins
};
