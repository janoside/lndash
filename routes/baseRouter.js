const debug = require("debug");
const debugLog = debug("lndash:router");

const hashjs = require('hash.js');

const express = require('express');
const router = express.Router();
const util = require('util');
const moment = require('moment');
const utils = require('./../app/utils');
const rpcApi = require("./../app/rpcApi.js");
const qrcode = require('qrcode');
const fs = require("fs");
const qrImage = require('qr-image');
const untildify = require("untildify");
const asyncHandler = require("express-async-handler");
const Decimal = require('decimal.js');
const passwordUtils = require("./../app/passwordUtils.js");
const encryptionUtils = require("./../app/encryptionUtils.js");


router.get("/", asyncHandler(async (req, res, next) => {
	try {
		res.locals.getInfo = await rpcApi.getInfo();
		res.locals.networkInfo = await rpcApi.getNetworkInfo();
		
		let localChannelsResponse = await rpcApi.getLocalChannels(false);

		let totalLocalBalance = new Decimal(0);
		let totalRemoteBalance = new Decimal(0);
		
		localChannelsResponse.channels.forEach((chan) => {
			const localBalance = parseInt(chan.local_balance)
			const remoteBalance = parseInt(chan.remote_balance)
			if (!isNaN(localBalance)) {
				totalLocalBalance = totalLocalBalance.plus(localBalance);
			}
			if (!isNaN(remoteBalance)) {
				totalRemoteBalance = totalRemoteBalance.plus(remoteBalance);
			}
		});

		res.locals.totalLocalBalance = totalLocalBalance;
		res.locals.totalRemoteBalance = totalRemoteBalance;


		res.locals.walletBalance = await rpcApi.getWalletBalance();

	} catch (e) {
		utils.logError("3208ywheew3", e);

		res.locals.pageErrors.push(utils.logError("3208ywheew3", e));

	} finally {
		res.render("index");
	}
}));

router.get("/node/:nodePubkey", asyncHandler(async (req, res) => {
	try {
		let nodePubkey = req.params.nodePubkey;

		res.locals.nodePubkey = nodePubkey;


		let ListPeers = util.promisify(lndRpc.ListPeers.bind(lndRpc));
		let listPeersResponse = await ListPeers({});
		res.locals.listPeers = listPeersResponse;

		res.locals.peerPubkeys = [];
		if (listPeersResponse.peers) {
			listPeersResponse.peers.forEach((peerInfo) => {
				res.locals.peerPubkeys.push(peerInfo.pub_key);
			});
		}



		res.locals.localChannels = await rpcApi.getLocalChannels();

		

		let localPendingChannels = await rpcApi.getLocalPendingChannels();

		res.locals.localPendingChannels = localPendingChannels;

		res.locals.pendingOpenChannels = localPendingChannels.pendingOpenChannels;
		res.locals.pendingCloseChannels = localPendingChannels.pendingCloseChannels;
		res.locals.pendingForceCloseChannels = localPendingChannels.pendingForceCloseChannels;
		res.locals.waitingCloseChannels = localPendingChannels.waitingCloseChannels;

		// aggregate into single array for ease of use
		res.locals.pendingChannels = localPendingChannels.allChannels;



		let fnd = await rpcApi.getFullNetworkDescription(true);

		res.locals.fullNetworkDescription = fnd;
		res.locals.nodeInfo = fnd.nodeInfoByPubkey[nodePubkey];

		if (res.locals.nodeInfo) {
			res.locals.nodeChannels = [];

			fnd.channels.sortedByOpenBlockHeight.forEach((channel) => {
				if (channel.node1_pub == nodePubkey || channel.node2_pub == nodePubkey) {
					res.locals.nodeChannels.push(channel);
				}
			});

			var qrcodeStrings = [];
			qrcodeStrings.push(nodePubkey);

			if (res.locals.nodeInfo.node.addresses) {
				for (var i = 0; i < res.locals.nodeInfo.node.addresses.length; i++) {
					if (res.locals.nodeInfo.node.addresses[i].network == "tcp") {
						res.locals.nodeUri = nodePubkey + "@" + res.locals.nodeInfo.node.addresses[i].addr;

						qrcodeStrings.push(res.locals.nodeUri);

						break;
					}
				}
			}

			res.locals.qrcodeUrls = await utils.buildQrCodeUrls(qrcodeStrings);

		} else {
			// node-not-found page
		}
	} catch (err) {
		res.locals.pageErrors.push(utils.logError("230rhsd0gds", err));

	} finally {
		res.render("node");
	}
}));

router.get("/channel/:channelId", function(req, res) {
	var channelId = req.params.channelId;

	res.locals.channelId = channelId;

	var parsedChannelId = utils.parseChannelId(channelId);
	res.locals.parsedChannelId = parsedChannelId;

	res.locals.blockHeight = parsedChannelId.blockHeight;
	res.locals.blockTxIndex = parsedChannelId.blockTxIndex;
	res.locals.txOutputIndex = parsedChannelId.txOutputIndex;

	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getChannelInfo(channelId).then(function(channelInfo) {
			res.locals.channel = channelInfo;

			if (res.locals.channel.node1_pub == lndRpc.internal_pubkey) {
				res.locals.baseFeeMsat = res.locals.channel.node1_policy.fee_base_msat;
				res.locals.feeRateMilliMsat = res.locals.channel.node1_policy.fee_rate_milli_msat;
				res.locals.timeLockDelta = res.locals.channel.node1_policy.time_lock_delta;

			} else if (res.locals.channel.node2_pub == lndRpc.internal_pubkey) {
				res.locals.baseFeeMsat = res.locals.channel.node2_policy.fee_base_msat;
				res.locals.feeRateMilliMsat = res.locals.channel.node2_policy.fee_rate_milli_msat;
				res.locals.timeLockDelta = res.locals.channel.node2_policy.time_lock_delta;
			}

			resolve();

		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("2308hwdcshs", err));

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getFullNetworkDescription(true).then(function(fnd) {
			res.locals.fullNetworkDescription = fnd;

			resolve();

		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("329r7h07gsss", err));

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getLocalChannels().then(function(localChannels) {
			res.locals.localChannels = localChannels;

			resolve();

		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("37921hdasudfgd", err));

			reject(err);
		});
	}));
	

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		if (res.locals.channel != null) {
			res.locals.node1 = res.locals.fullNetworkDescription.nodeInfoByPubkey[res.locals.channel.node1_pub];
			res.locals.node2 = res.locals.fullNetworkDescription.nodeInfoByPubkey[res.locals.channel.node2_pub];
		}

		res.render("channel");

	}).catch(function(err) {
		res.locals.pageErrors.push(utils.logError("397hgsd90gs7gs", err));

		res.render("channel");
	});
});

router.get("/settings", function(req, res) {
	res.render("settings");
});

