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


router.get("/qrcode", function(req, res) {
	let results = [];
	
	utils.buildQrCodeUrl(req.query.data, results).then(function(url) {
		res.redirect(req.headers.referer);
		
	}).catch(function(e) {

	});
});

module.exports = router;
