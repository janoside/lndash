const debug = require("debug");
const debugLog = debug("lndash:utils");
const debugLogError = debug("lndash:error");

const Decimal = require("decimal.js");
const qrcode = require("qrcode");
const CryptoJS = require("crypto-js");
const fs = require("fs");
const url = require("url");
const path = require('path');
const axios = require("axios");

const config = require("./config.js");
const coinConfig = require("./btcCoinConfig.js");

let ipCache = {};

const exponentScales = [
	{val:1000000000000000000000000000000000, name:"?", abbreviation:"V", exponent:"33"},
	{val:1000000000000000000000000000000, name:"?", abbreviation:"W", exponent:"30"},
	{val:1000000000000000000000000000, name:"?", abbreviation:"X", exponent:"27"},
	{val:1000000000000000000000000, name:"yotta", abbreviation:"Y", exponent:"24"},
	{val:1000000000000000000000, name:"zetta", abbreviation:"Z", exponent:"21"},
	{val:1000000000000000000, name:"exa", abbreviation:"E", exponent:"18"},
	{val:1000000000000000, name:"peta", abbreviation:"P", exponent:"15", textDesc:"Q"},
	{val:1000000000000, name:"tera", abbreviation:"T", exponent:"12", textDesc:"T"},
	{val:1000000000, name:"giga", abbreviation:"G", exponent:"9", textDesc:"B"},
	{val:1000000, name:"mega", abbreviation:"M", exponent:"6", textDesc:"M"},
	{val:1000, name:"kilo", abbreviation:"K", exponent:"3", textDesc:"thou"}
];

function hex2ascii(hex) {
	let str = "";
	for (let i = 0; i < hex.length; i += 2) {
		str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
	}
	
	return str;
}

function splitArrayIntoChunks(array, chunkSize) {
	let j = array.length;
	let chunks = [];
	
	for (let i = 0; i < j; i += chunkSize) {
		chunks.push(array.slice(i, i + chunkSize));
	}

	return chunks;
}

function getRandomString(length, chars) {
    let mask = '';
	
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
	
    let result = '';
    for (let i = length; i > 0; --i) {
		result += mask[Math.floor(Math.random() * mask.length)];
	}
	
	return result;
}

let formatCurrencyCache = {};