router.get("/setup", function(req, res) {
	res.render("setup");
});

router.post("/setup", asyncHandler(async (req, res, next) => {
	let pwd = req.body.password;
	let pwdConf = req.body.passwordConfirmation;

	if (pwd != pwdConf) {
		res.locals.userMessage = "Passwords do not match.";
		res.locals.userMessageType = "danger";

		res.render("setup");

		return;
	}

	global.adminPassword = pwd;

	let pwdHash = passwordUtils.hash(pwd);

	global.adminCredentials = {};
	global.adminCredentials.adminPasswordHash = pwdHash;
	global.adminCredentials.pbkdf2Salt = utils.getRandomString(32, "#");

	global.encryptor = encryptionUtils.encryptor(global.adminPassword, global.adminCredentials.pbkdf2Salt);

	utils.saveAdminCredentials(global.adminPassword);
	utils.savePreferences(global.userPreferences, global.adminPassword);

	req.session.admin = true;

	req.session.userMessage = "Administrative password set";
	req.session.userMessageType = "success";

	res.redirect("/manage-nodes?setup=true");
}));

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
		res.locals.pageErrors.push(utils.logError("23598yrgwe9fygwe9", err));

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
			res.locals.pageErrors.push(utils.logError("29378rg30gfbd", err));

			res.render("sign-verify");
		});
	} else {
		rpcApi.signMessage(msg).then(function(response) {
			res.locals.signMessageResponse = response;
			res.locals.signature = response.signature;

			res.render("sign-verify");

		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("2397rgwefbcduhj", err));

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
			res.locals.pageErrors.push(utils.logError("3279hsd907ts", err));

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getWalletBalance().then(function(walletBalanceResponse) {
			res.locals.walletBalance = walletBalanceResponse;

			resolve();

		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("3297rtwe7tg", err));

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getLocalChannels().then(function(localChannels) {
			res.locals.localChannels = localChannels;

			resolve();
		
		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("2307rwehdsgds", err));

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getLocalClosedChannels().then(function(closedChannels) {
			res.locals.closedChannels = closedChannels;

			resolve();
		
		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("3r07wgshsgs", err));

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getWalletUtxos().then(function(walletUtxosResponse) {
			res.locals.walletUtxosResponse = walletUtxosResponse;

			resolve();
		
		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("32078sdhsghgsh", err));

			reject(err);
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getOnChainTransactions().then(function(onChainTransactionsResponse) {
			res.locals.onChainTransactions = onChainTransactionsResponse;

			resolve();
		
		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("213e087hy07sgdh", err));

			reject(err);
		});
	}));

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		res.render("wallet");

	}).catch(function(err) {
		res.locals.pageErrors.push(utils.logError("3r9ygew9fgvew9fd", err));

		res.render("wallet");
	});
});

router.get("/node-status", function(req, res) {
	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		lndRpc.getInfo({}, function(err, response) {
			if (err) {
				res.locals.pageErrors.push(utils.logError("3u1rh2yugfew0fwe", err));

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
				res.locals.pageErrors.push(utils.logError("37ufdhewfhedd", err));

				// no need to reject, we can fail gracefully without qrcodes
				resolve();
			});
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		lndRpc.listPeers({}, function(err, response) {
			if (err) {
				res.locals.pageErrors.push(utils.logError("u3rhgqfdygews", err));

				reject(err);

				return;
			}

			res.locals.listPeers = response;

			resolve();
		});
	}));

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getFullNetworkDescription(true).then(function(fnd) {
			res.locals.fullNetworkDescription = fnd;

			resolve();
		});
	}));

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		res.render("node-status");
		res.end();

	}).catch(function(err) {
		req.session.userErrors.push(err);

		res.locals.pageErrors.push(utils.logError("322u0rh2urf", err));

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
				res.locals.pageErrors.push(utils.logError("u3rhgqfdygews", err));

				reject(err);

				return;
			}

			res.locals.listPeers = response;

			resolve();
		});
	}));

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
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

		res.locals.pageErrors.push(utils.logError("322u0rh2urf", err));

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

router.post("/login", asyncHandler(async (req, res, next) => {
	if (req.session.admin) {
		res.redirect("/");

		return;
	}

	
	if (passwordUtils.verify(req.body.password, global.adminCredentials.adminPasswordHash)) {
		var connectToLndNeeded = true;
		if (global.adminPassword) {
			connectToLndNeeded = false;
		}

		global.adminPassword = req.body.password;

		global.encryptor = encryptionUtils.encryptor(global.adminPassword, global.adminCredentials.pbkdf2Salt);

		global.adminCredentials = utils.loadAdminCredentials(global.adminPassword);
		global.userPreferences = utils.loadPreferences(global.adminPassword);

		req.session.admin = true;

		if (connectToLndNeeded && global.adminCredentials.lndNodes && global.adminCredentials.lndNodes.length > 0) {
			await rpcApi.connectAllNodes();

			if (req.session.loginRedirect) {
				res.redirect(req.session.loginRedirect);

				return;
			}

			res.redirect("/");

		} else {
			if (!global.adminCredentials.lndNodes || global.adminCredentials.lndNodes.length == 0) {
				global.setupNeeded = true;
			}

			if (req.session.loginRedirect) {
				res.redirect(req.session.loginRedirect);

				return;
			}

			res.redirect("/");
		}
	} else {
		debugLog(`Password hash verification failure`);

		req.session.userMessage = "Login failed.";
		req.session.userMessageType = "danger";

		res.locals.userMessage = "Login failed.";
		res.locals.userMessageType = "danger";

		if (req.session.loginRedirect) {
			res.redirect(req.session.loginRedirect);

			return;
		}

		res.render("login");
	}
}));

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

			res.locals.pageErrors.push(utils.logError("3y9rewfgefge", err));

			reject(err);
		});
	}));

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		res.render("query-route");

	}).catch(function(err) {
		res.locals.pageErrors.push(utils.logError("23rey9gwefdsg", err));

		res.render("query-route");
	});
});

