const hashjs = require('hash.js');

var express = require('express');
var router = express.Router();
var util = require('util');
var moment = require('moment');
var utils = require('./../app/utils');
var bitcoinCore = require("bitcoin-core");
var rpcApi = require("./../app/rpcApi.js");
var qrcode = require('qrcode');

router.get("/", function(req, res) {
	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		lndRpc.getInfo({}, function(err, response) {
			if (err) {
				utils.logError("3u1rh2yugfew0fwe", err);

				reject(err);

				return;
			}

			res.locals.getInfo = response;
			res.locals.qrcodeUrls = {};

			var qrcodeStrings = [response.identity_pubkey];
			if (response.uris && response.uris.length > 0) {
				qrcodeStrings.push(response.uris[0]);
			}

			utils.buildQrCodeUrls(qrcodeStrings).then(function(qrcodeUrls) {
				res.locals.qrcodeUrls = qrcodeUrls;

				resolve();

			}).catch(function(err) {
				utils.logError("37ufdhewfhedd", err);

				// no need to reject, we can fail gracefully without qrcodes
				resolve();
			});
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getFullNetworkDescription().then(function(fnd) {
			res.locals.fullNetworkDescription = fnd;

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getChannelBalance().then(function(channelBalanceResponse) {
			res.locals.channelBalance = channelBalanceResponse;

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getWalletBalance().then(function(walletBalanceResponse) {
			res.locals.walletBalance = walletBalanceResponse;

			resolve();
		});
	}));

	res.locals.homepage = true;

	Promise.all(promises).then(function(results) {
		res.render("index");

	}).catch(function(err) {
		console.log("Error 3972hrwe07fgedwfds: " + err);

		res.render("index");
	});
});

router.get("/node/:nodePubKey", function(req, res) {
	var nodePubKey = req.params.nodePubKey;

	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		lndRpc.listPeers({}, function(err, response) {
			if (err) {
				utils.logError("u3rhgqfdygews", err);

				reject(err);

				return;
			}

			res.locals.listPeers = response;

			res.locals.peerPubkeys = [];
			if (response.peers) {
				response.peers.forEach(function(peerInfo) {
					res.locals.peerPubkeys.push(peerInfo.pub_key);
				});
			}

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getFullNetworkDescription().then(function(fnd) {
			res.locals.fullNetworkDescription = fnd;
			res.locals.nodeInfo = fnd.nodeInfoByPubkey[nodePubKey];

			res.locals.nodeChannels = [];
			fnd.channels.sortedByLastUpdate.forEach(function(channel) {
				if (channel.node1_pub == nodePubKey || channel.node2_pub == nodePubKey) {
					res.locals.nodeChannels.push(channel);
				}
			});

			var qrcodeStrings = [];
			qrcodeStrings.push(nodePubKey);

			if (res.locals.nodeInfo.node.addresses) {
				for (var i = 0; i < res.locals.nodeInfo.node.addresses.length; i++) {
					if (res.locals.nodeInfo.node.addresses[i].network == "tcp") {
						res.locals.nodeUri = nodePubKey + "@" + res.locals.nodeInfo.node.addresses[i].addr;

						qrcodeStrings.push(res.locals.nodeUri);

						break;
					}
				}
			}

			utils.buildQrCodeUrls(qrcodeStrings).then(function(qrcodeUrls) {
				res.locals.qrcodeUrls = qrcodeUrls;

				resolve();

			}).catch(function(err) {
				utils.logError("3e0ufhdhfsdss", err);
				
				resolve();
			});
		}).catch(function(err) {
			utils.logError("349e7ghwef96werg", err);

			reject(err);
		});
	}));

	Promise.all(promises).then(function() {
		res.render("node");

	}).catch(function(err) {
		utils.logError("230rhsd0gds", err);
		
		res.render("node");
	});
});

router.get("/channel/:channelId", function(req, res) {
	var channelId = req.params.channelId;

	res.locals.channelId = channelId;

	rpcApi.getFullNetworkDescription().then(function(fnd) {
		res.locals.fullNetworkDescription = fnd;

		res.locals.channel = fnd.channelsById[channelId];

		if (res.locals.channel == null) {
			res.render("channel");

			return;
		}

		res.locals.node1 = fnd.nodeInfoByPubkey[res.locals.channel.node1_pub];
		res.locals.node2 = fnd.nodeInfoByPubkey[res.locals.channel.node2_pub];

		rpcApi.getLocalChannels().then(function(localChannels) {
			res.locals.localChannels = localChannels;

			res.render("channel");

		}).catch(function(err) {
			utils.logError("37921hdasudfgd", err);

			res.render("channel");
		});
	});
});

router.get("/settings", function(req, res) {
	res.render("settings");
});

router.get("/create-invoice", function(req, res) {
	res.render("create-invoice");
});

router.post("/create-invoice", function(req, res) {
	var memo = req.body.memo;
	var amountSats = req.body.amount;
	var expirationHrs = req.body.expiration;

	rpcApi.createInvoice(memo, amountSats, expirationHrs * 3600).then(function(response) {
		response.r_hash_base64 = Buffer.from(response.r_hash).toString("base64");
		response.r_hash_hex = Buffer.from(response.r_hash).toString("hex");

		delete response.r_hash;

		res.locals.createInvoiceResponse = response;

		res.render("create-invoice");

	}).catch(function(err) {
		utils.logError("23598yrgwe9fygwe9", err);

		res.render("create-invoice");
	});
});

router.get("/sign-verify", function(req, res) {
	res.render("sign-verify");
});

router.post("/sign-verify", function(req, res) {
	var msg = req.body.msg;
	var signature = req.body.signature;

	res.locals.msg = msg;
	res.locals.signature = signature;

	if (signature != null && signature.length > 0) {
		rpcApi.verifyMessage(msg, signature).then(function(response) {
			res.locals.verifyMessageResponse = response;

			res.render("sign-verify");

		}).catch(function(err) {
			utils.logError("29378rg30gfbd", err);

			res.render("sign-verify");
		});
	} else {
		rpcApi.signMessage(msg).then(function(response) {
			res.locals.signMessageResponse = response;
			res.locals.signature = response.signature;

			res.render("sign-verify");

		}).catch(function(err) {
			utils.logError("2397rgwefbcduhj", err);

			res.render("sign-verify");
		});
	}
});

router.get("/wallet", function(req, res) {
	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getChannelBalance().then(function(channelBalanceResponse) {
			res.locals.channelBalance = channelBalanceResponse;

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getWalletBalance().then(function(walletBalanceResponse) {
			res.locals.walletBalance = walletBalanceResponse;

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getLocalChannels().then(function(localChannels) {
			res.locals.localChannels = localChannels;

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getClosedChannels().then(function(closedChannels) {
			res.locals.closedChannels = closedChannels;

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getOnChainTransactions().then(function(onChainTransactionsResponse) {
			res.locals.onChainTransactions = onChainTransactionsResponse;

			resolve();
		});
	}));

	Promise.all(promises).then(function() {
		res.render("wallet");

	}).catch(function(err) {
		console.log("Error 3r9ygew9fgvew9fd: " + err);

		res.render("wallet");
	});
});

router.get("/node-status", function(req, res) {
	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		lndRpc.getInfo({}, function(err, response) {
			if (err) {
				utils.logError("3u1rh2yugfew0fwe", err);

				reject(err);

				return;
			}

			res.locals.getInfo = response;
			res.locals.qrcodeUrls = {};

			var qrcodeStrings = [response.identity_pubkey];
			if (response.uris && response.uris.length > 0) {
				qrcodeStrings.push(response.uris[0]);
			}

			utils.buildQrCodeUrls(qrcodeStrings).then(function(qrcodeUrls) {
				res.locals.qrcodeUrls = qrcodeUrls;

				resolve();

			}).catch(function(err) {
				utils.logError("37ufdhewfhedd", err);

				// no need to reject, we can fail gracefully without qrcodes
				resolve();
			});
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		lndRpc.listPeers({}, function(err, response) {
			if (err) {
				utils.logError("u3rhgqfdygews", err);

				reject(err);

				return;
			}

			res.locals.listPeers = response;

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getFullNetworkDescription().then(function(fnd) {
			res.locals.fullNetworkDescription = fnd;

			resolve();
		});
	}));

	Promise.all(promises).then(function() {
		res.render("node-status");
		res.end();

	}).catch(function(err) {
		req.session.userErrors.push(err);

		utils.logError("322u0rh2urf", err);

		res.render("node-status");
	});
});

router.get("/peers", function(req, res) {
	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		lndRpc.getInfo({}, function(err, response) {
			if (err) {
				utils.logError("3u1rh2yugfew0fwe", err);

				reject(err);

				return;
			}

			res.locals.getInfo = response;
			res.locals.qrcodeUrls = {};

			var qrcodeStrings = [response.identity_pubkey];
			if (response.uris && response.uris.length > 0) {
				qrcodeStrings.push(response.uris[0]);
			}

			utils.buildQrCodeUrls(qrcodeStrings).then(function(qrcodeUrls) {
				res.locals.qrcodeUrls = qrcodeUrls;

				resolve();

			}).catch(function(err) {
				utils.logError("37ufdhewfhedd", err);

				// no need to reject, we can fail gracefully without qrcodes
				resolve();
			});
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		lndRpc.listPeers({}, function(err, response) {
			if (err) {
				utils.logError("u3rhgqfdygews", err);

				reject(err);

				return;
			}

			res.locals.listPeers = response;

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getFullNetworkDescription().then(function(fnd) {
			res.locals.fullNetworkDescription = fnd;

			resolve();
		});
	}));

	Promise.all(promises).then(function() {
		res.render("peers");
		res.end();

	}).catch(function(err) {
		req.session.userErrors.push(err);

		utils.logError("322u0rh2urf", err);

		res.render("peers");
	});
});

router.get("/login", function(req, res) {
	if (req.session.admin) {
		res.redirect("/");

		return;
	}

	req.session.loginRedirect = req.headers.referer;

	res.render("login");
});

router.post("/login", function(req, res) {
	if (req.session.admin) {
		res.redirect("/");

		return;
	}

	// debug use for setting new password config
	var pwdHash = hashjs.sha256().update(req.body.password).digest('hex');
	console.log("password.sha256: " + pwdHash);
	
	if (req.body.username == config.credentials.adminUsername) {
		if (pwdHash == config.credentials.adminPasswordSha256) {
			req.session.admin = true;

			if (req.session.loginRedirect) {
				res.redirect(req.session.loginRedirect);

				return;
			}

			res.redirect("/");

			return;
		} else {
			console.log(`Password hash mismatch: ${pwdHash} vs ${config.credentials.adminPasswordSha256}`);
		}
	} else {
		console.log(`Username mismatch: ${req.body.username} vs ${config.credentials.adminUsername}`);
	}

	req.session.userMessage = "Login failed.";
	req.session.userMessageType = "danger";

	res.locals.userMessage = "Login failed.";
	res.locals.userMessageType = "danger";

	res.render("login");
});

router.get("/query-route", function(req, res) {
	if (req.query.pubkey) {
		res.locals.pubkey = req.query.pubkey;
	}

	if (req.query.amountSat) {
		res.locals.amountSat = req.query.amountSat;
	}

	res.render("query-route");
});

router.post("/query-route", function(req, res) {
	var pubkey = "";
	var amountSat = 0;

	if (req.body.pubkey) {
		pubkey = req.body.pubkey;
	}

	if (req.body.amountSat) {
		amountSat = parseInt(req.body.amountSat);
	}

	res.locals.pubkey = pubkey;
	res.locals.amountSat = amountSat;

	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.queryRoute(pubkey, amountSat).then(function(queryRouteResponse) {
			res.locals.queryRouteResponse = queryRouteResponse;

			resolve();

		}).catch(function(err) {
			res.locals.queryRouteError = err;
			
			utils.logError("3y9rewfgefge", err);

			reject(err);
		});
	}));

	Promise.all(promises).then(function() {
		res.render("query-route");

	}).catch(function(err) {
		utils.logError("23rey9gwefdsg", err);

		res.render("query-route");
	});
});

router.get("/routing-history", function(req, res) {
	res.render("routing-history");
});

router.get("/logout", function(req, res) {
	req.session.admin = false;

	res.redirect("/");
});

router.get("/changeSetting", function(req, res) {
	if (req.query.name) {
		req.session[req.query.name] = req.query.value;

		res.cookie('user-setting-' + req.query.name, req.query.value);
	}

	res.redirect(req.headers.referer);
});

router.get("/connect-lnd", function(req, res) {
	if (req.query.index) {
		var lndIndex = parseInt(req.query.index);

		if (lndIndex != global.lndRpc.internal_index) {
			global.lndRpc = global.lndConnections.connectionsByIndex[lndIndex];

			rpcApi.refreshFullNetworkDescription().then(function() {
				req.session.userMessage = `Switched to LND ${global.lndRpc.internal_pubkey.substring(0, config.site.pubkeyMaxDisplayLength)} ('${global.lndRpc.internal_alias}')`;
				req.session.userMessageType = "success";

				res.redirect(req.headers.referer);

			}).catch(function(err) {
				console.log("Error 230uhfwequfghewfuew: " + err);

				req.session.userMessage = `Error switching to LND ${global.lndRpc.internal_pubkey.substring(0, config.site.pubkeyMaxDisplayLength)} ('${global.lndRpc.internal_alias}')`;
				req.session.userMessageType = "danger";

				res.redirect(req.headers.referer);
			});
		} else {
			req.session.userMessage = `Already connected to LND ${global.lndRpc.internal_pubkey.substring(0, config.site.pubkeyMaxDisplayLength)} ('${global.lndRpc.internal_alias}')`;

			// no change
			res.redirect(req.headers.referer);
		}
	} else {
		res.locals.userMessage = "To connect to another LND node you must specify a connection index.";

		res.redirect(req.headers.referer);
	}
});

router.get("/nodes", function(req, res) {
	var limit = 20;
	var offset = 0;
	var sort = "last_update-desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = "/nodes";

	var sortProperty = sort.substring(0, sort.indexOf("-"));
	var sortDirection = sort.substring(sort.indexOf("-") + 1);

	rpcApi.getFullNetworkDescription().then(function(fnd) {
		res.locals.fullNetworkDescription = fnd;

		if (sortProperty == "last_update") {
			res.locals.nodeInfos = fnd.nodes.sortedByLastUpdate;

		} else if (sortProperty == "num_channels") {
			res.locals.nodeInfos = fnd.nodes.sortedByChannelCount;

		} else if (sortProperty == "channel_capacity") {
			res.locals.nodeInfos = fnd.nodes.sortedByTotalCapacity;

		} else {
			res.locals.nodeInfos = fnd.nodes.sortedByLastUpdate;
		}

		res.locals.nodeInfos = res.locals.nodeInfos.slice(offset, offset + limit);

		res.render("nodes");
	});
});

router.get("/channels", function(req, res) {
	var limit = 20;
	var offset = 0;
	var sort = "last_update-desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = "/channels";

	var sortProperty = sort.substring(0, sort.indexOf("-"));
	var sortDirection = sort.substring(sort.indexOf("-") + 1);

	rpcApi.getFullNetworkDescription().then(function(fnd) {
		res.locals.fullNetworkDescription = fnd;

		if (sortProperty == "last_update") {
			res.locals.channels = fnd.channels.sortedByLastUpdate;

		} else if (sortProperty == "capacity") {
			res.locals.channels = fnd.channels.sortedByCapacity;

		} else {
			res.locals.channels = fnd.channels.sortedByLastUpdate;
		}

		res.locals.channels = res.locals.channels.slice(offset, offset + limit);

		res.render("channels");

	}).catch(function(err) {
		utils.logError("239yrg239r", err);

		res.render("channels");
	});
});

router.get("/local-channels", function(req, res) {
	var limit = 20;
	var offset = 0;
	var sort = "last_update-desc";
	var status = "active";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = "/channels";

	var sortProperty = sort.substring(0, sort.indexOf("-"));
	var sortDirection = sort.substring(sort.indexOf("-") + 1);

	rpcApi.getFullNetworkDescription().then(function(fnd) {
		res.locals.fullNetworkDescription = fnd;

		rpcApi.getLocalChannels().then(function(localChannels) {
			res.locals.localChannels = localChannels;

			res.render("local-channels");

		}).catch(function(err) {
			utils.logError("37921hdasudfgd", err);

			res.render("local-channels");
		});
	});
});

router.get("/search", function(req, res) {
	if (!req.query.query) {
		res.render("search");

		return;
	}

	var query = req.query.query.toLowerCase().trim();

	res.locals.query = query;

	rpcApi.getFullNetworkDescription().then(function(fnd) {
		res.locals.fullNetworkDescription = fnd;

		if (fnd.nodeInfoByPubkey[query]) {
			res.redirect("/node/" + query);

			return;
		}

		if (fnd.channelsById[query]) {
			res.redirect("/channel/" + query);

			return;
		}

		res.locals.searchResults = {};
		res.locals.searchResults.nodes = [];
		res.locals.searchResults.channels = [];


		fnd.nodes.sortedByLastUpdate.forEach(function(nodeInfo) {
			if (nodeInfo.node.alias.toLowerCase().indexOf(query) > -1) {
				res.locals.searchResults.nodes.push(nodeInfo);
			}

			if (nodeInfo.node.pub_key.toLowerCase().indexOf(query) > -1) {
				res.locals.searchResults.nodes.push(nodeInfo);
			}

			if (nodeInfo.node.color.indexOf(query) > -1) {
				res.locals.searchResults.nodes.push(nodeInfo);
			}

			nodeInfo.node.addresses.forEach(function(address) {
				if (address.addr.indexOf(query) > -1) {
					res.locals.searchResults.nodes.push(nodeInfo);
				}
			});
		});

		fnd.channels.sortedByLastUpdate.forEach(function(channelInfo) {
			if (channelInfo.channel_id.toLowerCase().indexOf(query) > -1) {
				res.locals.searchResults.channels.push(channelInfo);
			}
		});

		res.render("search");
	});
});

router.get("/about", function(req, res) {
	res.render("about");
});

router.get("/connectToPeer", function(req, res) {
	if (!req.query.pubkey) {
		req.session.userMessage = "Unable to connect to peer: missing pubkey";

		res.redirect(req.headers.referer);
	}

	if (!req.query.address) {
		req.session.userMessage = "Unable to connect to peer: missing address";

		res.redirect(req.headers.referer);
	}

	rpcApi.connectToPeer(req.query.pubkey, req.query.address).then(function(response) {
		req.session.userMessage = "Success! Connected to new peer.";
		req.session.userMessageType = "success";

		res.redirect(req.headers.referer);

	}).catch(function(err) {
		req.session.userErrors.push(err);

		utils.logError("397gedgfgggsgsgs", err);

		req.session.userMessage = "Error connecting to peer: " + err + "(" + JSON.stringify(err) + ")";
		req.session.userMessageType = "danger";

		res.redirect(req.headers.referer);
	});
});

router.get("/disconnectPeer", function(req, res) {
	if (!req.query.pubkey) {
		req.session.userMessage = "Unable to disconnect from peer: missing pubkey";

		res.redirect(req.headers.referer);
	}

	rpcApi.disconnectFromPeer(req.query.pubkey).then(function(response) {
		req.session.userMessage = "Success - Disconnected from peer";
		req.session.userMessageType = "success";

		res.redirect(req.headers.referer);

	}).catch(function(err) {
		req.session.userErrors.push(err);

		utils.logError("23407ht40werhg", err);

		req.session.userMessage = "Error disconnecting from peer: " + err + "(" + JSON.stringify(err) + ")";
		req.session.userMessageType = "danger";

		res.redirect(req.headers.referer);
	});
});

router.get("/payment-history", function(req, res) {
	var limit = config.site.pageSizes.invoices;
	var offset = 0;
	var sort = "date-desc";
	var date = "all";
	
	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	if (req.query.date) {
		date = req.query.date.toLowerCase();
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.date = date;
	res.locals.paginationBaseUrl = `/payment-history?sort=${sort}&date=${date}`;

	rpcApi.listPayments().then(function(listPaymentsResponse) {
		var allPayments = listPaymentsResponse.payments;

		var allFilteredPayments = [];

		var predicates = [
			// date
			function(payment) {
				if (date == "all") {
					return true;
				}

				var creation_date = parseInt(payment.creation_date);
				var cutoffs = {"60-min":60*60, "24-hr":60*60*24, "7-day":60*60*24*7, "30-day":60*60*24*30};

				return creation_date >= (new Date().getTime() / 1000 - cutoffs[date]);
			},
		];

		for (var i = 0; i < allPayments.length; i++) {
			var payment = allPayments[i];

			var excluded = false;
			for (var j = 0; j < predicates.length; j++) {
				if (!predicates[j](payment)) {
					excluded = true;

					break;
				}
			}

			if (!excluded) {
				allFilteredPayments.push(payment);
			}
		}

		allFilteredPayments.sort(function(a, b) {
			if (sort == "date-desc") {
				return parseInt(b.creation_date) - parseInt(a.creation_date);

			} else if (sort == "date-asc") {
				return parseInt(a.creation_date) - parseInt(b.creation_date);

			} else if (sort == "value-desc") {
				var diff = parseInt(b.value_msat) - parseInt(a.value_msat);

				if (diff == 0) {
					return parseInt(b.creation_date) - parseInt(a.creation_date);

				} else {
					return diff;
				}
			} else if (sort == "dest-asc") {
				if (a.path[a.path.length - 1] == b.path[b.path.length - 1]) {
					return parseInt(b.creation_date) - parseInt(a.creation_date);

				} else {
					return (a.path[a.path.length - 1] > b.path[b.path.length - 1]) ? 1 : -1;
				}
			} else {
				return parseInt(b.creation_date) - parseInt(a.creation_date);
			}
		});

		var pagedFilteredPayments = [];
		for (var i = offset; i < Math.min(offset + limit, allFilteredPayments.length); i++) {
			pagedFilteredPayments.push(allFilteredPayments[i]);
		}
		
		res.locals.listPaymentsResponse = listPaymentsResponse;

		res.locals.allPayments = listPaymentsResponse.payments;
		res.locals.allFilteredPayments = allFilteredPayments;
		res.locals.pagedFilteredPayments = pagedFilteredPayments;

		res.render("payment-history");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		utils.logError("397gedgfgggsgsgs", err);

		res.render("payment-history");
	});
});

router.get("/send-payment", function(req, res) {
	var promises = [];

	if (req.query.invoice) {
		res.locals.invoice = req.query.invoice;

		promises.push(new Promise(function(resolve, reject) {
			rpcApi.decodeInvoiceString(req.query.invoice).then(function(decodeInvoiceResponse) {
				res.locals.decodedInvoice = decodeInvoiceResponse;

				resolve();

			}).catch(function(err) {
				req.session.userErrors.push(err);

				utils.logError("8yf0342ywe", err);

				reject(err);
			});
		}));
	}

	Promise.all(promises).then(function() {
		res.render("send-payment");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		req.session.userMessage = "Unable to decode payment request: " + err + " (" + JSON.stringify(err) + ")";

		utils.logError("4379t2347g", err);

		res.render("send-payment");
	})
});

router.post("/send-payment", function(req, res) {
	rpcApi.payInvoice(req.query.invoice).then(function(response) {
		res.locals.payInvoiceResponse = response;

		response.payment_preimage_base64 = Buffer.from(response.payment_preimage).toString("base64");
		response.payment_preimage_hex = Buffer.from(response.payment_preimage).toString("hex");

		response.payment_hash_base64 = Buffer.from(response.payment_hash).toString("base64");
		response.payment_hash_hex = Buffer.from(response.payment_hash).toString("hex");

		delete response.payment_preimage;
		delete response.payment_hash;

		console.log("SendPayment response: " + response + ", json: " + JSON.stringify(response, null, 4));

		res.render("send-payment");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		req.session.userMessage = "Error sending payment: " + err + " (" + JSON.stringify(err) + ")";
		req.session.userMessageType = "danger";

		utils.logError("8usedghvcf072g", err);

		res.render("send-payment");
	});
});

router.get("/on-chain-transactions", function(req, res) {
	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getLocalChannels().then(function(localChannels) {
			res.locals.localChannels = localChannels;

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getClosedChannels().then(function(closedChannels) {
			res.locals.closedChannels = closedChannels;

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getOnChainTransactions().then(function(onChainTransactionsResponse) {
			res.locals.onChainTransactions = onChainTransactionsResponse;

			resolve();
		});
	}));

	Promise.all(promises).then(function() {
		res.render("on-chain-transactions");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		utils.logError("32u7rthwe96yfg", err);

		res.render("on-chain-transactions");
	});
});

router.get("/invoices", function(req, res) {
	var limit = config.site.pageSizes.invoices;
	var offset = 0;
	var sort = "created-desc";
	var settled = "all";
	var created = "all";
	
	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	if (req.query.settled) {
		settled = req.query.settled.toLowerCase();
	}

	if (req.query.created) {
		created = req.query.created.toLowerCase();
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.settled = settled;
	res.locals.created = created;
	res.locals.paginationBaseUrl = `/invoices?sort=${sort}&settled=${settled}&created=${created}`;

	rpcApi.getInvoices().then(function(invoicesResponse) {
		if (sort == "created-desc") {
			invoicesResponse.invoices.reverse();
		}

		var allInvoices = invoicesResponse.invoices;
		var filteredInvoices = [];

		var predicates = [
			// settled
			function(inv) {
				if (settled == "all") {
					return true;
				}

				if (settled == "settled") {
					//console.log("set1: " + settled + " - " + inv.settle_date + " - " + (inv.settle_date != "0"));
					return (inv.settle_date != "0");

				} else if (settled == "unsettled") {
					//console.log("set2: " + settled + " - " + inv.settle_date + " - " + (inv.settle_date != "0"));
					return (inv.settle_date == "0");
				}

				// should never happen
				console.log(`Error 237rh2340r7yfre: Unexpected filter value: settled=${settled}`);

				return true;
			},
			// created
			function(inv) {
				if (created == "all") {
					return true;
				}

				var creation_date = parseInt(inv.creation_date);
				var cutoffs = {"60-min":60*60, "24-hr":60*60*24, "7-day":60*60*24*7, "30-day":60*60*24*30};

				//console.log("ct: " + created + " - " + cutoffs[created] + " - " + creation_date + " - " + (new Date().getTime() / 1000 + cutoffs[created]) + " - " + new Date().getTime() / 1000);

				return creation_date >= (new Date().getTime() / 1000 - cutoffs[created]);
			},
		];

		for (var i = 0; i < allInvoices.length; i++) {
			var invoice = allInvoices[i];

			var excluded = false;
			for (var j = 0; j < predicates.length; j++) {
				if (!predicates[j](invoice)) {
					excluded = true;

					break;
				}
			}

			if (!excluded) {
				filteredInvoices.push(invoice);
			}
		}

		var pagedFilteredInvoices = [];
		for (var i = offset; i < Math.min(offset + limit, filteredInvoices.length); i++) {
			pagedFilteredInvoices.push(filteredInvoices[i]);
		}

		var filteredCount = allInvoices.length - filteredInvoices.length;

		var invoices = [];
		for (var i = offset; i < Math.min(limit + offset, invoicesResponse.invoices.length); i++) {
			invoices.push(invoicesResponse.invoices[i]);
		}

		res.locals.invoices = invoices;
		
		res.locals.filteredCount = filteredCount;

		res.locals.allInvoices = invoicesResponse.invoices;
		res.locals.allFilteredInvoices = filteredInvoices;
		res.locals.pagedFilteredInvoices = pagedFilteredInvoices;

		res.locals.invoiceCount = invoicesResponse.invoices.length;
		
		res.render("invoices");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		utils.logError("3214r97y2gwefy", err);

		res.render("invoices");
	});
});

router.get("/openchannel", function(req, res) {
	res.locals.pubkey = req.query.pubkey;
	
	res.render("openchannel");
});

router.get("/lndconnect", function(req, res) {
	/*var fs = require('fs');

	fs.open('file.txt', 'r', function(status, fd) {
		if (status) {
			console.log(status.message);
			return;
		}
		var buffer = Buffer.alloc(100);
		fs.read(fd, buffer, 0, 100, 0, function(err, num) {
			console.log(buffer.toString('utf8', 0, num));
		});
	});

	utils.buildQrCodeUrls(qrcodeStrings).then(function(qrcodeUrls) {
		res.locals.qrcodeUrls = qrcodeUrls;

		res.render("lndconnect");

	}).catch(function(err) {
		utils.logError("3e0ufhdhfsdss", err);
		
		res.render("lndconnect");
	});*/
	res.render("lndconnect");
});

module.exports = router;
