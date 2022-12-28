var debug = require("debug");
var debugLog = debug("lndash:utils");
var debugLogError = debug("lndash:error");

var Decimal = require("decimal.js");
var qrcode = require("qrcode");
var CryptoJS = require("crypto-js");
var fs = require("fs");
var url = require("url");
var base64url = require('base64url');
var path = require('path');
var axios = require("axios");

var config = require("./config.js");
var coinConfig = require("./btcCoinConfig.js");

var ipCache = {};

var exponentScales = [
	{val:1000000000000000000000000000000000, name:"?", abbreviation:"V", exponent:"33"},
	{val:1000000000000000000000000000000, name:"?", abbreviation:"W", exponent:"30"},
	{val:1000000000000000000000000000, name:"?", abbreviation:"X", exponent:"27"},
	{val:1000000000000000000000000, name:"yotta", abbreviation:"Y", exponent:"24"},
	{val:1000000000000000000000, name:"zetta", abbreviation:"Z", exponent:"21"},
	{val:1000000000000000000, name:"exa", abbreviation:"E", exponent:"18"},
	{val:1000000000000000, name:"peta", abbreviation:"P", exponent:"15"},
	{val:1000000000000, name:"tera", abbreviation:"T", exponent:"12"},
	{val:1000000000, name:"giga", abbreviation:"G", exponent:"9"},
	{val:1000000, name:"mega", abbreviation:"M", exponent:"6"},
	{val:1000, name:"kilo", abbreviation:"K", exponent:"3"}
];

function hex2ascii(hex) {
	var str = "";
	for (var i = 0; i < hex.length; i += 2) {
		str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
	}
	
	return str;
}

function splitArrayIntoChunks(array, chunkSize) {
	var j = array.length;
	var chunks = [];
	
	for (var i = 0; i < j; i += chunkSize) {
		chunks.push(array.slice(i, i + chunkSize));
	}

	return chunks;
}

function getRandomString(length, chars) {
    var mask = '';
	
    if (chars.indexOf('a') > -1) {
		mask += 'abcdefghijklmnopqrstuvwxyz';
	}
	
    if (chars.indexOf('A') > -1) {
		mask += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	}
	
    if (chars.indexOf('#') > -1) {
		mask += '0123456789';
	}
    
	if (chars.indexOf('!') > -1) {
		mask += '~`!@#$%^&*()_+-={}[]:";\'<>?,./|\\';
	}
	
    var result = '';
    for (var i = length; i > 0; --i) {
		result += mask[Math.floor(Math.random() * mask.length)];
	}
	
	return result;
}

var formatCurrencyCache = {};

function getCurrencyFormatInfo(formatType) {
	if (formatCurrencyCache[formatType] == null) {
		for (var x = 0; x < coinConfig.currencyUnits.length; x++) {
			var currencyUnit = coinConfig.currencyUnits[x];

			for (var y = 0; y < currencyUnit.values.length; y++) {
				var currencyUnitValue = currencyUnit.values[y];

				if (currencyUnitValue == formatType) {
					formatCurrencyCache[formatType] = currencyUnit;
				}
			}
		}
	}

	if (formatCurrencyCache[formatType] != null) {
		return formatCurrencyCache[formatType];
	}

	return null;
}

function formatCurrencyAmountWithForcedDecimalPlaces(amount, formatType, forcedDecimalPlaces) {
	var formatInfo = getCurrencyFormatInfo(formatType);
	if (formatInfo != null) {
		var dec = new Decimal(amount);

		var decimalPlaces = formatInfo.decimalPlaces;
		//if (decimalPlaces == 0 && dec < 1) {
		//	decimalPlaces = 5;
		//}

		if (forcedDecimalPlaces >= 0) {
			decimalPlaces = forcedDecimalPlaces;
		}

		if (formatInfo.type == "native") {
			dec = dec.times(formatInfo.multiplier);
			
			return addThousandsSeparators(dec.toDecimalPlaces(decimalPlaces)) + " " + formatInfo.name;

		} else if (formatInfo.type == "exchanged") {
			if (global.exchangeRates != null && global.exchangeRates[formatInfo.multiplier] != null) {
				dec = dec.times(global.exchangeRates[formatInfo.multiplier]);

				return formatInfo.symbol + addThousandsSeparators(dec.toDecimalPlaces(decimalPlaces));
			}
		}
	}
	
	return amount;
}