router.get("/forwarding-history", function(req, res) {
	let limit = 20;
	let offset = 0;
	let sort = "date-desc";
	let daterange = "30d";
	let tab = "summary";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	if (req.query.daterange && typeof daterange === "string") {
		daterange = req.query.daterange;
	}

	if (req.query.tab) {
		tab = req.query.tab;
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.daterange = daterange;
	res.locals.tab = tab;
	res.locals.paginationBaseUrl = `/forwarding-history?sort=${sort}&daterange=${daterange}&tab=${tab}`;

	let startTime = new Date().getTime() / 1000 - 30 * 24 * 60 * 60;
	let endTime = new Date().getTime() / 1000;

	if (daterange == "all") {
		startTime = 1491766829; // magic #, before LN existed
		endTime = new Date().getTime() / 1000;

	} else {
		var times = [{abbr:"m", dur:60}, {abbr:"h", dur:60*60}, {abbr:"d", dur:24*60*60}, {abbr:"M", dur:30*24*60*60}, {abbr:"y", dur:365*24*60*60}];
		
		for (let i = 0; i < times.length; i++) {
			if (daterange.endsWith(times[i].abbr)) {
				let t = parseInt(daterange.substring(0, daterange.length - 1));
				t *= times[i].dur;

				startTime = new Date().getTime() / 1000 - t;
				endTime = new Date().getTime() / 1000;

				break;
			}
		}
	}
	

	var promises = [];

	// TODO summary stats for all events
	/*promises.push(new Promise(function(resolve, reject) {
		rpcApi.getForwardingHistory(1491766829, new Date(), limit, offset).then(function(forwardingHistoryResponse) {
			res.locals.fullForwardingHistoryResponse = forwardingHistoryResponse;

			resolve();

		}).catch(function(err) {
			utils.logError("703yrwegfddsg", err);

			reject(err);
		});
	}));*/

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getForwardingHistory(startTime, endTime, 50000, 0).then(function(forwardingHistoryResponse) {
			res.locals.forwardingHistoryResponse = forwardingHistoryResponse;

			resolve();

		}).catch(function(err) {
			res.locals.forwardingHistoryError = err;

			res.locals.pageErrors.push(utils.logError("703yrwegfddsg", err));

			reject(err);
		});
	}));

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		var allEvents = res.locals.forwardingHistoryResponse.forwarding_events;
		var allFilteredEvents = allEvents;


		allFilteredEvents.sort(function(a, b) {
			var tA = parseInt(a.timestamp);
			var tB = parseInt(b.timestamp);
			var tDiff = tA - tB;

			var vA = parseInt(a.amt_in);
			var vB = parseInt(b.amt_in);
			var vDiff = vA - vB;

			if (sort == "date-desc") {
				if (tDiff == 0) {
					return vA - vB;

				} else {
					return -tDiff;
				}
			} else if (sort == "date-asc") {
				if (tDiff == 0) {
					return vDiff;

				} else {
					return tDiff;
				}
			} else if (sort == "value-desc") {
				if (vDiff == 0) {
					return tDiff;

				} else {
					return -vDiff;
				}
			} else if (sort == "value-asc") {
				if (vDiff == 0) {
					return tDiff;

				} else {
					return vDiff;
				}
			}

			return tDiff;
		});

		var pagedFilteredEvents = [];
		for (var i = offset; i < Math.min(offset + limit, allFilteredEvents.length); i++) {
			pagedFilteredEvents.push(allFilteredEvents[i]);
		}

		res.locals.allEvents = allEvents;
		res.locals.allFilteredEvents = allFilteredEvents;
		res.locals.pagedFilteredEvents = pagedFilteredEvents;
		res.locals.allFilteredEventsCount = res.locals.forwardingHistoryResponse.last_offset_index;


		var totalFees = 0;
		var totalValueTransferred = 0;
		
		var maxFee = 0;
		var maxValueTransferred = 0;
		
    var maxPPM = 0;
    var accumulatedPPM = 0; /// for the average

		var inChannelsById = {};
		var outChannelsById = {};
		allFilteredEvents.forEach(function(event) {
			var valueTransferredIn = parseInt(event.amt_in);
			var valueTransferredOut = parseInt(event.amt_out);
			var feeMsat = parseInt(event.fee_msat);
			var fee = parseInt(feeMsat) / 1000;
			/// sometimes the effective ppm is almost but not quite the actual value
			/// just round it, or display 2 decimal places
			var effectiveFeerate = Math.round((feeMsat / event.amt_in_msat)*1e6)
			event.effectiveFeerate = effectiveFeerate
			
			if (effectiveFeerate > maxPPM) {
				maxPPM = effectiveFeerate
			}
			accumulatedPPM += effectiveFeerate

			totalValueTransferred += valueTransferredOut;
			totalFees += fee;

			if (fee > maxFee) {
				maxFee = fee;
			}

			if (valueTransferredOut > maxValueTransferred) {
				maxValueTransferred = valueTransferredOut;
			}


			if (!inChannelsById[event.chan_id_in]) {
				inChannelsById[event.chan_id_in] = {channelId:event.chan_id_in, totalFees:0, totalValueTransferred:0, eventCount:0};
			}

			inChannelsById[event.chan_id_in].totalFees += fee;
			inChannelsById[event.chan_id_in].totalValueTransferred += valueTransferredIn;
			inChannelsById[event.chan_id_in].eventCount++;


			if (!outChannelsById[event.chan_id_out]) {
				outChannelsById[event.chan_id_out] = {channelId:event.chan_id_out, totalFees:0, totalValueTransferred:0, eventCount:0};
			}

			outChannelsById[event.chan_id_out].totalFees += fee;
			outChannelsById[event.chan_id_out].totalValueTransferred += valueTransferredOut;
			outChannelsById[event.chan_id_out].eventCount++;
		});

		var inChannels = [];
		for (var chanId in inChannelsById) {
			if (inChannelsById.hasOwnProperty(chanId)) {
				inChannels.push(inChannelsById[chanId]);
			}
		}

		var outChannels = [];
		for (var chanId in outChannelsById) {
			if (outChannelsById.hasOwnProperty(chanId)) {
				outChannels.push(outChannelsById[chanId]);
			}
		}

		const chanSort = function(a, b) {
			var aVal = a.totalValueTransferred;
			var bVal = b.totalValueTransferred;
			var valDiff = bVal - aVal;

			var aFee = a.totalFees;
			var bFee = b.totalFees;
			var feeDiff = bFee - aFee;

			var aEvents = a.eventCount;
			var bEvents = b.eventCount;
			var eventsDiff = bEvents - aEvents;

			var chanIdDiff = ('' + a.channelId).localeCompare(b.channelId);

			var sortFunc = function(val1, val2, val3) {
				if (val1 == 0) {
					if (val2 == 0) {
						return val3;

					} else {
						return val2;
					}
				} else {
					return val1;
				}
			};

			if (sort == "valuetransfer-desc") {
				return sortFunc(valDiff, feeDiff, chanIdDiff);

			} else if (sort == "fees-desc") {
				return sortFunc(feeDiff, valDiff, chanIdDiff);

			} else if (sort == "eventcount-desc") {
				return sortFunc(eventsDiff, valDiff, chanIdDiff);

			} else if (sort == "channelId-asc") {
				return sortFunc(chanIdDiff, valDiff, feeDiff);

			} else {
				return sortFunc(valDiff, feeDiff, chanIdDiff);
			}
		}
		inChannels.sort(chanSort);
    outChannels.sort(chanSort);

		res.locals.totalFees = totalFees;
		res.locals.totalValueTransferred = totalValueTransferred;
		res.locals.avgFee = totalFees / allEvents.length;
		res.locals.avgValueTransferred = totalValueTransferred / allEvents.length;
		res.locals.maxFee = maxFee;
		res.locals.maxValueTransferred = maxValueTransferred;
		res.locals.maxPPM = maxPPM;
		res.locals.avgPPM = (accumulatedPPM / allEvents.length).toFixed(2);

		res.locals.inChannels = inChannels;
		res.locals.outChannels = outChannels;


		res.render("forwarding-history");

	}).catch(function(err) {
		res.locals.pageErrors.push(utils.logError("932hr9y7wgdfcd", err));

		res.render("forwarding-history");
	});
	
});

