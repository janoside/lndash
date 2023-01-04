
const credentials = require("./credentials.js");

const cookieSecret = process.env.LNDASH_COOKIE_SECRET || "0x000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f";

[].forEach(function(item) {
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
	
	siteInfo: {
		title: "LNDash",
		sourceUrl: "https://github.com/janoside/lndash",
		demoSiteUrl: "https://lndash.btc21.org"
	},

	credentials: credentials,

	site: {
		pubkeyMaxDisplayLength: 20,
		aliasMaxDisplayLength: 20,
		addressMaxDisplayLength: 20,
		networkAddressMaxDisplayLength: 20,
		txidMaxDisplayLength: 20,

		valueDisplayMaxLargeDigits: 4,

		pageSizes:{
			invoices: 20,
			peers: 20
		}
	},

	donations:{
		btcpayserver:{
			host:"https://donate.btc21.org"
		}
	},

	blockExplorerUrl: process.env.LNDASH_BLOCK_EXPLORER_URL || "https://explorer.btc21.org",

	headerDropdownLinks: {
		title:"Related Sites",
		links:[
			{name: "Bitcoin Explorer", url:"https://explorer.btc21.org", imgUrl:"/img/logo/btc.svg"},
			{name: "LNDash", url:"https://lndash.btc21.org", imgUrl:"/img/logo/lightning.svg"},
		]
	}
};
