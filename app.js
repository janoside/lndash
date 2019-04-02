#!/usr/bin/env node

'use strict';

require('dotenv').config();

var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require("express-session");
var config = require("./app/config.js");
var simpleGit = require('simple-git');
var utils = require("./app/utils.js");
var moment = require("moment");
var Decimal = require('decimal.js');
var bitcoinCore = require("bitcoin-core");
var grpc = require("grpc");
var fs = require("fs");
var pug = require("pug");
var momentDurationFormat = require("moment-duration-format");
var coins = require("./app/coins.js");
var request = require("request");
var qrcode = require("qrcode");
var rpcApi = require("./app/rpcApi.js");
var Influx = require("influx");


var baseActionsRouter = require('./routes/baseActionsRouter');

var app = express();

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
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({
	secret: config.cookieSecret,
	resave: false,
	saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));


function getSourcecodeProjectMetadata() {
	var options = {
		url: "https://api.github.com/repos/janoside/lnd-admin",
		headers: {
			'User-Agent': 'request'
		}
	};

	// github project metadata
	request(options, function(error, response, body) {
		if (error == null && response && response.statusCode && response.statusCode == 200) {
			var responseBody = JSON.parse(body);

			global.sourcecodeProjectMetadata = responseBody;

			//console.log(`SourcecodeProjectMetadata: ${JSON.stringify(global.sourcecodeProjectMetadata)}`);

		} else {
			console.log(`Error 3208fh3ew7eghfg: ${error}, StatusCode: ${response != null ? response.statusCode : "?"}, Response: ${JSON.stringify(response)}`);
		}
	});
}



app.runOnStartup = function() {
	global.config = config;
	global.coinConfig = coins[config.coin];
	global.coinConfigs = coins;

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
		simpleGit(".").log(["-n 1"], function(err, log) {
			global.sourcecodeVersion = log.all[0].hash;
			global.sourcecodeDate = log.all[0].date;
		});
	}

	if (config.demoSite) {
		getSourcecodeProjectMetadata();
		setInterval(getSourcecodeProjectMetadata, 3 * 3600000);
	}


	// exchange rates
	utils.refreshExchangeRates();
	setInterval(utils.refreshExchangeRates, 30 * 60000);


	// refresh periodically
	setInterval(function() {
		if (global.lndRpc != null) {
			rpcApi.refreshFullNetworkDescription();
			rpcApi.refreshLocalChannels();
			rpcApi.refreshLocalClosedChannels();
		}
	}, 60000);


	global.lndConnections = {
		byIndex: {},
		byAlias: {},

		aliases:[],
		indexes:[]
	};

	if (fs.existsSync('credentials.json')) {
		var credentialsData = fs.readFileSync('credentials.json', 'utf8');

		global.adminCredentials = JSON.parse(credentialsData);

		if (global.adminCredentials.lndNodes == null) {
			global.setupNeeded = true;

			return;
		}

		if (fs.existsSync('.unlock')) {
			global.adminPassword = fs.readFileSync('.unlock', 'utf8');

			global.unlockNeeded = false;
		}

		if (global.adminPassword == null) {
			global.unlockNeeded = true;

			return;
		}

		rpcApi.connectAllNodes();

	} else {
		global.setupNeeded = true;
	}
};



app.use(function(req, res, next) {
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
	} else if (global.unlockNeeded) {
		if (!req.path.startsWith("/login")) {
			res.redirect("/login");
			
			return;
		}
	}

	res.locals.setupNeeded = global.setupNeeded;
	res.locals.unlockNeeded = global.unlockNeeded;

	// make session available in templates
	res.locals.session = req.session;

	req.session.loginRedirect = req.headers.referer;

	res.locals.admin = false;

	req.session.userErrors = [];

	res.locals.config = global.config;
	res.locals.coinConfig = global.coinConfig;
	
	res.locals.host = req.session.host;
	res.locals.port = req.session.port;


	// currency format type
	if (!req.session.currencyFormatType) {
		var cookieValue = req.cookies['user-setting-currencyFormatType'];

		if (cookieValue) {
			req.session.currencyFormatType = cookieValue;

		} else {
			req.session.currencyFormatType = "";
		}
	}

	// theme
	if (!req.session.uiTheme) {
		var cookieValue = req.cookies['user-setting-uiTheme'];

		if (cookieValue) {
			req.session.uiTheme = cookieValue;

		} else {
			req.session.uiTheme = "";
		}
	}

	// homepage banner
	if (!req.session.hideHomepageBanner) {
		var cookieValue = req.cookies['user-setting-hideHomepageBanner'];

		if (cookieValue) {
			req.session.hideHomepageBanner = cookieValue;

		} else {
			req.session.hideHomepageBanner = "false";
		}
	}

	res.locals.currencyFormatType = req.session.currencyFormatType;

	
	if (req.session.userMessage) {
		res.locals.userMessage = req.session.userMessage;
		
		if (req.session.userMessageType) {
			res.locals.userMessageType = req.session.userMessageType;
			
		} else {
			res.locals.userMessageType = "warning";
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

	// make some var available to all request
	// ex: req.cheeseStr = "cheese";

	if (global.lndRpc != null) {
		rpcApi.getFullNetworkDescription().then(function(fnd) {
			res.locals.fullNetworkDescription = fnd;

			rpcApi.getLocalChannels().then(function(localChannels) {
				res.locals.localChannels = localChannels;

				next();

			}).catch(function(err) {
				utils.logError("37921hdasudfgd", err);

				next();
			});
		}).catch(function(err) {
			utils.logError("3297rhgdgvsf1", err);

			next();
		});
	} else {
		next();
	}
});

app.use('/', baseActionsRouter);

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



module.exports = app;