router.get("/logout", function(req, res) {
	req.session.admin = false;
	global.adminPassword = null;
	global.fullNetworkDescription = null;
	global.lndRpc = null;

	res.redirect("/");
});

router.get("/changeSetting", function(req, res) {
	if (req.query.name) {
		req.session[req.query.name] = req.query.value;

		res.cookie('user-setting-' + req.query.name, req.query.value, {
			sameSite: 'Strict'
		});
	}

	res.redirect(req.headers.referer);
});

router.get("/connect-lnd", asyncHandler(async (req, res) => {
	if (req.query.index) {
		var lndIndex = parseInt(req.query.index);

		if (lndIndex != global.lndRpc.internal_index) {
			global.lndRpc = global.lndConnections.byIndex[lndIndex];

			try {
				await rpcApi.refreshCachedValues(true);

				req.session.userMessage = `Switched to LND ${global.lndRpc.internal_pubkey.substring(0, config.site.pubkeyMaxDisplayLength)} ('${global.lndRpc.internal_alias}')`;
				req.session.userMessageType = "success";

				res.redirect(req.headers.referer);

			} catch (err) {
				res.locals.pageErrors.push(utils.logError("230uhfwequfghewfuew", err));

				req.session.userMessage = `Error switching to LND ${JSON.stringify(global.lndRpc)}`;
				req.session.userMessageType = "danger";

				res.redirect(req.headers.referer);
			}
		} else {
			req.session.userMessage = `Already connected to LND ${global.lndRpc.internal_pubkey.substring(0, config.site.pubkeyMaxDisplayLength)} ('${global.lndRpc.internal_alias}')`;

			// no change
			res.redirect(req.headers.referer);
		}
	} else {
		res.locals.userMessage = "To connect to another LND node you must specify a connection index.";

		res.redirect(req.headers.referer);
	}
}));

router.get("/nodes", function(req, res) {
	var limit = 20;
	var offset = 0;
	var sort = "last_update-desc";
	var starred = "all";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort && typeof req.query.sort === "string") {
		sort = req.query.sort;
	}

	if (req.query.starred) {
		starred = req.query.starred.toLowerCase();;
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.starred = starred;
	res.locals.paginationBaseUrl = `/nodes?sort=${sort}&starred=${starred}`;

	var sortProperty = sort.substring(0, sort.indexOf("-"));
	var sortDirection = sort.substring(sort.indexOf("-") + 1);

	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getFullNetworkDescription(true).then(function(fnd) {
			res.locals.fullNetworkDescription = fnd;

			var allNodes = fnd.nodes.sortedByLastUpdate;
			
			if (sortProperty == "last_update") {
				allNodes = fnd.nodes.sortedByLastUpdate;

			} else if (sortProperty == "num_channels") {
				allNodes = fnd.nodes.sortedByChannelCount;

			} else if (sortProperty == "channel_capacity") {
				allNodes = fnd.nodes.sortedByTotalCapacity;
			}




			var predicates = [
				// starred
				function(node) {
					try {
						if (starred == "all") {
							return true;

						} else if (starred == "yes") {
							return utils.isObjectStarred(`node:${node.node.pub_key}`);
						}

						// should never happen
						res.locals.pageErrors.push(utils.logError("08uhas0df7hgasd0hf", `Unexpected filter value: starred=${starred}`));

						return true;

					} catch (err) {
						res.locals.pageErrors.push(utils.logError("3207ghs7sgsed", err, {node:node}));

						return false;
					}
				},
			];


			var allFilteredNodes = [];
			for (var i = 0; i < allNodes.length; i++) {
				var node = allNodes[i];

				var excluded = false;
				for (var j = 0; j < predicates.length; j++) {
					if (!predicates[j](node)) {
						excluded = true;

						break;
					}
				}

				if (!excluded) {
					allFilteredNodes.push(node);
				}
			}




			var pagedFilteredNodes = [];
			for (var i = offset; i < Math.min(offset + limit, allFilteredNodes.length); i++) {
				pagedFilteredNodes.push(allFilteredNodes[i]);
			}

			res.locals.allNodes = allNodes;
			res.locals.allFilteredNodes = allFilteredNodes;
			res.locals.pagedFilteredNodes = pagedFilteredNodes;

			resolve();

		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("2398wjs8s8h", err));

			reject(err);
		});
	}));

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		res.render("nodes");

	}).catch(function(err) {
		res.locals.pageErrors.push(utils.logError("327rhsd7gssW", err));

		res.render("nodes");
	});
});

router.get("/channels", function(req, res) {
	var limit = 20;
	var offset = 0;
	var starred = "all";
	var sort = "openblockheight-desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort && typeof req.query.sort === "string") {
		sort = req.query.sort;
	}

	if (req.query.starred) {
		starred = req.query.starred.toLowerCase();
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.starred = starred;
	res.locals.paginationBaseUrl = `/channels?sort=${sort}`;

	var sortProperty = sort.substring(0, sort.indexOf("-"));
	var sortDirection = sort.substring(sort.indexOf("-") + 1);

	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getFullNetworkDescription(true).then(function(fnd) {
			res.locals.fullNetworkDescription = fnd;

			var allChannels = fnd.channels.sortedByLastUpdate;
			

			if (sortProperty == "last_update") {
				allChannels = fnd.channels.sortedByLastUpdate;

			} else if (sortProperty == "capacity") {
				allChannels = fnd.channels.sortedByCapacity;
			
			} else if (sort == "openblockheight-desc") {
				allChannels = fnd.channels.sortedByOpenBlockHeight;
				
			} else {
				allChannels = fnd.channels.sortedByLastUpdate;
			}

			


			var predicates = [
				// starred
				function(chan) {
					if (starred == "all") {
						return true;

					} else if (starred == "yes") {
						return utils.isObjectStarred(`channel:${chan.channel_id}`);
					}

					// should never happen
					utils.logError("08uhas0df7hgasd0hf", `Unexpected filter value: starred=${starred}`);

					return true;
				},
			];


			var allFilteredChannels = [];
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



			var pagedFilteredChannels = [];
			for (var i = offset; i < Math.min(offset + limit, allFilteredChannels.length); i++) {
				pagedFilteredChannels.push(allFilteredChannels[i]);
			}

			res.locals.allChannels = allChannels;
			res.locals.allFilteredChannels = allFilteredChannels;
			res.locals.pagedFilteredChannels = pagedFilteredChannels;

			resolve();

		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("239yrg239r", err));

			reject(err);
		});
	}));

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		// like literally how is this even defined?
		delete res.locals.localChannels;
		res.render("channels");

	}).catch(function(err) {
		res.locals.pageErrors.push(utils.logError("297wh0sghs", err));

		res.render("channels");
	});
});

