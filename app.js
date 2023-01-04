#!/usr/bin/env node

'use strict';

const os = require('os');
const path = require('path');
const dotenv = require("dotenv");
const fs = require('fs');

var configPaths = [ path.join(os.homedir(), '.lndash', '.env'), path.join(process.cwd(), '.env') ];
configPaths.filter(fs.existsSync).forEach(path => {
	console.log('Loading env file:', path);
	dotenv.config({ path });
});

// debug module is already loaded by the time we do dotenv.config
// so refresh the status of DEBUG env var
const debug = require("debug");
debug.enable(process.env.DEBUG);

const debugLog = debug("lndash:app");

const axios = require("axios");
const express = require('express');
const favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const session = require("express-session");
const config = require("./app/config.js");
const simpleGit = require('simple-git');
const utils = require("./app/utils.js");
const moment = require("moment");
const Decimal = require('decimal.js');
const grpc = require("@grpc/grpc-js");
const asyncHandler = require("express-async-handler");
const pug = require("pug");
const momentDurationFormat = require("moment-duration-format");
const coinConfig = require("./app/btcCoinConfig.js");
const qrcode = require("qrcode");
const rpcApi = require("./app/rpcApi.js");
const runes = require("runes");
const semver = require("semver");

require("./app/currencies.js");

//import latestVersion from 'latest-version';

const package_json = require('./package.json');
global.appVersion = package_json.version;
global.cacheId = global.appVersion;
debugLog(`Default cacheId '${global.cacheId}'`);

debugLog(`Starting LNDash, v${global.appVersion}`);

process.on("unhandledRejection", (reason, p) => {
	utils.logError("239780g37gtd", reason, {type:"Unhandled rejection", promise:p});
});


const crawlerBotUserAgentStrings = [ "Googlebot", "Bingbot", "Slurp", "DuckDuckBot", "Baiduspider", "YandexBot", "Sogou", "Exabot", "facebot", "ia_archiver" ];


const baseRouter = require("./routes/baseRouter.js");
const utilRouter = require("./routes/utilRouter.js");

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));

// ref: https://blog.stigok.com/post/disable-pug-debug-output-with-expressjs-web-app
app.engine('pug', (path, options, fn) => {
	options.debug = false;
	
	return pug.__express.call(null, path, options, fn);
});

app.set('view engine', 'pug');

app.disable('x-powered-by');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
//app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({
	secret: config.cookieSecret,
	resave: false,
	saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));


async function getSourcecodeProjectMetadata() {
	var options = {
		url: "https://api.github.com/repos/janoside/lndash",
		headers: {
			'User-Agent': 'axios'
		}
	};

	// github project metadata
	try {
		const response = await axios(options);

		global.sourcecodeProjectMetadata = response.data;

	} catch (err) {
		utils.logError("239r7hsdgss", err);
	}
}



app.runOnStartup = async () => {
	global.packageRootDir = __dirname;
	global.userDataDir = path.join(os.homedir(), ".lndash");

	if (!fs.existsSync(global.userDataDir)){
		fs.mkdirSync(global.userDataDir);
	}

	/*latestVersion("lndash").then(function(latestAppVersion) {
		if (semver.gt(latestAppVersion, global.appVersion)) {
			global.newAppVersion = latestAppVersion;

			debugLog("New version of LNDash available: v%s", global.newAppVersion);
		}
	});*/

	global.config = config;
	global.coinConfig = coinConfig;

	if (config.donationAddresses) {
		var getDonationAddressQrCode = function(coinId) {
			qrcode.toDataURL(config.donationAddresses[coinId].address, function(err, url) {
				global.donationAddressQrCodeUrls[coinId] = url;
			});
		};

		global.donationAddressQrCodeUrls = {};

		config.donationAddresses.coins.forEach(function(item) {
			getDonationAddressQrCode(item);
		});
	}

	// git metadata
	if (global.sourcecodeVersion == null && fs.existsSync('.git')) {
		try {
			let log = await simpleGit(".").log(["-n 1"]);

			global.sourcecodeVersion = log.all[0].hash.substring(0, 10);
			global.sourcecodeDate = log.all[0].date.substring(0, "0000-00-00".length);

			global.cacheId = `${global.sourcecodeDate}-${global.sourcecodeVersion}`;

			debugLog(`Using sourcecode metadata as cacheId: '${global.cacheId}'`);

			debugLog(`Starting ${config.siteInfo.title}, v${global.appVersion} (commit: '${global.sourcecodeVersion}', date: ${global.sourcecodeDate})`);


		} catch (err) {
			utils.logError("3fehge9ee", err, {desc:"Error accessing git repo"});

			global.cacheId = global.appVersion;
			debugLog(`Error getting sourcecode version, continuing to use default cacheId '${global.cacheId}'`);

			debugLog(`Starting ${config.siteInfo.title}, v${global.appVersion} (code: unknown commit)`);
		}
	}
	

	getSourcecodeProjectMetadata();
	setInterval(getSourcecodeProjectMetadata, 3 * 3600000);


	// exchange rates
	utils.refreshExchangeRates();
	setInterval(utils.refreshExchangeRates, 30 * 60000);


	// refresh periodically
	setInterval(function() {
		if (global.lndRpc != null) {
			rpcApi.refreshCachedValues();
		}
	}, 60000);


	global.lndConnections = {
		byIndex: {},
		byAlias: {},

		aliases:[],
		indexes:[]
	};

	global.userPreferences = {};

	if (fs.existsSync(path.join(global.userDataDir, "credentials.json"))) {
		if (fs.existsSync(path.join(global.userDataDir, ".debugAdminPassword"))) {
			global.adminPassword = fs.readFileSync(path.join(global.userDataDir, ".debugAdminPassword"), "utf8").trim();
		}

		debugLog("Loading admin credentials");

		global.adminCredentials = utils.loadAdminCredentials(global.adminPassword);

		if (global.adminPassword) {
			if (fs.existsSync(path.join(global.userDataDir, "preferences.json"))) {
				global.userPreferences = utils.loadPreferences(global.adminPassword);
			}

			if (global.adminCredentials.lndNodes == null || global.adminCredentials.lndNodes.length == 0) {
				global.setupNeeded = true;

			} else {
				rpcApi.connectAllNodes();
			}
		}
	} else {
		global.setupNeeded = true;
	}
};