function formatCurrencyAmount(amount, formatType) {
	return formatCurrencyAmountWithForcedDecimalPlaces(amount, formatType, -1);
}

function formatCurrencyAmountInSmallestUnits(amount, forcedDecimalPlaces) {
	return formatCurrencyAmountWithForcedDecimalPlaces(amount, coinConfig.baseCurrencyUnit.name, forcedDecimalPlaces);
}

// ref: https://stackoverflow.com/a/2901298/673828
function addThousandsSeparators(x) {
	var parts = x.toString().split(".");
	parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");

	return parts.join(".");
}

function formatExchangedCurrency(amount, exchangeType) {
	if (global.exchangeRates != null && global.exchangeRates[exchangeType.toLowerCase()] != null) {
		var dec = new Decimal(amount);
		dec = dec.times(global.exchangeRates[exchangeType.toLowerCase()]);

		return "$" + addThousandsSeparators(dec.toDecimalPlaces(2));
	}

	return "";
}

function seededRandom(seed) {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function seededRandomIntBetween(seed, min, max) {
	var rand = seededRandom(seed);
	return (min + (max - min) * rand);
}

function logMemoryUsage() {
	var mbUsed = process.memoryUsage().heapUsed / 1024 / 1024;
	mbUsed = Math.round(mbUsed * 100) / 100;

	var mbTotal = process.memoryUsage().heapTotal / 1024 / 1024;
	mbTotal = Math.round(mbTotal * 100) / 100;

	//debugLog("memoryUsage: heapUsed=" + mbUsed + ", heapTotal=" + mbTotal + ", ratio=" + parseInt(mbUsed / mbTotal * 100));
}

function getMinerFromCoinbaseTx(tx) {
	if (tx == null || tx.vin == null || tx.vin.length == 0) {
		return null;
	}
	
	if (global.miningPoolsConfigs) {
		for (var i = 0; i < global.miningPoolsConfigs.length; i++) {
			var miningPoolsConfig = global.miningPoolsConfigs[i];

			for (var payoutAddress in miningPoolsConfig.payout_addresses) {
				if (miningPoolsConfig.payout_addresses.hasOwnProperty(payoutAddress)) {
					if (tx.vout && tx.vout.length > 0 && tx.vout[0].scriptPubKey && tx.vout[0].scriptPubKey.addresses && tx.vout[0].scriptPubKey.addresses.length > 0) {
						if (tx.vout[0].scriptPubKey.addresses[0] == payoutAddress) {
							var minerInfo = miningPoolsConfig.payout_addresses[payoutAddress];
							minerInfo.identifiedBy = "payout address " + payoutAddress;

							return minerInfo;
						}
					}
				}
			}

			for (var coinbaseTag in miningPoolsConfig.coinbase_tags) {
				if (miningPoolsConfig.coinbase_tags.hasOwnProperty(coinbaseTag)) {
					if (hex2ascii(tx.vin[0].coinbase).indexOf(coinbaseTag) != -1) {
						var minerInfo = miningPoolsConfig.coinbase_tags[coinbaseTag];
						minerInfo.identifiedBy = "coinbase tag '" + coinbaseTag + "'";

						return minerInfo;
					}
				}
			}
		}
	}

	return null;
}

function getTxTotalInputOutputValues(tx, txInputs, blockHeight) {
	var totalInputValue = new Decimal(0);
	var totalOutputValue = new Decimal(0);

	try {
		for (var i = 0; i < tx.vin.length; i++) {
			if (tx.vin[i].coinbase) {
				totalInputValue = totalInputValue.plus(new Decimal(coinConfig.blockRewardFunction(blockHeight)));

			} else {
				var txInput = txInputs[i];

				if (txInput) {
					try {
						var vout = txInput.vout[tx.vin[i].vout];
						if (vout.value) {
							totalInputValue = totalInputValue.plus(new Decimal(vout.value));
						}
					} catch (err) {
						debugLog("Error getting tx.totalInputValue: err=" + err + ", txid=" + tx.txid + ", index=tx.vin[" + i + "]");
					}
				}
			}
		}
		
		for (var i = 0; i < tx.vout.length; i++) {
			totalOutputValue = totalOutputValue.plus(new Decimal(tx.vout[i].value));
		}
	} catch (err) {
		debugLog("Error computing total input/output values for tx: err=" + err + ", tx=" + JSON.stringify(tx) + ", txInputs=" + JSON.stringify(txInputs) + ", blockHeight=" + blockHeight);
	}

	return {input:totalInputValue, output:totalOutputValue};
}

function getBlockTotalFeesFromCoinbaseTxAndBlockHeight(coinbaseTx, blockHeight) {
	if (coinbaseTx == null) {
		return 0;
	}

	var blockReward = coinConfig.blockRewardFunction(blockHeight);

	var totalOutput = new Decimal(0);
	for (var i = 0; i < coinbaseTx.vout.length; i++) {
		var outputValue = coinbaseTx.vout[i].value;
		if (outputValue > 0) {
			totalOutput = totalOutput.plus(new Decimal(outputValue));
		}
	}

	return totalOutput.minus(new Decimal(blockReward));
}

async function refreshExchangeRates() {
	if (coinConfig.exchangeRateData) {
		try {
			const response = await axios.get(coinConfig.exchangeRateData.jsonUrl);
			
			var exchangeRates = coinConfig.exchangeRateData.responseBodySelectorFunction(response.data);
			if (exchangeRates != null) {
				global.exchangeRates = exchangeRates;
				global.exchangeRatesUpdateTime = new Date();

				debugLog("Using exchange rates: " + JSON.stringify(global.exchangeRates) + " starting at " + global.exchangeRatesUpdateTime);

			} else {
				debugLog("Unable to get exchange rate data");
			}

		} catch (err) {
			logError("320hsd0uhsg07gs07", err);
		}
	}
}

// Uses IPStack.com API
async function geoLocateIpAddresses(ipAddresses) {
	return new Promise(function(resolve, reject) {
		var chunks = splitArrayIntoChunks(ipAddresses, 1);

		var promises = [];
		for (var i = 0; i < chunks.length; i++) {
			var ipStr = "";
			for (var j = 0; j < chunks[i].length; j++) {
				if (j > 0) {
					ipStr = ipStr + ",";
				}

				ipStr = ipStr + chunks[i][j];
			}

			if (ipCache[ipStr] != null) {
				promises.push(new Promise(function(resolve2, reject2) {
					resolve2(ipCache[ipStr]);
				}));

			} else if (config.credentials.ipStackComApiAccessKey && config.credentials.ipStackComApiAccessKey.trim().length > 0) {
				var apiUrl = "http://api.ipstack.com/" + ipStr + "?access_key=" + config.credentials.ipStackComApiAccessKey;
				
				promises.push(new Promise(async function(resolve2, reject2) {
					try {
						const response = await axios.get(apiUrl);

						resolve2(response.data);

					} catch (err) {
						logError("23ur230ex", err);

						reject2(err);
					}
				}));
			} else {
				promises.push(new Promise(function(resolve2, reject2) {
					resolve2(null);
				}));
			}
		}

		Promise.all(promises).then(function(results) {
			var ipDetails = {ips:[], detailsByIp:{}};

			for (var i = 0; i < results.length; i++) {
				var res = results[i];
				if (res != null && res["statusCode"] == 200) {
					var resBody = JSON.parse(res["body"]);
					var ip = resBody["ip"];

					ipDetails.ips.push(ip);
					ipDetails.detailsByIp[ip] = resBody;

					if (ipCache[ip] == null) {
						ipCache[ip] = res;
					}
				}
			}

			resolve(ipDetails);
		});
	});
}

function parseExponentStringDouble(val) {
	var [lead,decimal,pow] = val.toString().split(/e|\./);
	return +pow <= 0 
		? "0." + "0".repeat(Math.abs(pow)-1) + lead + decimal
		: lead + ( +pow >= decimal.length ? (decimal + "0".repeat(+pow-decimal.length)) : (decimal.slice(0,+pow)+"."+decimal.slice(+pow)));
}

function formatLargeNumber(n, decimalPlaces) {
	for (var i = 0; i < exponentScales.length; i++) {
		var item = exponentScales[i];

		var fraction = new Decimal(n / item.val);
		if (fraction >= 1) {
			return [fraction.toDecimalPlaces(decimalPlaces), item];
		}
	}

	return [new Decimal(n).toDecimalPlaces(decimalPlaces), {}];
}

function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min){
        h = s = 0; // achromatic
    }else{
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max){
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return {h:h, s:s, l:l};
}

function colorHexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// https://stackoverflow.com/a/31424853/673828
const reflectPromise = p => p.then(v => ({v, status: "resolved" }),
                            e => ({e, status: "rejected" }));

function colorHexToHsl(hex) {
	var rgb = colorHexToRgb(hex);
	return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

function logError(errorId, err, optionalUserData = null) {
	if (!global.errorLog) {
		global.errorLog = [];
		global.errorSummary = {};
	}

	global.errorLog.push({errorId:errorId, error:err, userData:optionalUserData, date:new Date()});
	while (global.errorLog.length > 100) {
		global.errorLog.splice(0, 1);
	}

	if (!global.errorSummary[errorId]) {
		global.errorSummary[errorId] = {error:err, firstOccurrence:new Date(), count:0};
	}

	global.errorSummary[errorId].lastOccurrence = new Date();
	global.errorSummary[errorId].count++;


	debugLogError("Error " + errorId + ": " + err + ", json: " + JSON.stringify(err) + (optionalUserData != null ? (", userData: " + optionalUserData + " (json: " + JSON.stringify(optionalUserData) + ")") : ""));
	
	if (err.stack) {
		debugLogError("Stack: " + err.stack);
	}

	var returnVal = {errorId:errorId, error:err};
	if (optionalUserData) {
		returnVal.userData = optionalUserData;
	}

	return returnVal;
}

function buildQrCodeUrls(strings) {
	return new Promise(function(resolve, reject) {
		var promises = [];
		var qrcodeUrls = {};

		for (var i = 0; i < strings.length; i++) {
			promises.push(new Promise(function(resolve2, reject2) {
				buildQrCodeUrl(strings[i], qrcodeUrls).then(function() {
					resolve2();

				}).catch(function(err) {
					reject2(err);
				});
			}));
		}

		Promise.all(promises).then(function(results) {
			resolve(qrcodeUrls);

		}).catch(function(err) {
			reject(err);
		});
	});
}

function buildQrCodeUrl(str, results) {
	return new Promise(function(resolve, reject) {
		qrcode.toDataURL(str, function(err, url) {
			if (err) {
				utils.logError("2q3ur8fhudshfs", err, str);

				reject(err);

				return;
			}

			results[str] = url;

			resolve(url);
		});
	});
}

function encryptString(str_utf8, encPassword) {
	var ciphertext_base64 = CryptoJS.AES.encrypt(str_utf8, encPassword);
	//var hex = CryptoJS.enc.Hex.stringify(CryptoJS.enc.Base64.parse(ciphertext.toString()));

	return ciphertext_base64.toString();
}

function decryptString(str_base64, encPassword) {
	//var b64_fromHex = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Hex.parse(str));
	var bytes = CryptoJS.AES.decrypt(str_base64, encPassword);

	return bytes.toString(CryptoJS.enc.Utf8);
}

function saveAdminCredentials(encPassword) {
	var enc = JSON.parse(JSON.stringify(global.adminCredentials));

	if (enc.lndNodes) {
		enc.lndNodesData = encryptString(JSON.stringify(enc.lndNodes), encPassword);

		delete enc.lndNodes;
	}

	fs.writeFileSync(path.join(global.userDataDir, "credentials.json"), JSON.stringify(enc, null, 4));
}

function loadAdminCredentials(encPassword) {
	var credentialsData = fs.readFileSync(path.join(global.userDataDir, "credentials.json"), "utf8");
	var adminCredentials = JSON.parse(credentialsData);

	if (encPassword) {
		if (adminCredentials.lndNodesData != null) {
			adminCredentials.lndNodes = JSON.parse(decryptString(adminCredentials.lndNodesData, encPassword));
			delete adminCredentials.lndNodesData;
		}
	}

	return adminCredentials;
}

function savePreferences(preferences, encPassword) {
	fs.writeFileSync(path.join(global.userDataDir, "preferences.json"), JSON.stringify(preferences, null, 4));
}

function loadPreferences(encPassword) {
	if (fs.existsSync(path.join(global.userDataDir, "preferences.json"))) {
		var preferencesData = fs.readFileSync(path.join(global.userDataDir, "preferences.json"), "utf8");

		return JSON.parse(preferencesData);

	} else {
		return {};
	}
}

function chunkString(str, maxChunkSize) {
	const numChunks = Math.ceil(str.length / maxChunkSize)
	const chunks = new Array(numChunks)

	for (let i = 0, o = 0; i < numChunks; ++i, o += maxChunkSize) {
		chunks[i] = str.substr(o, maxChunkSize)
	}

	return chunks;
}

function parseLndconnectString(lndconnectString) {
	var parsedUrl = url.parse(lndconnectString, true);

	var tlsCertAscii = "-----BEGIN CERTIFICATE-----\r\n";
	tlsCertAscii += chunkString(base64url.toBase64(parsedUrl.query.cert), 64).join("\r\n");
	tlsCertAscii += "\r\n-----END CERTIFICATE-----";

	var adminMacaroonHex = base64url.toBase64(parsedUrl.query.macaroon);
	adminMacaroonHex = Buffer.from(adminMacaroonHex, 'base64').toString('hex');

	var parsedData = {
		host:parsedUrl.hostname,
		port:parsedUrl.port,
		tlsCertAscii:tlsCertAscii,
		adminMacaroonHex:adminMacaroonHex
	};

	return parsedData;
}

function formatLndconnectString(lndconnectData) {
	var certLines = lndconnectData.tlsCertAscii.split(/\n/);
	
	// remove line breaks
	certLines = certLines.filter(line => line != "");

	// remove ---BEGIN--- line
	certLines.pop();

	// remove ---END--- line
	certLines.shift();

	var cert = base64url.fromBase64(certLines.join(''));
	var macaroon = base64url(Buffer.from(lndconnectData.adminMacaroonHex, 'hex'));

	return `lndconnect://${lndconnectData.host}:${lndconnectData.port}?cert=${cert}&macaroon=${macaroon}`;
}

function decimalToBinary(dec){
	return parseInt(dec, 10).toString(2);
}

function binaryToDecimal(dec){
	return parseInt(dec, 2).toString(10);
}

function parseChannelId(channelId) {
	var channelIdBinary = decimalToBinary(channelId).padStart(64, "0");

	return {
		blockHeight: parseInt(binaryToDecimal(channelIdBinary.substring(0, 24))),
		blockTxIndex: parseInt(binaryToDecimal(channelIdBinary.substring(24, 48))),
		txOutputIndex: parseInt(binaryToDecimal(channelIdBinary.substring(48)))
	};
}

function isObjectStarred(objectId) {
	if (global.userPreferences) {
		if (global.userPreferences.tags) {
			if (global.userPreferences.tags["star"]) {
				return global.userPreferences.tags["star"].includes(objectId);
			}
		}
	}
	
	return false;
}



function objectProperties(obj) {
	const props = [];
	for (const prop in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, prop)) {
			props.push(prop);
		}
	}

	return props;
}