router.get("/local-channels", asyncHandler(async (req, res, next) => {
	var limit = 20;
	var offset = 0;
	var sort = "capacity-desc";
	var localbalance = "all";
	var remotebalance = "all";
	var open = "open";
	var status = "all";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort && typeof req.query.sort === "string") {
		sort = req.query.sort;
	}
	
	if (req.query.open) {
		open = req.query.open.toLowerCase();
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
	res.locals.open = open;
	res.locals.status = status;
	res.locals.localbalance = localbalance;
	res.locals.remotebalance = remotebalance;
	res.locals.paginationBaseUrl = `/local-channels?sort=${sort}&open=${open}&status=${status}&localbalance=${localbalance}&remotebalance=${remotebalance}`;

	var sortProperty = sort.substring(0, sort.indexOf("-"));
	var sortDirection = sort.substring(sort.indexOf("-") + 1);

	res.locals.localChannels = await rpcApi.getLocalChannels();


	let localPendingChannels = await rpcApi.getLocalPendingChannels();

	res.locals.localPendingChannels = localPendingChannels;

	res.locals.pendingOpenChannels = localPendingChannels.pendingOpenChannels;
	res.locals.pendingCloseChannels = localPendingChannels.pendingCloseChannels;
	res.locals.pendingForceCloseChannels = localPendingChannels.pendingForceCloseChannels;
	res.locals.waitingCloseChannels = localPendingChannels.waitingCloseChannels;

	// aggregate into single array for ease of use
	res.locals.pendingChannels = localPendingChannels.allChannels;


	res.locals.closedChannels = await rpcApi.getLocalClosedChannels();


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
		// open
		function(chan) {
			if (open == "all") {
				return true;
			}

			if (open == "open") {
				return res.locals.localChannels.channels.includes(chan) || res.locals.pendingChannels.includes(chan);

			} else if (open == "closed") {
				return res.locals.closedChannels.channels.includes(chan);
			}

			// should never happen
			utils.logError("3208hd07se", `Unexpected filter value: open=${open}`);

			return true;
		},
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
			utils.logError("23r087hwfed0hsd", `Unexpected filter value: status=${status}`);

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
			utils.logError("432t07hsd0fghs", `Unexpected filter value: localbalance=${localbalance}`);

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
			utils.logError("23r9uyewhb0s9gys", `Unexpected filter value: remotebalance=${remotebalance}`);

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

		} else if (sort == "openblockheight-desc") {
			var parsedChannelId1 = res.locals.fullNetworkDescription.parsedChannelIds[a.chan_id];
			var parsedChannelId2 = res.locals.fullNetworkDescription.parsedChannelIds[b.chan_id];

			if (!parsedChannelId1) {
				parsedChannelId1 = utils.parseChannelId(a.chan_id);
			}

			if (!parsedChannelId2) {
				parsedChannelId2 = utils.parseChannelId(b.chan_id);
			}

			var aBlockHeight = parsedChannelId1 ? parsedChannelId1.blockHeight : 0;
			var bBlockHeight = parsedChannelId2 ? parsedChannelId2.blockHeight : 0;

			var heightDiff = bBlockHeight - aBlockHeight;
			if (heightDiff == 0) {
				return fallback;

			} else {
				return heightDiff;
			}
		}
	});



	// this handles the case where user is viewing page with offset > 0
	// and switches LND nodes to one where the total number of items
	// is less than the current offset
	while (offset >= allFilteredChannels.length) {
		offset -= limit;
	}

	res.locals.offset = offset;

	res.locals.allChannels = allChannels;
	res.locals.allFilteredChannels = allFilteredChannels;
	
	res.locals.pagedFilteredChannels = [];
	res.locals.parsedChannelIds = {};

	if (allFilteredChannels.length > 0) {
		for (var i = offset; i < Math.min(offset + limit, allFilteredChannels.length); i++) {
			res.locals.pagedFilteredChannels.push(allFilteredChannels[i]);

			res.locals.parsedChannelIds[allFilteredChannels[i].chan_id] = utils.parseChannelId(allFilteredChannels[i].chan_id);
		}
	}


	res.render("local-channels");
}));

router.get("/search", asyncHandler(async (req, res, next) => {
	if (!req.query.query) {
		res.render("search");

		return;
	}

	var query = req.query.query.toLowerCase().trim();

	res.locals.query = query;

	let fnd = await rpcApi.getFullNetworkDescription(true);
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
		try {
			if (nodeInfo && nodeInfo.node) {
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
			}
		} catch(err) {
			res.locals.pageErrors.push(utils.logError("3297rgsd7gs7s", err, {nodeInfo:nodeInfo}));
		}
	});

	fnd.channels.sortedByLastUpdate.forEach(function(channelInfo) {
		if (channelInfo.channel_id.toLowerCase().indexOf(query) > -1) {
			res.locals.searchResults.channels.push(channelInfo);
		}
	});

	res.render("search");
}));

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