app.use(asyncHandler(async (req, res, next) => {
	try {
		if (global.setupNeeded) {
			if (global.adminPassword != null) {
				if (!req.path.startsWith("/manage-nodes")) {
					res.redirect("/manage-nodes?setup=true");
					
					return;
				}
			} else if (!req.path.startsWith("/setup")) {
				res.redirect("/setup");
				
				return;
			}
		} else if (!global.adminPassword) {
			if (!req.path.startsWith("/login")) {
				res.redirect("/login");
				
				return;
			}
		}

		res.locals.setupNeeded = global.setupNeeded;

		// make session available in templates
		res.locals.session = req.session;

		req.session.loginRedirect = req.headers.referer;

		res.locals.admin = false;

		req.session.userErrors = [];

		res.locals.config = global.config;
		res.locals.coinConfig = global.coinConfig;

		res.locals.pageErrors = [];

		res.locals.req = req;

		var userAgent = req.headers['user-agent'];
		for (var i = 0; i < crawlerBotUserAgentStrings.length; i++) {
			if (userAgent.indexOf(crawlerBotUserAgentStrings[i]) != -1) {
				res.locals.crawlerBot = true;
			}
		}
		

		var userSettings = [
			{name:"displayCurrency", default:"BTC"},
			{name:"localCurrency", default:"USD"},
			{name:"uiTheme", default:""},
			{name:"hideHomepageBanner", default:""},
		];

		userSettings.forEach(function(userSetting) {
			if (!req.session[userSetting.name]) {
				var cookieValue = req.cookies[`user-setting-${userSetting.name}`];

				if (cookieValue) {
					req.session[userSetting.name] = cookieValue;

				} else {
					req.session[userSetting.name] = userSetting.default;
				}
			}

			res.locals[userSetting.name] = req.session[userSetting.name];
		});

		
		if (req.session.userMessage) {
			res.locals.userMessage = req.session.userMessage;
			
			if (req.session.userMessageType) {
				res.locals.userMessageType = req.session.userMessageType;
				
			} else {
				res.locals.userMessageType = "info";
			}

			req.session.userMessage = null;
			req.session.userMessageType = null;
		}

		if (req.session.userErrors && req.session.userErrors.length > 0) {
			res.locals.userErrors = req.session.userErrors;

			req.session.userErrors = null;
		}

		if (req.session.query) {
			res.locals.query = req.session.query;

			req.session.query = null;
		}

		// make some var available to all requests
		// ex: req.cheeseStr = "cheese";

		if (global.lndRpc != null) {
			res.locals.fullNetworkDescription = await rpcApi.getFullNetworkDescription(true);
			res.locals.localChannels = await rpcApi.getLocalChannels(true);
			res.locals.localClosedChannels = await rpcApi.getLocalClosedChannels(true);
			res.locals.localPendingChannels = await rpcApi.getLocalPendingChannels(true);
		}

		next();

	} catch (err) {
		utils.logError("89032grwehusd", err);

		next(err);
	}
}));

app.use('/', baseRouter);
app.use('/util', utilRouter);

/// catch 404 and forwarding to error handler
app.use(function(req, res, next) {
	var err = new Error('Not Found');

	err.status = 404;

	next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
	app.use(function(err, req, res, next) {
		res.status(err.status || 500);
		res.render('error', {
			message: err.message,
			error: err
		});
	});
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
	res.status(err.status || 500);
	res.render('error', {
		message: err.message,
		error: {}
	});
});

app.locals.moment = moment;
app.locals.Decimal = Decimal;
app.locals.utils = utils;
app.locals.runes = runes;


app.locals.assetUrl = (path) => {
	// trim off leading "./"
	let normalizedPath = path.substring(2);

	//console.log("assetUrl: " + path + " -> " + normalizedPath);

	//if (config.cdn.active && cdnFilepathMap[normalizedPath]) {
	//	return `${config.cdn.baseUrl}/${global.cacheId}/${normalizedPath}`;

	//} else {
		return `${path}?v=${global.cacheId}`;
	//}
};

// debug setting to skip js/css integrity checks
const skipIntegrityChecks = false;
const resourceIntegrityHashes = require("./app/resourceIntegrityHashes.js");

app.locals.assetIntegrity = (filename) => {
	if (!skipIntegrityChecks && resourceIntegrityHashes[filename]) {
		return resourceIntegrityHashes[filename];

	} else {
		return "";
	}
};


module.exports = app;
