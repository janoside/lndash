const hashjs = require('hash.js');

var express = require('express');
var router = express.Router();
var util = require('util');
var moment = require('moment');
var utils = require('./../app/utils');
var bitcoinCore = require("bitcoin-core");
var rpcApi = require("./../app/rpcApi.js");
var qrcode = require('qrcode');
var fs = require("fs");
var qrImage = require('qr-image');

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
			
			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getNetworkInfo().then(function(networkInfoResponse) {
			res.locals.networkInfo = networkInfoResponse;

			resolve();
		
		}).catch(function(err) {
			utils.logError("234r078sdh907gsdgs", err);
			
			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getFullNetworkDescription().then(function(fnd) {
			res.locals.fullNetworkDescription = fnd;

			resolve();
		
		}).catch(function(err) {
			utils.logError("23r08dsh0shg", err);
			
			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getLocalChannels().then(function(localChannelsResponse) {
			res.locals.localChannelsResponse = localChannelsResponse;

			var totalLocalBalance = 0;
			var totalRemoteBalance = 0;
			
			localChannelsResponse.channels.forEach(function(chan) {
				totalLocalBalance += parseInt(chan.local_balance);
				totalRemoteBalance += parseInt(chan.remote_balance);
			});

			res.locals.totalLocalBalance = totalLocalBalance;
			res.locals.totalRemoteBalance = totalRemoteBalance;

			resolve();
		
		}).catch(function(err) {
			utils.logError("325078whs0d7hg8s", err);
			
			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getChannelBalance().then(function(channelBalanceResponse) {
			res.locals.channelBalance = channelBalanceResponse;

			resolve();

		}).catch(function(err) {
			utils.logError("397rehsdf90gs", err);

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getWalletBalance().then(function(walletBalanceResponse) {
			res.locals.walletBalance = walletBalanceResponse;

			resolve();
		
		}).catch(function(err) {
			utils.logError("23r079uhsd0gsh", err);
			
			reject(err);
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

router.get("/setup", function(req, res) {
	res.render("setup");
});

router.post("/setup", function(req, res) {
	var pwd = req.body.password;
	var pwdConf = req.body.passwordConfirmation;

	if (pwd != pwdConf) {
		res.locals.userMessage = "Passwords do not match.";
		res.locals.userMessageType = "danger";

		res.render("setup");

		return;
	}

	global.adminPassword = pwd;

	var pwdSha256 = hashjs.sha256().update(pwd).digest('hex');

	global.adminCredentials = {};
	global.adminCredentials.adminPasswordSha256 = pwdSha256;

	utils.saveAdminCredentials(global.adminPassword);

	req.session.admin = true;

	req.session.userMessage = "Administrative password set";
	req.session.userMessageType = "success";

	res.redirect("/manage-nodes?setup=true");
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

		}).catch(function(err) {
			utils.logError("3279hsd907ts", err);

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getWalletBalance().then(function(walletBalanceResponse) {
			res.locals.walletBalance = walletBalanceResponse;

			resolve();

		}).catch(function(err) {
			utils.logError("3297rtwe7tg", err);

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getLocalChannels().then(function(localChannels) {
			res.locals.localChannels = localChannels;

			resolve();
		
		}).catch(function(err) {
			utils.logError("2307rwehdsgds", err);

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getClosedChannels().then(function(closedChannels) {
			res.locals.closedChannels = closedChannels;

			resolve();
		
		}).catch(function(err) {
			utils.logError("3r07wgshsgs", err);

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getWalletUtxos().then(function(walletUtxosResponse) {
			res.locals.walletUtxosResponse = walletUtxosResponse;

			resolve();
		
		}).catch(function(err) {
			utils.logError("32078sdhsghgsh", err);

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getOnChainTransactions().then(function(onChainTransactionsResponse) {
			res.locals.onChainTransactions = onChainTransactionsResponse;

			resolve();
		
		}).catch(function(err) {
			utils.logError("213e087hy07sgdh", err);

			reject(err);
		});
	}));

	Promise.all(promises).then(function() {
		res.render("wallet");

	}).catch(function(err) {
		utils.logError("3r9ygew9fgvew9fd", err);

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
	var limit = config.site.pageSizes.peers;
	var offset = 0;
	var sort = "pubkey-asc";
	
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
	res.locals.paginationBaseUrl = `/peers?sort=${sort}`;



	var promises = [];

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

		}).catch(function(err) {
			utils.logError("3297rhgdgvsf1", err);

			reject(err);
		});
	}));

	Promise.all(promises).then(function() {
		var allPeers = res.locals.listPeers.peers;
		var allFilteredPeers = [];

		var predicates = [
			function(peer) {
				return true;
			},
		];

		for (var i = 0; i < allPeers.length; i++) {
			var peer = allPeers[i];

			var excluded = false;
			for (var j = 0; j < predicates.length; j++) {
				if (!predicates[j](peer)) {
					excluded = true;

					break;
				}
			}

			if (!excluded) {
				allFilteredPeers.push(peer);
			}
		}

		allFilteredPeers.sort(function(a, b) {
			if (sort == "pubkey-asc") {
				return ('' + a.pub_key).localeCompare(b.pub_key);

			} else if (sort == "alias-asc") {
				var aNode = res.locals.fullNetworkDescription.nodeInfoByPubkey[a.pub_key];
				var bNode = res.locals.fullNetworkDescription.nodeInfoByPubkey[b.pub_key];

				var aAlias = (aNode ? aNode.node.alias.toLowerCase() : "Unknown");
				var bAlias = (bNode ? bNode.node.alias.toLowerCase() : "Unknown");

				return ('' + aAlias).localeCompare(bAlias);

			} else if (sort == "ip-asc") {
				return ('' + a.address).localeCompare(b.address);

			} else if (sort == "valuetransfer-desc") {
				var aVal = parseInt(a.sat_sent) + parseInt(a.sat_recv);
				var bVal = parseInt(b.sat_sent) + parseInt(b.sat_recv);
				var diff = bVal - aVal;

				if (diff == 0) {
					return ('' + a.pub_key).localeCompare(b.pub_key);

				} else {
					return diff;
				}
			} else if (sort == "datatransfer-desc") {
				var aVal = parseInt(a.bytes_sent) + parseInt(a.bytes_recv);
				var bVal = parseInt(b.bytes_sent) + parseInt(b.bytes_recv);
				var diff = bVal - aVal;

				if (diff == 0) {
					return ('' + a.pub_key).localeCompare(b.pub_key);

				} else {
					return diff;
				}
			} else {
				return ('' + a.pub_key).localeCompare(b.pub_key);
			}
		});



		var pagedFilteredPeers = [];
		for (var i = offset; i < Math.min(offset + limit, allFilteredPeers.length); i++) {
			pagedFilteredPeers.push(allFilteredPeers[i]);
		}

		res.locals.allPeers = allPeers;
		res.locals.allFilteredPeers = allFilteredPeers;
		res.locals.pagedFilteredPeers = pagedFilteredPeers;


		res.render("peers");

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

	var pwdHash = hashjs.sha256().update(req.body.password).digest('hex');
	
	if (pwdHash == global.adminCredentials.adminPasswordSha256) {
		var connectToLndNeeded = true;
		if (global.adminPassword) {
			connectToLndNeeded = false;
		}

		global.adminPassword = req.body.password;

		global.adminCredentials = utils.loadAdminCredentials(global.adminPassword);

		req.session.admin = true;

		if (connectToLndNeeded && global.adminCredentials.lndNodes && global.adminCredentials.lndNodes.length > 0) {
			rpcApi.connectAllNodes().then(function() {
				if (req.session.loginRedirect) {
					res.redirect(req.session.loginRedirect);

					return;
				}

				res.redirect("/");

			}).catch(function(err) {
				req.session.userMessage = "Error encountered while connecting to LND. See logs for details.";
				req.session.userMessageType = "danger";

				utils.logError("23r97gsd97gss", err);

				if (req.session.loginRedirect) {
					res.redirect(req.session.loginRedirect);

					return;
				}

				res.redirect("/");
			});

		} else {
			if (req.session.loginRedirect) {
				res.redirect(req.session.loginRedirect);

				return;
			}

			res.redirect("/");
		}

		return;

	} else {
		console.log(`Password hash mismatch: ${pwdHash} vs ${global.adminCredentials.adminPasswordSha256}`);
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

router.get("/forwarding-history", function(req, res) {
	var startTime = new Date().getTime() - 24 * 60 * 60;
	var endTime = new Date().getTime();
	var limit = 20;
	var offset = 0;

	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getForwardingHistory(startTime, endTime, limit, offset).then(function(forwardingHistoryResponse) {
			res.locals.forwardingHistoryResponse = forwardingHistoryResponse;

			resolve();

		}).catch(function(err) {
			res.locals.forwardingHistoryError = err;

			utils.logError("703yrwegfddsg", err);

			reject(err);
		});
	}));

	Promise.all(promises).then(function() {
		res.render("forwarding-history");

	}).catch(function(err) {
		utils.logError("932hr9y7wgdfcd", err);

		res.render("forwarding-history");
	});
	
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
			global.lndRpc = global.lndConnections.byIndex[lndIndex];

			rpcApi.refreshLocalChannels();
			rpcApi.refreshLocalClosedChannels();

			rpcApi.refreshFullNetworkDescription(true).then(function() {
				req.session.userMessage = `Switched to LND ${global.lndRpc.internal_pubkey.substring(0, config.site.pubkeyMaxDisplayLength)} ('${global.lndRpc.internal_alias}')`;
				req.session.userMessageType = "success";

				res.redirect(req.headers.referer);

			}).catch(function(err) {
				utils.logError("230uhfwequfghewfuew", err);

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
	res.locals.paginationBaseUrl = `/nodes?sort=${sort}`;

	var sortProperty = sort.substring(0, sort.indexOf("-"));
	var sortDirection = sort.substring(sort.indexOf("-") + 1);

	rpcApi.getFullNetworkDescription().then(function(fnd) {
		res.locals.fullNetworkDescription = fnd;

		var allNodes = fnd.nodes.sortedByLastUpdate;
		var allFilteredNodes = allNodes;

		if (sortProperty == "last_update") {
			allFilteredNodes = fnd.nodes.sortedByLastUpdate;

		} else if (sortProperty == "num_channels") {
			allFilteredNodes = fnd.nodes.sortedByChannelCount;

		} else if (sortProperty == "channel_capacity") {
			allFilteredNodes = fnd.nodes.sortedByTotalCapacity;
		}

		var pagedFilteredNodes = [];
		for (var i = offset; i < Math.min(offset + limit, allFilteredNodes.length); i++) {
			pagedFilteredNodes.push(allFilteredNodes[i]);
		}

		res.locals.allNodes = allNodes;
		res.locals.allFilteredNodes = allFilteredNodes;
		res.locals.pagedFilteredNodes = pagedFilteredNodes;

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
	res.locals.paginationBaseUrl = `/channels?sort=${sort}`;

	var sortProperty = sort.substring(0, sort.indexOf("-"));
	var sortDirection = sort.substring(sort.indexOf("-") + 1);

	rpcApi.getFullNetworkDescription().then(function(fnd) {
		res.locals.fullNetworkDescription = fnd;

		var allChannels = fnd.channels.sortedByLastUpdate;
		var allFilteredChannels = fnd.channels.sortedByLastUpdate;

		if (sortProperty == "last_update") {
			allFilteredChannels = fnd.channels.sortedByLastUpdate;

		} else if (sortProperty == "capacity") {
			allFilteredChannels = fnd.channels.sortedByCapacity;

		} else {
			allFilteredChannels = fnd.channels.sortedByLastUpdate;
		}

		var pagedFilteredChannels = [];
		for (var i = offset; i < Math.min(offset + limit, allFilteredChannels.length); i++) {
			pagedFilteredChannels.push(allFilteredChannels[i]);
		}

		res.locals.allChannels = allChannels;
		res.locals.allFilteredChannels = allFilteredChannels;
		res.locals.pagedFilteredChannels = pagedFilteredChannels;

		res.render("channels");

	}).catch(function(err) {
		utils.logError("239yrg239r", err);

		res.render("channels");
	});
});

router.get("/local-channels", function(req, res) {
	var limit = 20;
	var offset = 0;
	var sort = "capacity-desc";
	var localbalance = "all";
	var remotebalance = "all";
	var status = "all";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}
	
	if (req.query.status) {
		status = req.query.status.toLowerCase();
	}

	if (req.query.localbalance) {
		localbalance = req.query.localbalance.toLowerCase();
	}

	if (req.query.remotebalance) {
		remotebalance = req.query.remotebalance.toLowerCase();
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.status = status;
	res.locals.localbalance = localbalance;
	res.locals.remotebalance = remotebalance;
	res.locals.paginationBaseUrl = `/local-channels?status=${status}&localbalance=${localbalance}&remotebalance=${remotebalance}`;

	var sortProperty = sort.substring(0, sort.indexOf("-"));
	var sortDirection = sort.substring(sort.indexOf("-") + 1);

	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getFullNetworkDescription().then(function(fnd) {
			res.locals.fullNetworkDescription = fnd;

			resolve();

		}).catch(function(err) {
			utils.logError("397rgdsfgsds", err);

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getLocalChannels().then(function(localChannels) {
			res.locals.localChannels = localChannels;

			resolve();

		}).catch(function(err) {
			utils.logError("2308rhsd0u7fhgsd", err);

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getPendingChannels().then(function(pendingChannelsResponse) {
			res.locals.pendingChannelsResponse = pendingChannelsResponse;

			res.locals.pendingOpenChannels = pendingChannelsResponse.pending_open_channels;
			res.locals.pendingCloseChannels = pendingChannelsResponse.pending_closing_channels;
			res.locals.pendingForceCloseChannels = pendingChannelsResponse.pending_force_closing_channels;

			// aggregate into single array for ease of use
			res.locals.pendingChannels = [];

			res.locals.pendingOpenChannels.forEach(function(chan) {
				res.locals.pendingChannels.push(chan);
			});

			res.locals.pendingCloseChannels.forEach(function(chan) {
				res.locals.pendingChannels.push(chan);
			});

			res.locals.pendingForceCloseChannels.forEach(function(chan) {
				res.locals.pendingChannels.push(chan);
			});

			resolve();

		}).catch(function(err) {
			utils.logError("23r83n2whw", err);

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getClosedChannels().then(function(closedChannels) {
			res.locals.closedChannels = closedChannels;

			resolve();

		}).catch(function(err) {
			utils.logError("23r0789h7dsss", err);

			reject(err);
		});
	}));

	Promise.all(promises).then(function() {
		var allChannels = [];
		
		res.locals.localChannels.channels.forEach(function(chan) {
			allChannels.push(chan);
		});

		res.locals.pendingChannels.forEach(function(openingChan) {
			allChannels.push(openingChan);
		});

		res.locals.closedChannels.channels.forEach(function(chan) {
			allChannels.push(chan);
		});

		var allFilteredChannels = [];





		var predicates = [
			// status
			function(chan) {
				if (status == "all") {
					return true;
				}

				if (status == "active") {
					return res.locals.localChannels.channels.includes(chan) && chan.active;

				} else if (status == "inactive") {
					return res.locals.localChannels.channels.includes(chan) && !chan.active;

				} else if (status == "pending") {
					return res.locals.pendingChannels.includes(chan);

				} else if (status == "closed") {
					return res.locals.closedChannels.channels.includes(chan);
				}

				// should never happen
				console.log(`Error 23r087hwfed0hsd: Unexpected filter value: status=${status}`);

				return true;
			},
			// localbalance
			function(chan) {
				if (localbalance == "all") {
					return true;
				}

				if (localbalance == "yes") {
					return res.locals.localChannels.channels.includes(chan) && chan.local_balance > 0;

				} else if (localbalance == "no") {
					return res.locals.closedChannels.channels.includes(chan) || res.locals.pendingChannels.includes(chan) || chan.local_balance <= 0;
				}

				// should never happen
				console.log(`Error 432t07hsd0fghs: Unexpected filter value: localbalance=${localbalance}`);

				return true;
			},
			// remotebalance
			function(chan) {
				if (remotebalance == "all") {
					return true;
				}

				if (remotebalance == "yes") {
					return res.locals.localChannels.channels.includes(chan) && chan.remote_balance > 0;

				} else if (remotebalance == "no") {
					return res.locals.closedChannels.channels.includes(chan) || res.locals.pendingChannels.includes(chan) ||chan.remote_balance <= 0;
				}

				// should never happen
				console.log(`Error 23r9uyewhb0s9gys: Unexpected filter value: remotebalance=${remotebalance}`);

				return true;
			},
		];

		for (var i = 0; i < allChannels.length; i++) {
			var channel = allChannels[i];

			var excluded = false;
			for (var j = 0; j < predicates.length; j++) {
				if (!predicates[j](channel)) {
					excluded = true;

					break;
				}
			}

			if (!excluded) {
				allFilteredChannels.push(channel);
			}
		}


		allFilteredChannels.sort(function(a, b) {
			var aInfo = res.locals.fullNetworkDescription.channelsById[a.chan_id];
			var bInfo = res.locals.fullNetworkDescription.channelsById[b.chan_id];

			var fallback = 0;
			if (a.active && !b.active) {
				fallback = -1;

			} else if (!a.active && b.active) {
				fallback = 1;

			} else if (aInfo != null && bInfo != null) {
				fallback = bInfo.last_update - aInfo.last_update;
			}

			if (sort == "capacity-desc") {
				var a1 = (a.active ? a.capacity : 0);
				var b1 = (b.active ? b.capacity : 0);
				var diff = b1 - a1;

				if (diff == 0) {
					return fallback;

				} else {
					return diff;
				}
			} else if (sort == "localbalance-desc") {
				var a1 = (a.active ? a.local_balance : 0);
				var b1 = (b.active ? b.local_balance : 0);
				var diff = b1 - a1;

				if (diff == 0) {
					return fallback;
					
				} else {
					return diff;
				}
			} else if (sort == "remotebalance-desc") {
				var a1 = (a.active ? a.remote_balance : 0);
				var b1 = (b.active ? b.remote_balance : 0);
				var diff = b1 - a1;

				if (diff == 0) {
					return fallback;
					
				} else {
					return diff;
				}
			} else if (sort == "valuetransfer-desc") {
				var a1 = (a.active ? parseInt(a.total_satoshis_sent) + parseInt(a.total_satoshis_received) : 0);
				var b1 = (b.active ? parseInt(b.total_satoshis_sent) + parseInt(b.total_satoshis_received) : 0);
				var diff = b1 - a1;

				if (diff == 0) {
					return fallback;
					
				} else {
					return diff;
				}
			} else if (sort == "updated-desc") {
				return fallback;
			}
		});







		var pagedFilteredChannels = [];
		for (var i = offset; i < Math.min(offset + limit, allFilteredChannels.length); i++) {
			pagedFilteredChannels.push(allFilteredChannels[i]);
		}

		res.locals.allChannels = allChannels;
		res.locals.allFilteredChannels = allFilteredChannels;
		res.locals.pagedFilteredChannels = pagedFilteredChannels;

		res.render("local-channels");

	}).catch(function(err) {
		utils.logError("23r97hwef7usdgdsf", err);

		res.render("local-channels");
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

router.get("/manage-nodes", function(req, res) {
	res.locals.inputType = "fileInput";

	if (req.query.setup) {
		res.locals.setupActive = true;
	}

	res.render("manage-nodes");
});

router.post("/manage-nodes", function(req, res) {
	var promises = [];

	var inputType = req.body.inputType;

	res.locals.inputType = inputType;

	// copied to res.locals on error, so form can be re-filled
	var userFormParams = {};

	if (inputType == "fileInput") {
		var host = "localhost";
		var port = "10009";
		var adminMacaroonFilepath = "~/.lnd/admin.macaroon";
		var tlsCertFilepath = "~/.lnd/tls.cert";

		if (req.body.host) {
			host = req.body.host;

			userFormParams.host = host;
		}

		if (req.body.port) {
			port = req.body.port;

			userFormParams.port = port;
		}

		if (req.body.adminMacaroonFilepath) {
			adminMacaroonFilepath = req.body.adminMacaroonFilepath;

			userFormParams.adminMacaroonFilepath = adminMacaroonFilepath;
		}

		if (req.body.tlsCertFilepath) {
			tlsCertFilepath = req.body.tlsCertFilepath;

			userFormParams.tlsCertFilepath = tlsCertFilepath;
		}

		if (global.adminCredentials.lndNodes == null) {
			global.adminCredentials.lndNodes = [];
		}

		var newLndNode = {
			type: "fileInput",
			host: host,
			port: port,
			adminMacaroonFilepath: adminMacaroonFilepath,
			tlsCertFilepath: tlsCertFilepath
		};

		global.adminCredentials.lndNodes.push(newLndNode);

		promises.push(rpcApi.connect(newLndNode, global.adminCredentials.lndNodes.length - 1));

	} else if (inputType == "rawTextInput") {
		var host = "localhost";
		var port = "10009";

		if (req.body.host) {
			host = req.body.host;

			userFormParams.host = host;
		}

		if (req.body.port) {
			port = req.body.port;

			userFormParams.port = port;
		}

		var adminMacaroonHex = req.body.adminMacaroonHex;
		var tlsCertAscii = req.body.tlsCertAscii.replace(/\r\n/g, "\n");

		userFormParams.adminMacaroonHex = adminMacaroonHex;
		userFormParams.tlsCertAscii = tlsCertAscii;

		var missingParams = false;
		if (!adminMacaroonHex) {
			res.locals.userMessage = "Missing required value: Admin Macaroon (hex)";
			res.locals.userMessageType = "danger";

			missingParams = true;
		}

		if (!tlsCertAscii) {
			res.locals.userMessage = "Missing required value: TLS Certificate (ascii)";
			res.locals.userMessageType = "danger";

			missingParams = true;
		}

		if (missingParams) {
			for (var prop in userFormParams) {
				if (userFormParams.hasOwnProperty(prop)) {
					res.locals[prop] = userFormParams[prop];
				}
			}

			res.render("manage-nodes");

			return;
		}

		if (global.adminCredentials.lndNodes == null) {
			global.adminCredentials.lndNodes = [];
		}

		var newLndNode = {
			type: "rawTextInput",
			host: host,
			port: port,
			adminMacaroonHex: adminMacaroonHex,
			tlsCertAscii: tlsCertAscii
		};

		global.adminCredentials.lndNodes.push(newLndNode);

		promises.push(rpcApi.connect(newLndNode, global.adminCredentials.lndNodes.length - 1));

	} else if (inputType == "lndconnectString") {
		var lndconnectString = req.body.lndconnectString;

		userFormParams.lndconnectString = lndconnectString;
		
		if (!lndconnectString) {
			for (var prop in userFormParams) {
				if (userFormParams.hasOwnProperty(prop)) {
					res.locals[prop] = userFormParams[prop];
				}
			}

			res.render("manage-nodes");

			return;
		}

		if (global.adminCredentials.lndNodes == null) {
			global.adminCredentials.lndNodes = [];
		}

		var newLndNode = {
			type: "lndconnectString",
			lndconnectString: lndconnectString
		};

		global.adminCredentials.lndNodes.push(newLndNode);

		promises.push(rpcApi.connect(newLndNode, global.adminCredentials.lndNodes.length - 1));
	}

	Promise.all(promises).then(function() {
		utils.saveAdminCredentials(global.adminPassword);

		res.locals.userMessage = "Successfully added LND Node";
		res.locals.userMessageType = "success";

		if (global.setupNeeded) {
			global.setupNeeded = false;

			rpcApi.connectAllNodes().then(function() {
				req.session.userMessage = "<h3 class='h5'>Setup complete</h3><span>Welcome to LND Admin!</span>";
				req.session.userMessageType = "success";

				res.redirect("/");

			}).catch(function(err) {
				utils.logError("32r08eus08ys0y8hs", err);

				res.locals.userMessage = "Error while connecting to LND";
				res.locals.userMessageType = "danger";

				res.render("manage-nodes");
			});

		} else {
			res.render("manage-nodes");
		}
	}).catch(function(err) {
		utils.logError("32078rhesdghss", err);

		for (var prop in userFormParams) {
			if (userFormParams.hasOwnProperty(prop)) {
				res.locals[prop] = userFormParams[prop];
			}
		}

		res.render("manage-nodes");
	});
});

router.get("/delete-lnd-node", function(req, res) {
	if (!req.query.index) {
		req.session.userMessage = "Must specify the index of the configuration you want to remove";
		req.session.userMessageType = "danger";

		res.redirect(req.headers.referer);

	} else {
		var indexToDelete = parseInt(req.query.index);

		global.adminCredentials.lndNodes.splice(indexToDelete, 1);

		utils.saveAdminCredentials(global.adminPassword);

		if (global.adminCredentials.lndNodes.length > 0) {
			// refresh lndConnections
			rpcApi.connectAllNodes().then(function() {
				req.session.userMessage = `Deleted LND Node #${indexToDelete + 1}`;
				req.session.userMessageType = "success";

				res.redirect(req.headers.referer);

			}).catch(function(err) {
				req.session.userMessage = `Failed to refresh after deleting LND Node #${indexToDelete + 1}`;
				req.session.userMessageType = "danger";

				utils.logError("3er79sdhf0sghs", err);

				res.redirect(req.headers.referer);
			});

		} else {
			global.setupNeeded = true;

			res.redirect("/");
		}
	}
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

router.get("/pay-invoice", function(req, res) {
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
		res.render("pay-invoice");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		res.locals.userMessage = "Unable to decode payment request: " + err + " (" + JSON.stringify(err) + ")";
		res.locals.userMessageType = "warning";

		utils.logError("4379t2347g", err);

		res.render("pay-invoice");
	})
});

router.post("/pay-invoice", function(req, res) {
	rpcApi.payInvoice(req.query.invoice).then(function(response) {
		res.locals.payInvoiceResponse = response;

		response.payment_preimage_base64 = Buffer.from(response.payment_preimage).toString("base64");
		response.payment_preimage_hex = Buffer.from(response.payment_preimage).toString("hex");

		response.payment_hash_base64 = Buffer.from(response.payment_hash).toString("base64");
		response.payment_hash_hex = Buffer.from(response.payment_hash).toString("hex");

		delete response.payment_preimage;
		delete response.payment_hash;

		res.render("pay-invoice");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		req.session.userMessage = "Error sending payment: " + err + " (" + JSON.stringify(err) + ")";
		req.session.userMessageType = "danger";

		utils.logError("8usedghvcf072g", err);

		res.render("pay-invoice");
	});
});

router.get("/send-payment", function(req, res) {
	var promises = [];

	if (req.query.destPubkey) {
		res.locals.destPubkey = req.query.destPubkey;
	}

	if (req.query.amountSat) {
		res.locals.amountSat = req.query.amountSat;
	}

	Promise.all(promises).then(function() {
		res.render("send-payment");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		utils.logError("24308trhw4078hrwhs", err);

		res.render("send-payment");
	})
});

router.get("/new-deposit-address", function(req, res) {
	var promises = [];

	var addressType = "p2wkh";
	if (req.query.addressType) {
		addressType = req.query.addressType;
	}

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getNewDepositAddress(addressType).then(function(newDepositAddressResponse) {
			res.locals.newDepositAddressResponse = newDepositAddressResponse;

			resolve();

		}).catch(function(err) {
			res.locals.newDepositAddressError = err;

			utils.logError("2397rgse9fgs9dg", err);

			reject(err);
		});
	}));

	Promise.all(promises).then(function() {
		if (res.locals.newDepositAddressResponse) {
			res.json(res.locals.newDepositAddressResponse);

		} else if (res.locals.newDepositAddressError) {
			res.json(res.locals.newDepositAddressError);

		} else {
			utils.logError("3297rgsd97gs", `Unknown error when trying to generate new deposit address: type=${addressType}`);

			res.json({success:false, error:"Unknown", errorId:"3297rgsd97gs"});
		}
	}).catch(function(err) {
		utils.logError("20ddd8rhsd8hs", err);

		res.json({success:false, error:err, errorId:"20ddd8rhsd8hs"});
	})
});

router.post("/send-payment", function(req, res) {
	var promises = [];

	var destPubkey = "";
	var amountSat = 0;

	if (req.body.destPubkey) {
		destPubkey = req.body.destPubkey;
	}

	if (req.body.amountSat) {
		amountSat = parseInt(req.body.amountSat);
	}

	res.locals.destPubkey = destPubkey;
	res.locals.amountSat = amountSat;

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.sendPayment(destPubkey, amountSat).then(function(sendPaymentResponse) {
			res.locals.sendPaymentResponse = sendPaymentResponse;

			resolve();

		}).catch(function(err) {
			res.locals.sendPaymentError = err;

			utils.logError("973hrwdgfs", err);

			reject(err);
		});
	}));

	Promise.all(promises).then(function() {
		res.render("send-payment");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		utils.logError("3290r7ghsd9gsd", err);

		res.render("send-payment");
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
		var allFilteredInvoices = [];

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
				allFilteredInvoices.push(invoice);
			}
		}

		var pagedFilteredInvoices = [];
		for (var i = offset; i < Math.min(offset + limit, allFilteredInvoices.length); i++) {
			pagedFilteredInvoices.push(allFilteredInvoices[i]);
		}

		var filteredCount = allInvoices.length - allFilteredInvoices.length;

		var invoices = [];
		for (var i = offset; i < Math.min(limit + offset, invoicesResponse.invoices.length); i++) {
			invoices.push(invoicesResponse.invoices[i]);
		}

		res.locals.invoices = invoices;
		
		res.locals.filteredCount = filteredCount;

		res.locals.allInvoices = invoicesResponse.invoices;
		res.locals.allFilteredInvoices = allFilteredInvoices;
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

router.post("/openchannel", function(req, res) {
	if (!req.body.pubkey) {
		res.locals.userMessage = "Must specify the remote node's public key.";
		res.locals.userMessageType = "danger";

		res.render("openchannel");

		return;
	}

	var pubkey = req.body.pubkey;
	var local_balance = 0;
	var remote_balance = 0;

	if (req.body.local_balance) {
		local_balance = parseInt(req.body.local_balance);
	}

	if (req.body.remote_balance) {
		remote_balance = parseInt(req.body.remote_balance);
	}

	res.locals.pubkey = req.body.pubkey;
	res.locals.local_balance = local_balance;
	res.locals.remote_balance = remote_balance;

	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.openChannel(pubkey, local_balance, remote_balance).then(function(openChannelResponse) {
			res.locals.openChannelResponse = openChannelResponse;

			resolve();

		}).catch(function(err) {
			res.locals.openChannelError = err;

			utils.logError("3r97ghsd7gss", err);

			reject(err);
		});
	}));

	Promise.all(promises).then(function() {
		res.render("openchannel");

	}).catch(function(err) {
		utils.logError("397rgheas907gts7", err);

		res.render("openchannel");
	});
});

router.get("/error-log", function(req, res) {
	res.locals.errorLog = [];

	if (global.errorLog) {
		res.locals.errorLog = global.errorLog.slice();
		res.locals.errorLog.reverse();
	}
	
	res.render("error-log");
});

router.get("/qrcode", function(req, res) {
	var data = "";

	if (req.query.data) {
		data = req.query.data;
	}

	var code = qrImage.image(data, { type: 'svg' });
	res.type('svg');

	code.pipe(res);
});

router.post("/withdraw-funds", function(req, res) {
	var withdrawType = req.body.withdrawType;

	if (withdrawType == "single") {
		var address = req.body.address;
		var sendAll = req.body.sendAll;
		var amountSat = parseInt(req.body.amountSat);
		var speedType = req.body.speedType;
		var speedValue = req.body.speedValue;

		var sendStr = `${address}:${(amountSat > 0 ? amountSat : "all")}`;

		rpcApi.sendCoins(sendStr, speedType, speedValue).then(function(response) {
			res.json(response);

		}).catch(function(err) {
			res.json(err);
		});
	} else if (withdrawType == "multi") {
	}
});

router.get("/lndconnect", function(req, res) {
	var securityNoteAccepted = false;
	if (req.query.securityNoteAccepted) {
		securityNoteAccepted = (req.query.securityNoteAccepted == "true");
	}

	res.locals.securityNoteAccepted = securityNoteAccepted;

	if (securityNoteAccepted) {
		var lndNodeIndex = lndRpc.internal_index;
		var lndConfig = global.adminCredentials.lndNodes[lndNodeIndex];

		var lndconnectString = null;

		if (lndConfig.type == "fileInput") {
			var tlsCertAscii = fs.readFileSync(lndConfig.tlsCertFilepath);
			var macaroon = fs.readFileSync(lndConfig.adminMacaroonFilepath);

			lndconnectString = utils.formatLndconnectString({
				host:lndConfig.host,
				port:lndConfig.port,
				adminMacaroonHex:macaroon.toString("hex"),
				tlsCertAscii:tlsCertAscii.toString("utf-8")
			});

		} else if (lndConfig.type == "rawTextInput") {
			lndconnectString = utils.formatLndconnectString({
				host:lndConfig.host,
				port:lndConfig.port,
				adminMacaroonHex:lndConfig.adminMacaroonHex,
				tlsCertAscii:lndConfig.tlsCertAscii
			});

		} else if (lndConfig.type == "lndconnectString") {
			lndconnectString = lndConfig.lndconnectString;
		}

		res.locals.lndconnectString = lndconnectString;
	}

	res.render("lndconnect");
});

module.exports = router;