router.post("/manage-nodes", asyncHandler(async (req, res, next) => {
	// copied to res.locals on error, so form can be re-filled
	let userFormParams = {};
	try {
		let inputType = req.body.inputType;

		res.locals.inputType = inputType;
		res.locals.setupActive = (!global.adminCredentials.lndNodes || global.adminCredentials.lndNodes.length == 0);


		let newLndNode = null;

		if (inputType == "fileInput") {
			let host = "127.0.0.1";
			let port = "10009";
			let adminMacaroonFilepath = "~/.lnd/admin.macaroon";
			let tlsCertFilepath = "~/.lnd/tls.cert";

			if (req.body.host) {
				host = req.body.host;

				userFormParams.host = host;
			}

			if (req.body.port) {
				port = req.body.port;

				userFormParams.port = port;
			}

			if (req.body.adminMacaroonFilepath) {
				adminMacaroonFilepath = untildify(req.body.adminMacaroonFilepath);

				userFormParams.adminMacaroonFilepath = adminMacaroonFilepath;
			}

			if (req.body.tlsCertFilepath) {
				tlsCertFilepath = untildify(req.body.tlsCertFilepath);

				userFormParams.tlsCertFilepath = tlsCertFilepath;
			}

			if (!fs.existsSync(adminMacaroonFilepath)) {
				res.locals.userMessage = `Unable to open admin macaroon file: '${adminMacaroonFilepath}'`;
				res.locals.userMessageType = "danger";

				res.render("manage-nodes");

				return;
			}

			if (!fs.existsSync(tlsCertFilepath)) {
				res.locals.userMessage = `Unable to open tls certificate file: '${tlsCertFilepath}'`;
				res.locals.userMessageType = "danger";

				res.render("manage-nodes");

				return;
			}

			if (global.adminCredentials.lndNodes == null) {
				global.adminCredentials.lndNodes = [];
			}

			newLndNode = {
				type: "fileInput",
				host: host,
				port: port,
				adminMacaroonFilepath: adminMacaroonFilepath,
				tlsCertFilepath: tlsCertFilepath
			};

		} else if (inputType == "rawTextInput") {
			let host = "127.0.0.1";
			let port = "10009";

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

			newLndNode = {
				type: "rawTextInput",
				host: host,
				port: port,
				adminMacaroonHex: adminMacaroonHex,
				tlsCertAscii: tlsCertAscii
			};

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

			newLndNode = {
				type: "lndconnectString",
				lndconnectString: lndconnectString
			};
		}

		let data = await rpcApi.connect(newLndNode, global.adminCredentials.lndNodes.length);

		global.adminCredentials.lndNodes.push(newLndNode);

		utils.saveAdminCredentials(global.adminPassword);

		res.locals.userMessage = "Successfully added LND Node";
		res.locals.userMessageType = "success";

		if (global.setupNeeded) {
			rpcApi.connectAllNodes().then(function() {
				global.setupNeeded = false;

				req.session.userMessage = "Setup Complete - Welcome to LNDash!";
				req.session.userMessageType = "success";

				res.redirect("/");

			}).catch(function(err) {
				res.locals.pageErrors.push(utils.logError("32r08eus08ys0y8hs", err));

				res.locals.userMessage = "Error while connecting to LND";
				res.locals.userMessageType = "danger";

				res.render("manage-nodes");
			});

		} else {
			res.render("manage-nodes");
		}
	} catch (err) {
		res.locals.lndConnectError = err;

		utils.logError("29834y0ehfe", err);

		res.locals.pageErrors.push(utils.logError("29834y0ehfe", err));

		for (const prop in userFormParams) {
			if (userFormParams.hasOwnProperty(prop)) {
				res.locals[prop] = userFormParams[prop];
			}
		}

		res.render("manage-nodes");
	}
}));

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

				res.locals.pageErrors.push(utils.logError("3er79sdhf0sghs", err));

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

		res.locals.pageErrors.push(utils.logError("397gedgfgggsgsgs", err));

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

		res.locals.pageErrors.push(utils.logError("23407ht40werhg", err));

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

		res.locals.pageErrors.push(utils.logError("397gedgfgggsgsgs", err));

		res.render("payment-history");
	});
});

router.get("/pay-invoice", function(req, res) {
	var promises = [];

	var invoice = req.query.invoice;
	if (invoice) {
		if (invoice.startsWith("lightning:")) {
			invoice = invoice.substring("lightning:".length);
		}

		res.locals.invoice = invoice;

		promises.push(new Promise(function(resolve, reject) {
			rpcApi.decodeInvoiceString(invoice).then(function(decodeInvoiceResponse) {
				res.locals.decodedInvoice = decodeInvoiceResponse;

				resolve();

			}).catch(function(err) {
				req.session.userErrors.push(err);

				res.locals.pageErrors.push(utils.logError("8yf0342ywe", err));

				reject(err);
			});
		}));
	}

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		res.render("pay-invoice");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		res.locals.userMessage = "Unable to decode payment request: " + err + " (" + JSON.stringify(err) + ")";
		res.locals.userMessageType = "warning";

		res.locals.pageErrors.push(utils.logError("4379t2347g", err));

		res.render("pay-invoice");
	})
});

router.post("/pay-invoice", function(req, res) {
	var invoice = req.query.invoice;

	if (invoice.startsWith("lightning:")) {
		invoice = invoice.substring("lightning:".length);
	}

	rpcApi.payInvoice(invoice).then(function(response) {
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

		res.locals.pageErrors.push(utils.logError("8usedghvcf072g", err));

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

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		res.render("send-payment");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		res.locals.pageErrors.push(utils.logError("24308trhw4078hrwhs", err));

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

			res.locals.pageErrors.push(utils.logError("2397rgse9fgs9dg", err));

			reject(err);
		});
	}));

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		if (res.locals.newDepositAddressResponse) {
			res.json(res.locals.newDepositAddressResponse);

		} else if (res.locals.newDepositAddressError) {
			res.json(res.locals.newDepositAddressError);

		} else {
			res.locals.pageErrors.push(utils.logError("3297rgsd97gs", `Unknown error when trying to generate new deposit address: type=${addressType}`));

			res.json({success:false, error:"Unknown", errorId:"3297rgsd97gs"});
		}
	}).catch(function(err) {
		res.locals.pageErrors.push(utils.logError("20ddd8rhsd8hs", err));

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

			res.locals.pageErrors.push(utils.logError("973hrwdgfs", err));

			reject(err);
		});
	}));

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		res.render("send-payment");

	}).catch(function(err) {
		req.session.userErrors.push(err);

		res.locals.pageErrors.push(utils.logError("3290r7ghsd9gsd", err));

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
				utils.logError("237rh2340r7yfre", `Unexpected filter value: settled=${settled}`);

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

		allFilteredInvoices.sort(function(a, b) {
			if (sort == "created-desc") {
				return parseInt(b.creation_date) - parseInt(a.creation_date);

			} else if (sort == "created-asc") {
				return parseInt(a.creation_date) - parseInt(b.creation_date);

			} else if (sort == "value-desc") {
				var diff = parseInt(b.value) - parseInt(a.value);

				if (diff == 0) {
					return parseInt(b.creation_date) - parseInt(a.creation_date);

				} else {
					return diff;
				}
			} else if (sort == "value-asc") {
				var diff = parseInt(a.value) - parseInt(b.value);

				if (diff == 0) {
					return parseInt(b.creation_date) - parseInt(a.creation_date);

				} else {
					return diff;
				}
			} else {
				return parseInt(b.creation_date) - parseInt(a.creation_date);
			}
		});

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

		res.locals.pageErrors.push(utils.logError("3214r97y2gwefy", err));

		res.render("invoices");
	});
});

router.get("/openchannel", function(req, res) {
	res.locals.pubkey = req.query.pubkey;
	res.locals.visibility = "public";
	
	res.render("openchannel");
});

