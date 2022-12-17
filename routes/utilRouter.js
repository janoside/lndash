var debug = require("debug");
var debugLog = debug("lnadmin:router");

const hashjs = require('hash.js');

var express = require('express');
var router = express.Router();
var util = require('util');
var moment = require('moment');
var utils = require('./../app/utils');
var rpcApi = require("./../app/rpcApi.js");
var qrcode = require('qrcode');
var fs = require("fs");
var qrImage = require('qr-image');
var untildify = require("untildify");


router.get("/qrcode", function(req, res) {
	var results = [];
	utils.buildQrCodeUrl(req.query.data, results).then(function(url) {
		res.redirect(req.headers.referer);
		
	}).catch(function(e) {

	});
});

module.exports = router;
