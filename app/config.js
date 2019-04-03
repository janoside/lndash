var coins = require("./coins.js");
var credentials = require("./credentials.js");

var currentCoin = process.env.LND_ADMIN_COIN || "BTC";

var cookieSecret = process.env.LND_ADMIN_COOKIE_SECRET || "0x000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f";

["LND_ADMIN_DEMO"].forEach(function(item) {
	if (process.env[item] === undefined) {
		process.env[item] = "false";
	}
});

[].forEach(function(item) {
	if (process.env[item] === undefined) {
		process.env[item] = "true";
	}
});

module.exports = {
	cookieSecret: cookieSecret,
	coin: currentCoin,

	siteInfo: {
		title: "LND Admin",
		sourceUrl: "https://github.com/janoside/lnd-admin",
		demoSiteUrl: "https://lnd-admin.chaintools.io"
	},

	demoSite: (process.env.LND_ADMIN_DEMO.toLowerCase() == "true"),

	rpcBlacklist:
	  process.env.LND_ADMIN_RPC_ALLOWALL  ? []
	: process.env.LND_ADMIN_RPC_BLACKLIST ? process.env.LND_ADMIN_RPC_BLACKLIST.split(',').filter(Boolean)
	: [
		"stop"
	],

	credentials: credentials,

	site: {
		pubkeyMaxDisplayLength: 22,
		aliasMaxDisplayLength: 22,
		addressMaxDisplayLength: 22,
		txidMaxDisplayLength: 22,

		pageSizes:{
			invoices: 20,
			peers: 20
		}
	},

	donationAddresses:{
		coins:["BTC", "LTC"],

		"BTC":{address:"3NPGpNyLLmVKCEcuipBs7G4KpQJoJXjDGe", urlPrefix:"bitcoin:"},
		"LTC":{address:"ME4pXiXuWfEi1ANBDo9irUJVcZBhsTx14i", urlPrefix:"litecoin:"}
	},

	blockExplorerUrl: process.env.LND_ADMIN_BLOCK_EXPLORER_URL || "https://btc.chaintools.io",

	headerDropdownLinks: {
		title:"Related Sites",
		links:[
			{name: "Bitcoin Explorer", url:"https://btc.chaintools.io", imgUrl:"/img/logo/btc.svg"},
			{name: "Litecoin Explorer", url:"https://ltc.chaintools.io", imgUrl:"/img/logo/ltc.svg"},
			{name: "LND Admin", url:"https://lnd-admin.chaintools.io", imgUrl:"/img/logo/lightning.svg"},
		]
	}
};
