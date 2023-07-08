global.currencyTypes = {
	"btc": {
		id: "btc",
		type: "native",
		name: "BTC",
		multiplier: 1,
		default: true,
		decimalPlaces: 8
	},
	"mbtc": {
		id: "mbtc",
		type: "native",
		name: "mBTC",
		multiplier: 1000,
		decimalPlaces: 5
	},
	"bits": {
		id: "bits",
		type: "native",
		name: "bits",
		active: false,
		multiplier: 1000000,
		decimalPlaces: 2
	},
	"sat": {
		id: "sat",
		type: "native",
		name: "sat",
		multiplier: 100000000,
		decimalPlaces: 0
	},
	"msat": {
		id: "msat",
		type: "native",
		name: "msat",
		multiplier: 100000000000,
		decimalPlaces: 0
	},
	"local": {
		id: "local",
		type: "native",
		name: "Local"
	},
	"usd": {
		id: "usd",
		type: "fiat",
		name: "USD",
		multiplier: "usd",
		decimalPlaces: 2,
		symbol: "$"
	},
	"eur": {
		id: "eur",
		type: "fiat",
		name: "EUR",
		multiplier: "eur",
		decimalPlaces: 2,
		symbol: "€"
	},
	"gbp": {
		id: "gbp",
		type: "fiat",
		name: "GBP",
		multiplier: "gbp",
		decimalPlaces: 2,
		symbol: "£"
	}
};

global.currencySymbols = {
	"btc": "₿",
	"usd": "$",
	"eur": "€",
	"gbp": "£"
};