function objHasProperty(obj, name) {
	return Object.prototype.hasOwnProperty.call(obj, name);
}

function iterateProperties(obj, action) {
	for (const [key, value] of Object.entries(obj)) {
		action([key, value]);
	}
}

function stringifySimple(object) {
	var simpleObject = {};
	for (var prop in object) {
			if (!object.hasOwnProperty(prop)) {
					continue;
			}

			if (typeof(object[prop]) == 'object') {
					continue;
			}

			if (typeof(object[prop]) == 'function') {
					continue;
			}

			simpleObject[prop] = object[prop];
	}

	return JSON.stringify(simpleObject); // returns cleaned up JSON
}

function ellipsizeMiddle(str, length, replacement="…", extraCharAtStart=true) {
	if (str.length <= length) {
		return str;

	} else {
		//"abcde"(3)->"a…e"
		//"abcdef"(3)->"a…f"
		//"abcdef"(5)->"ab…ef"
		//"abcdef"(4)->"ab…f"
		if ((length - replacement.length) % 2 == 0) {
			return str.substring(0, (length - replacement.length) / 2) + replacement + str.slice(-(length - replacement.length) / 2);

		} else {
			if (extraCharAtStart) {
				return str.substring(0, Math.ceil((length - replacement.length) / 2)) + replacement + str.slice(-Math.floor((length - replacement.length) / 2));

			} else {
				return str.substring(0, Math.floor((length - replacement.length) / 2)) + replacement + str.slice(-Math.ceil((length - replacement.length) / 2));
			}
			
		}
	}
}

