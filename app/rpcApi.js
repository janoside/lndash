var utils = require("./utils.js");


var fullNetworkDescription = null;
var localChannels = null;

function getFullNetworkDescription() {
	return new Promise(function(resolve, reject) {
		// try a manual refresh here, but don't wait for it
		if (fullNetworkDescription == null) {
			refreshFullNetworkDescription();
		}

		resolve(fullNetworkDescription);
	});
}

function refreshFullNetworkDescription() {
	var startTime = new Date();

	console.log("Refreshing network description...");
	
	return new Promise(function(resolve_1, reject_1) {
		lndRpc.describeGraph({include_unannounced:true}, function(err, describeGraphResponse) {
			if (err) {
				console.log("Error 2397gr2039rf6g2: " + err + ", error json: " + JSON.stringify(err));
			}

			if (describeGraphResponse == null) {
				console.log("Error 23ufhg024ge: null describeGraph response");

				resolve_1();

				return;
			}

			var nodeInfoByPubkey = {};

			var promises = [];
			describeGraphResponse.nodes.forEach(function(node) {
				promises.push(new Promise(function(resolve_2, reject_2) {
					lndRpc.getNodeInfo({pub_key:node.pub_key}, function(err2, nodeInfoResponse) {
						if (err2) {
							console.log("Error 312r9ygef9y: " + err2);
						}

						nodeInfoByPubkey[node.pub_key] = nodeInfoResponse;

						resolve_2();
					});
				}));
			});

			Promise.all(promises).then(function() {
				fullNetworkDescription = compileFullNetworkDescription(describeGraphResponse, nodeInfoByPubkey);

				console.log("Finished refreshing network description; elapsed time: " + (new Date().getTime() - startTime.getTime()));

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

function refreshLocalChannels() {
	var startTime = new Date();

	console.log("Refreshing local channels...");
	
	return new Promise(function(resolve_1, reject_1) {
		lndRpc.ListChannels({}, function(err, listChannelsResponse) {
			if (err) {
				utils.logError("Error 23179egwqeufgsd: ", err);
			}

			if (listChannelsResponse == null) {
				utils.logError("Error 76dfhg12328: null listChannels response");

				resolve_1();

				return;
			}

			var localChannelsById = {};
			var localChannelsByTxid = {};

			listChannelsResponse.channels.forEach(function(channel) {
				localChannelsById[channel.chan_id] = channel;

				if (channel.channel_point != null) {
					localChannelsByTxid[channel.channel_point.substring(0, channel.channel_point.indexOf(":"))] = channel;
				}
			});

			localChannels = {};
			localChannels.channels = listChannelsResponse.channels;
			localChannels.byId = localChannelsById;
			localChannels.byTxid = localChannelsByTxid;

			console.log("Finished refreshing local channels; elapsed time: " + (new Date().getTime() - startTime.getTime()));

			resolve_1();
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

function getNetworkStats() {
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

			console.log("Payment sent, response: " + response + ", json: " + JSON.stringify(response) + ", invoice: " + invoiceStr);

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
		lndRpc.OpenChannel({node_pubkey_string:remoteNodePubkey, local_funding_amount:localAmount, push_sat:sendAmount}, function(err, response) {
			if (err) {
				utils.logError("04fh23yg432", err);

				reject(err);

				return;
			}

			resolve(response);
		});
	});
}

module.exports = {
	getFullNetworkDescription: getFullNetworkDescription,
	refreshFullNetworkDescription: refreshFullNetworkDescription,

	getLocalChannels: getLocalChannels,
	refreshLocalChannels: refreshLocalChannels,

	connectToPeer: connectToPeer,
	listPayments: listPayments,
	getNetworkStats: getNetworkStats,

	getChannelBalance,
	getWalletBalance,

	decodeInvoiceString: decodeInvoiceString,
	payInvoice: payInvoice,
	getOnChainTransactions: getOnChainTransactions,
	getInvoices: getInvoices
};