function getCurrencyFormatInfo(formatType) {
	if (formatCurrencyCache[formatType] == null) {
		for (let x = 0; x < coinConfig.currencyUnits.length; x++) {
			let currencyUnit = coinConfig.currencyUnits[x];

			for (let y = 0; y < currencyUnit.values.length; y++) {
				let currencyUnitValue = currencyUnit.values[y];

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
	formatType = formatType.toLowerCase();

	var currencyType = global.currencyTypes[formatType];

	if (currencyType == null) {
		throw `Unknown currency type: ${formatType}`;
	}

	var dec = new Decimal(amount);

	// the regex used to strip trailing zeros only works
	// if theres a non-zero in the string
	// force currencies with no decimals to have one so 0 values dont get deleted
	var decimalPlaces = currencyType.decimalPlaces || 1;
	//if (decimalPlaces == 0 && dec < 1) {
	//	decimalPlaces = 5;
	//}

	if (forcedDecimalPlaces >= 0) {
		decimalPlaces = forcedDecimalPlaces;
	}

	if (currencyType.type == "native") {
		dec = dec.times(currencyType.multiplier);

		if (forcedDecimalPlaces >= 0) {
			// toFixed will keep trailing zeroes
			var baseStr = addThousandsSeparators(dec.toFixed(decimalPlaces));

			return {val:baseStr, currencyUnit:currencyType.name, simpleVal:baseStr, intVal:parseInt(dec)};

		} else {
			// toDP excludes trailing zeroes but doesn't "fix" numbers like 1e-8
			// instead, we use toFixed and manually strip trailing zeroes
			// old method is kept for reference since this is sensitive, high-volume code
			var baseStr = addThousandsSeparators(dec.toFixed(decimalPlaces).replace(/0+$/, "").replace(/\.$/, ""));
			//var baseStr = addThousandsSeparators(dec.toDP(decimalPlaces)); // old version, failed to properly format "1e-8" (left unchanged)

			var returnVal = {currencyUnit:currencyType.name, simpleVal:baseStr, intVal:parseInt(dec)};

			// max digits in "val"
			var maxValDigits = config.site.valueDisplayMaxLargeDigits;

			// todo: make this section locale-aware (don't hardcode ".")

			if (baseStr.indexOf(".") == -1) {
				returnVal.val = baseStr;
				
			} else {
				if (baseStr.length - baseStr.indexOf(".") - 1 > maxValDigits) {
					returnVal.val = baseStr.substring(0, baseStr.indexOf(".") + maxValDigits + 1);
					returnVal.lessSignificantDigits = baseStr.substring(baseStr.indexOf(".") + maxValDigits + 1);

				} else {
					returnVal.val = baseStr;
				}
			}

			return returnVal;
		}
	} else if (currencyType.type == "fiat") {
		//console.log(JSON.stringify(global.exchangeRates) + " - " + currencyType.name);
		if (global.exchangeRates != null && global.exchangeRates[currencyType.id] != null) {
			dec = dec.times(global.exchangeRates[currencyType.id]);

			var baseStr = addThousandsSeparators(dec.toDecimalPlaces(decimalPlaces));

			return {val:baseStr, currencyUnit:currencyType.name, simpleVal:baseStr, intVal:parseInt(dec)};

		} else {
			return formatCurrencyAmountWithForcedDecimalPlaces(amount, coinConfig.defaultCurrencyUnit.name, forcedDecimalPlaces);
		}
	} else {
		throw `Unknown currency type: ${currencyType.type}`;
	}
}

function formatCurrencyAmount(amount, formatType) {
	return formatCurrencyAmountWithForcedDecimalPlaces(amount, formatType, -1);
}

function formatCurrencyAmountInSmallestUnits(amount, forcedDecimalPlaces) {
	return formatCurrencyAmountWithForcedDecimalPlaces(amount, coinConfig.baseCurrencyUnit.name, forcedDecimalPlaces);
}

// ref: https://stackoverflow.com/a/2901298/673828
function addThousandsSeparators(x) {
	let parts = x.toString().split(".");
	parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");

	return parts.join(".");
}

function formatExchangedCurrency(amount, exchangeType) {
	if (global.exchangeRates != null && global.exchangeRates[exchangeType.toLowerCase()] != null) {
		let dec = new Decimal(amount);
		dec = dec.times(global.exchangeRates[exchangeType.toLowerCase()]);

		return "$" + addThousandsSeparators(dec.toDecimalPlaces(2));
	}

	return "";
}

function seededRandom(seed) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function seededRandomIntBetween(seed, min, max) {
	let rand = seededRandom(seed);
	return (min + (max - min) * rand);
}

function logMemoryUsage() {
	let mbUsed = process.memoryUsage().heapUsed / 1024 / 1024;
	mbUsed = Math.round(mbUsed * 100) / 100;

	let mbTotal = process.memoryUsage().heapTotal / 1024 / 1024;
	mbTotal = Math.round(mbTotal * 100) / 100;

	//debugLog("memoryUsage: heapUsed=" + mbUsed + ", heapTotal=" + mbTotal + ", ratio=" + parseInt(mbUsed / mbTotal * 100));
}

function getMinerFromCoinbaseTx(tx) {
	if (tx == null || tx.vin == null || tx.vin.length == 0) {
		return null;
	}
	
	if (global.miningPoolsConfigs) {
		for (let i = 0; i < global.miningPoolsConfigs.length; i++) {
			let miningPoolsConfig = global.miningPoolsConfigs[i];

			for (let payoutAddress in miningPoolsConfig.payout_addresses) {
				if (miningPoolsConfig.payout_addresses.hasOwnProperty(payoutAddress)) {
					if (tx.vout && tx.vout.length > 0 && tx.vout[0].scriptPubKey && tx.vout[0].scriptPubKey.addresses && tx.vout[0].scriptPubKey.addresses.length > 0) {
						if (tx.vout[0].scriptPubKey.addresses[0] == payoutAddress) {
							let minerInfo = miningPoolsConfig.payout_addresses[payoutAddress];
							minerInfo.identifiedBy = "payout address " + payoutAddress;

							return minerInfo;
						}
					}
				}
			}

			for (let coinbaseTag in miningPoolsConfig.coinbase_tags) {
				if (miningPoolsConfig.coinbase_tags.hasOwnProperty(coinbaseTag)) {
					if (hex2ascii(tx.vin[0].coinbase).indexOf(coinbaseTag) != -1) {
						let minerInfo = miningPoolsConfig.coinbase_tags[coinbaseTag];
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
	let totalInputValue = new Decimal(0);
	let totalOutputValue = new Decimal(0);

	try {
		for (let i = 0; i < tx.vin.length; i++) {
			if (tx.vin[i].coinbase) {
				totalInputValue = totalInputValue.plus(new Decimal(coinConfig.blockRewardFunction(blockHeight)));

			} else {
				let txInput = txInputs[i];

				if (txInput) {
					try {
						let vout = txInput.vout[tx.vin[i].vout];
						if (vout.value) {
							totalInputValue = totalInputValue.plus(new Decimal(vout.value));
						}
					} catch (err) {
						debugLog("Error getting tx.totalInputValue: err=" + err + ", txid=" + tx.txid + ", index=tx.vin[" + i + "]");
					}
				}
			}
		}
		
		for (let i = 0; i < tx.vout.length; i++) {
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

	let blockReward = coinConfig.blockRewardFunction(blockHeight);

	let totalOutput = new Decimal(0);
	for (let i = 0; i < coinbaseTx.vout.length; i++) {
		let outputValue = coinbaseTx.vout[i].value;
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
			
			let exchangeRates = coinConfig.exchangeRateData.responseBodySelectorFunction(response.data);
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
		let chunks = splitArrayIntoChunks(ipAddresses, 1);

		let promises = [];
		for (let i = 0; i < chunks.length; i++) {
			let ipStr = "";
			for (let j = 0; j < chunks[i].length; j++) {
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
				let apiUrl = "http://api.ipstack.com/" + ipStr + "?access_key=" + config.credentials.ipStackComApiAccessKey;
				
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
			let ipDetails = {ips:[], detailsByIp:{}};

			for (let i = 0; i < results.length; i++) {
				let res = results[i];
				if (res != null && res["statusCode"] == 200) {
					let resBody = JSON.parse(res["body"]);
					let ip = resBody["ip"];

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
	let [lead,decimal,pow] = val.toString().split(/e|\./);
	return +pow <= 0 
		? "0." + "0".repeat(Math.abs(pow)-1) + lead + decimal
		: lead + ( +pow >= decimal.length ? (decimal + "0".repeat(+pow-decimal.length)) : (decimal.slice(0,+pow)+"."+decimal.slice(+pow)));
}

function formatLargeNumber(n, decimalPlaces) {
	try {
		for (var i = 0; i < exponentScales.length; i++) {
			var item = exponentScales[i];

			var fraction = new Decimal(n / item.val);
			if (fraction >= 1) {
				return [fraction.toDP(decimalPlaces), item];
			}
		}

		return [new Decimal(n).toDP(decimalPlaces), {}];

	} catch (err) {
		logError("ru92huefhew", err, { n:n, decimalPlaces:decimalPlaces });

		throw err;
	}
}

function formatLargeNumberSignificant(n, significantDigits) {
	try {
		for (var i = 0; i < exponentScales.length; i++) {
			var item = exponentScales[i];

			var fraction = new Decimal(n / item.val);
			if (fraction >= 1) {
				return [fraction.toDP(Math.max(0, significantDigits - `${Math.floor(fraction)}`.length)), item];
			}
		}

		return [new Decimal(n).toDP(significantDigits), {}];

	} catch (err) {
		logError("38fhcdugdeogwe", err, { n:n, significantDigits:significantDigits });

		throw err;
	}
}

function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if(max == min){
        h = s = 0; // achromatic
    }else{
        let d = max - min;
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
    let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
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
	let rgb = colorHexToRgb(hex);
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

	let returnVal = {errorId:errorId, error:err};
	if (optionalUserData) {
		returnVal.userData = optionalUserData;
	}

	return returnVal;
}

function buildQrCodeUrls(strings) {
	return new Promise(function(resolve, reject) {
		let promises = [];
		let qrcodeUrls = {};

		for (let i = 0; i < strings.length; i++) {
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

function saveAdminCredentials(encPassword) {
	let enc = JSON.parse(JSON.stringify(global.adminCredentials));

	if (enc.lndNodes) {
		enc.lndNodesData = formatBuffer(global.encryptor.encrypt(JSON.stringify(enc.lndNodes)), "base64");

		delete enc.lndNodes;
	}

	fs.writeFileSync(path.join(global.userDataDir, "credentials.json"), JSON.stringify(enc, null, 4));
}

function loadAdminCredentials(encPassword) {
	let credentialsData = fs.readFileSync(path.join(global.userDataDir, "credentials.json"), "utf8");
	let adminCredentials = JSON.parse(credentialsData);

	if (encPassword) {
		if (adminCredentials.lndNodesData != null) {
			adminCredentials.lndNodes = JSON.parse(global.encryptor.decrypt(Buffer.from(adminCredentials.lndNodesData, "base64")));
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
		let preferencesData = fs.readFileSync(path.join(global.userDataDir, "preferences.json"), "utf8");

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
	let parsedUrl = url.parse(lndconnectString, true);

	let tlsCertAscii = "-----BEGIN CERTIFICATE-----\r\n";
	tlsCertAscii += chunkString(Buffer.from(parsedUrl.query.cert, 'base64url').toString('base64'), 64).join("\r\n");
	tlsCertAscii += "\r\n-----END CERTIFICATE-----";

	let adminMacaroonHex = Buffer.from(parsedUrl.query.macaroon, 'base64url').toString('hex');

	let parsedData = {
		host:parsedUrl.hostname,
		port:parsedUrl.port,
		tlsCertAscii:tlsCertAscii,
		adminMacaroonHex:adminMacaroonHex
	};

	return parsedData;
}

function formatLndconnectString(lndconnectData) {
	let certLines = lndconnectData.tlsCertAscii.split(/\n/);
	
	// remove line breaks
	certLines = certLines.filter(line => line != "");

	// remove ---BEGIN--- line
	certLines.pop();

	// remove ---END--- line
	certLines.shift();

	let cert = Buffer.from(certLines.join(''), 'base64').toString('base64url');
	let macaroon = Buffer.from(lndconnectData.adminMacaroonHex, 'hex').toString('base64url');

	return `lndconnect://${lndconnectData.host}:${lndconnectData.port}?cert=${cert}&macaroon=${macaroon}`;
}

function decimalToBinary(dec){
	return parseInt(dec, 10).toString(2);
}

function binaryToDecimal(dec){
	return parseInt(dec, 2).toString(10);
}

function parseChannelId(channelId) {
	let channelIdBinary = decimalToBinary(channelId).padStart(64, "0");

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
	let simpleObject = {};
	for (let prop in object) {
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

function getExchangedCurrencyFormatData(amount, exchangeType, includeUnit=true) {
	exchangeType = exchangeType.toLowerCase()
	if (global.exchangeRates != null && global.exchangeRates[exchangeType] != null) {
		var dec = new Decimal(amount);
		dec = dec.times(global.exchangeRates[exchangeType]);
		var exchangedAmt = parseFloat(Math.round(dec * 100) / 100).toFixed(2);

		return {
			symbol: global.currencySymbols[exchangeType],
			value: addThousandsSeparators(exchangedAmt),
			unit: exchangeType
		}
		
	} else if (exchangeType == "au") {
		if (global.exchangeRates != null && global.goldExchangeRates != null) {
			var dec = new Decimal(amount);
			dec = dec.times(global.exchangeRates.usd).dividedBy(global.goldExchangeRates.usd);
			var exchangedAmt = parseFloat(Math.round(dec * 100) / 100).toFixed(2);

			return {
				symbol: "AU",
				value: addThousandsSeparators(exchangedAmt),
				unit: "oz"
			}
		}
	}

	return "";
}



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
	formatLargeNumberSignificant: formatLargeNumberSignificant,
	geoLocateIpAddresses: geoLocateIpAddresses,
	getTxTotalInputOutputValues: getTxTotalInputOutputValues,
	rgbToHsl: rgbToHsl,
	colorHexToRgb: colorHexToRgb,
	colorHexToHsl: colorHexToHsl,
	logError: logError,
	buildQrCodeUrls: buildQrCodeUrls,
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
	formatBuffer: formatBuffer,
	getExchangedCurrencyFormatData: getExchangedCurrencyFormatData
};