router.post("/openchannel", function(req, res) {
	var pubkey = req.body.pubkey;
	var local_balance = 0;
	var remote_balance = 0;
	var visibility = "public";
	
	if (req.body.local_balance) {
		local_balance = parseInt(req.body.local_balance);
	}

	if (req.body.remote_balance) {
		remote_balance = parseInt(req.body.remote_balance);
	}

	if (req.body.visibility) {
		visibility = req.body.visibility;
	}

	res.locals.pubkey = req.body.pubkey;
	res.locals.local_balance = local_balance;
	res.locals.remote_balance = remote_balance;
	res.locals.visibility = visibility;

	if (!pubkey) {
		res.locals.userMessage = "Must specify the remote node's public key.";
		res.locals.userMessageType = "danger";

		res.render("openchannel");

		return;
	}

	var privateChannel = (visibility && visibility == "private");

	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.openChannel(pubkey, local_balance, remote_balance, privateChannel).then(function(openChannelResponse) {
			res.locals.openChannelResponse = openChannelResponse;

			resolve();

		}).catch(function(err) {
			res.locals.openChannelError = err;

			res.locals.pageErrors.push(utils.logError("3r97ghsd7gss", err));

			reject(err);
		});
	}));

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		res.render("openchannel");

	}).catch(function(err) {
		res.locals.pageErrors.push(utils.logError("397rgheas907gts7", err));

		res.render("openchannel");
	});
});

router.get("/edit-multi-channel-policies", function(req, res) {
	var tab = "all";
	if (req.query.tab) {
		tab = req.query.tab;
	}

	res.locals.tab = tab;

	var localChannels = null;

	var feeSummary = {};
	feeSummary.base_fee_msat = {};
	feeSummary.base_fee_msat_list = [];
	feeSummary.fee_per_mil = {};
	feeSummary.fee_per_mil_list = [];
	feeSummary.time_lock_delta = {};
	feeSummary.time_lock_delta_list = [];

	var promises = [];

	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getChannelFeePolicies().then(function(channelFeePoliciesResponse) {
			res.locals.channelFeePoliciesResponse = channelFeePoliciesResponse;

			channelFeePoliciesResponse.channel_fees.forEach(function(item) {
				var base_fee_msat = parseInt(item.base_fee_msat);
				var fee_per_mil = parseInt(item.fee_per_mil);

				if (!feeSummary.base_fee_msat[base_fee_msat]) {
					feeSummary.base_fee_msat[base_fee_msat] = [];
					feeSummary.base_fee_msat_list.push(base_fee_msat);
				}

				feeSummary.base_fee_msat[base_fee_msat].push(item.chan_point);



				if (!feeSummary.fee_per_mil[fee_per_mil]) {
					feeSummary.fee_per_mil[fee_per_mil] = [];
					feeSummary.fee_per_mil_list.push(fee_per_mil);
				}

				feeSummary.fee_per_mil[fee_per_mil].push(item.chan_point);
			});

			res.locals.channelFeeSummary = feeSummary;

			resolve();

		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("3r97ghsd7gss", err));

			reject(err);
		});
	}));

	var localChannels = null;
	promises.push(new Promise(function(resolve, reject) {
		rpcApi.getLocalChannels().then(function(localChannelsResponse) {
			localChannels = localChannelsResponse.channels;

			var localChannelInfos = {};

			var promises2 = [];
			for (var i = 0; i < localChannels.length; i++) {
				promises2.push(new Promise(function(resolve2, reject2) {
					rpcApi.getChannelInfo(localChannels[i].chan_id).then(function(chanInfo) {
						if (chanInfo.node1_pub == lndRpc.internal_pubkey) {
							chanInfo.localChannelPolicy = chanInfo.node1_policy;

						} else {
							chanInfo.localChannelPolicy = chanInfo.node2_policy;
						}

						localChannelInfos[chanInfo.channel_id] = chanInfo;

						var time_lock_delta = chanInfo.localChannelPolicy.time_lock_delta;
						if (!feeSummary.time_lock_delta[time_lock_delta]) {
							feeSummary.time_lock_delta[time_lock_delta] = [];
							feeSummary.time_lock_delta_list.push(time_lock_delta);
						}

						feeSummary.time_lock_delta[time_lock_delta].push(chanInfo.chan_point);

						resolve2();

					}).catch(function(err) {
						res.locals.pageErrors.push(utils.logError("32970weg0d7tg34e", err));

						reject2(err);
					});
				}));
			}

			Promise.all(promises2.map(utils.reflectPromise)).then(function() {
				res.locals.localChannelInfos = localChannelInfos;

				resolve();

			}).catch(function(err) {
				res.locals.pageErrors.push(utils.logError("3297wegdgfd", err));

				reject(err);
			});

		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("397wge7egss", err));

			reject(err);
		});
	}));
	

	Promise.all(promises.map(utils.reflectPromise)).then(function() {
		if (localChannels) {
			res.locals.localChannels = localChannels;

			var parsedChannelIds = {};

			for (var i = 0; i < localChannels.length; i++) {
				parsedChannelIds[localChannels[i].chan_id] = utils.parseChannelId(localChannels[i].chan_id);
			}

			res.locals.parsedChannelIds = parsedChannelIds;
		}

		res.render("edit-multi-channel-policies");

	}).catch(function(err) {
		res.locals.pageErrors.push(utils.logError("3208wehy834yh43", err));

		res.render("edit-multi-channel-policies");
	});
});

router.post("/edit-multi-channel-policies", function(req, res) {
	var tab = req.body.tab;

	if (tab == "all") {
		if (!req.body.baseFeeMsat) {
			req.session.userMessage = "Missing required parameter: Base Fee (msat)";
			req.session.userMessageType = "warning";

			res.redirect(`/edit-multi-channel-policies?tab=${tab}`);

			return;
		}

		if (!req.body.feeRateMilliMsat) {
			req.session.userMessage = "Missing required parameter: Fee Rate (milli-msat)";
			req.session.userMessageType = "warning";

			res.redirect(`/edit-multi-channel-policies?tab=${tab}`);

			return;
		}

		if (!req.body.timeLockDelta) {
			req.session.userMessage = "Missing required parameter: Time Lock Delta";
			req.session.userMessageType = "warning";

			res.redirect(`/edit-multi-channel-policies?tab=${tab}`);

			return;
		}

		var policies = {};
		policies.base_fee_msat = parseInt(req.body.baseFeeMsat);
		policies.fee_rate = parseInt(req.body.feeRateMilliMsat) / 1000000;
		policies.time_lock_delta = parseInt(req.body.timeLockDelta);

		rpcApi.updateAllChannelPolicies(policies).then(function() {
			req.session.userMessage = "Updated all active channel policies";
			req.session.userMessageType = "success";

			res.redirect(`/edit-multi-channel-policies?tab=${tab}`);

		}).catch(function(err) {
			res.locals.pageErrors.push(utils.logError("2379ergd7tgde", err));

			res.render("edit-multi-channel-policies");
		});

	} else if (tab == "subset") {

	}
});