function formatHex(hex, outputFormat="utf8") {
	return Buffer.from(hex, "hex").toString(outputFormat);
}

const formatBuffer = (buffer, format="base64", fullDetail=false) => {
	return buffer.toString(format);
};


module.exports = {
	reflectPromise: reflectPromise,
	hex2ascii: hex2ascii,
	splitArrayIntoChunks: splitArrayIntoChunks,
	getRandomString: getRandomString,
	getCurrencyFormatInfo: getCurrencyFormatInfo,
	formatCurrencyAmount: formatCurrencyAmount,
	formatCurrencyAmountWithForcedDecimalPlaces: formatCurrencyAmountWithForcedDecimalPlaces,
	formatExchangedCurrency: formatExchangedCurrency,
	addThousandsSeparators: addThousandsSeparators,
	formatCurrencyAmountInSmallestUnits: formatCurrencyAmountInSmallestUnits,
	seededRandom: seededRandom,
	seededRandomIntBetween: seededRandomIntBetween,
	logMemoryUsage: logMemoryUsage,
	getMinerFromCoinbaseTx: getMinerFromCoinbaseTx,
	getBlockTotalFeesFromCoinbaseTxAndBlockHeight: getBlockTotalFeesFromCoinbaseTxAndBlockHeight,
	refreshExchangeRates: refreshExchangeRates,
	parseExponentStringDouble: parseExponentStringDouble,
	formatLargeNumber: formatLargeNumber,
	geoLocateIpAddresses: geoLocateIpAddresses,
	getTxTotalInputOutputValues: getTxTotalInputOutputValues,
	rgbToHsl: rgbToHsl,
	colorHexToRgb: colorHexToRgb,
	colorHexToHsl: colorHexToHsl,
	logError: logError,
	buildQrCodeUrls: buildQrCodeUrls,
	encryptString: encryptString,
	decryptString: decryptString,
	saveAdminCredentials: saveAdminCredentials,
	loadAdminCredentials: loadAdminCredentials,
	parseLndconnectString: parseLndconnectString,
	formatLndconnectString: formatLndconnectString,
	decimalToBinary: decimalToBinary,
	binaryToDecimal: binaryToDecimal,
	savePreferences: savePreferences,
	loadPreferences: loadPreferences,
	parseChannelId: parseChannelId,
	isObjectStarred: isObjectStarred,
	objectProperties: objectProperties,
	objHasProperty: objHasProperty,
	stringifySimple: stringifySimple,
	ellipsizeMiddle: ellipsizeMiddle,
	formatHex: formatHex,
	formatBuffer: formatBuffer
};