router.post("/close-channel", function(req, res) {
	var txid = req.body.txid;
	var txOutput = parseInt(req.body.txOutput);
	var forceClose = (req.body.forceClose == "true");
	var speedType = req.body.speedType;
	var speedValue = req.body.speedValue;

	rpcApi.closeChannel(txid, txOutput, forceClose, speedType, speedValue).then(function(response) {
		debugLog("closeChannelResponse: " + JSON.stringify(response));

		res.json(response);

	}).catch(function(err) {
		res.locals.pageErrors.push(utils.logError("sadfh9g3249r6ywegs", err));

		debugLog("closeChannelError: " + JSON.stringify(err));

		res.json(err);
	});
});

router.post("/edit-single-channel-policies", function(req, res) {
	var txid = req.body.txid;
	var txOutput = parseInt(req.body.txOutput);

	if (!req.body.baseFeeMsat) {
		res.json({success:false, error:"Missing required parameter: Base fee"});

		return;
	}

	if (!req.body.feeRateMilliMsat) {
		res.json({success:false, error:"Missing required parameter: Fee rate"});

		return;
	}

	if (!req.body.timeLockDelta) {
		res.json({success:false, error:"Missing required parameter: Time lock delta"});

		return;
	}

	var baseFeeMsat = parseInt(req.body.baseFeeMsat);
	var feeRateMilliMsat = parseInt(req.body.feeRateMilliMsat);
	var timeLockDelta = parseInt(req.body.timeLockDelta);

	var channelPolicies = {
		base_fee_msat: baseFeeMsat,
		fee_rate: feeRateMilliMsat * 0.000001,
		time_lock_delta: timeLockDelta
	};

	rpcApi.updateChannelPolicies(txid, txOutput, channelPolicies).then(function(response) {
		rpcApi.refreshLocalChannels();

		debugLog("updateChannelPoliciesResponse: " + JSON.stringify(response));

		res.json(response);

	}).catch(function(err) {
		res.locals.pageErrors.push(utils.logError("sadfh9g3249r6ywegs", err));

		debugLog("updateChannelPoliciesError: " + JSON.stringify(err));

		res.json(err);
	});
});

router.get("/error-log", function(req, res) {
	res.locals.errorLog = [];

	if (global.errorLog) {
		res.locals.errorLog = global.errorLog.slice();
		res.locals.errorLog.reverse();
	}

	res.locals.errorSummary = global.errorSummary;

	res.locals.errorIdsByRecency = [];
	utils.objectProperties(global.errorSummary).forEach(errorId => {
		res.locals.errorIdsByRecency.push(errorId);
	});

	res.locals.errorIdsByRecency.sort((a, b) => {
		return (global.errorSummary[b].lastOccurrence.getTime() - global.errorSummary[a].lastOccurrence.getTime());
	});
	
	
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
			res.locals.pageErrors.push(utils.logError("2397rgsughse", err));
			
			res.json(err);
		});
	} else if (withdrawType == "multi") {
	}
});

router.get("/lndconnect", asyncHandler(async (req, res) => {
	let securityNoteAccepted = false;
	if (req.query.securityNoteAccepted) {
		securityNoteAccepted = (req.query.securityNoteAccepted == "true");
	}

	res.locals.securityNoteAccepted = securityNoteAccepted;

	if (securityNoteAccepted) {
		let lndNodeIndex = lndRpc.internal_index;
		let pubkey = lndRpc.internal_pubkey;

		let lndConfig = global.adminCredentials.lndNodes[lndNodeIndex];
		let host = lndConfig.host;
		let port = lndConfig.port;

		if (req.query.host) {
			host = req.query.host;
		}

		if (req.query.port) {
			port = req.query.port;
		}

		let localHosts = /(localhost|127\.0\.0\.1|192\.*)/g;
		if (host.match(localHosts)) {
			res.locals.localHost = true;
		}


		let lndconnectString = null;

		if (lndConfig.type == "fileInput") {
			let tlsCertAscii = fs.readFileSync(lndConfig.tlsCertFilepath);
			let macaroon = fs.readFileSync(lndConfig.adminMacaroonFilepath);

			lndconnectString = utils.formatLndconnectString({
				host: host,
				port: port,
				adminMacaroonHex: macaroon.toString("hex"),
				tlsCertAscii: tlsCertAscii.toString("utf-8")
			});

		} else if (lndConfig.type == "rawTextInput") {
			lndconnectString = utils.formatLndconnectString({
				host: host,
				port: port,
				adminMacaroonHex:lndConfig.adminMacaroonHex,
				tlsCertAscii:lndConfig.tlsCertAscii
			});

		} else if (lndConfig.type == "lndconnectString") {
			lndconnectString = lndConfig.lndconnectString;
		}

		res.locals.lndconnectString = lndconnectString;
		res.locals.host = host;
		res.locals.port = port;
	}

	res.render("lndconnect");
}));

router.get("/tag", function(req, res) {
	if (!req.query.tagType) {
		req.session.userMessage = "Unable to tag object: missing tag type";

		res.redirect(req.headers.referer);
	}

	if (!req.query.objectId) {
		req.session.userMessage = "Unable to tag object: missing object identifier";

		res.redirect(req.headers.referer);
	}

	var action = "add";
	if (req.query.action) {
		action = req.query.action;
	}

	var tagType = req.query.tagType;
	var objectId = req.query.objectId;

	var preferences = global.userPreferences;

	if (action == "add") {
		if (!preferences.tags) {
			preferences.tags = {};
		}

		if (!preferences.tags[tagType]) {
			preferences.tags[tagType] = [];
		}

		preferences.tags[tagType].push(objectId);

	} else if (action == "remove") {
		preferences.tags[tagType] = preferences.tags[tagType].filter(e => e !== objectId);
	}

	global.userPreferences = preferences;

	utils.savePreferences(global.userPreferences, global.adminPassword);
	
	
	res.redirect(req.headers.referer);
});

router.get("/qrcode", function(req, res) {
	var action = "add";
	if (req.query.action) {
		action = req.query.action;
	}

	var results = [];
	utils.buildQrCodeUrl(req.query.data, results).then(function(url) {

	});

	var tagType = req.query.tagType;
	var objectId = req.query.objectId;

	var preferences = global.userPreferences;

	if (action == "add") {
		if (!preferences.tags) {
			preferences.tags = {};
		}

		if (!preferences.tags[tagType]) {
			preferences.tags[tagType] = [];
		}

		preferences.tags[tagType].push(objectId);

	} else if (action == "remove") {
		preferences.tags[tagType] = preferences.tags[tagType].filter(e => e !== objectId);
	}

	global.userPreferences = preferences;

	utils.savePreferences(global.userPreferences, global.adminPassword);
	
	
	res.redirect(req.headers.referer);
});

module.exports = router;
