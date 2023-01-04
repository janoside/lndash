#!/usr/bin/env node
const meow = require("meow");

const args = meow(`
	Usage
		$ ln-dash [options]

	Options
		-p, --port <port>			port to bind http server [default: 3004]
		-i, --host <host>			host to bind http server [default: 127.0.0.1]

		-e, --node-env <env>		nodejs environment mode [default: production]
		-h, --help					output usage information
		-v, --version				output version number

	Examples
		$ ln-dash -p 8080

	All options may also be specified as environment variables
		$ LNDASH_PORT=8080


`, { flags: { port: {alias:'p'}, host: {alias:'i'}, demo: {type:'boolean'}
			, nodeEnv: {alias:'e', default:'production'}
			} }
).flags;

const envify = k => k.replace(/([A-Z])/g, '_$1').toUpperCase();

Object.keys(args).filter(k => k.length > 1).forEach(k => {
	if (args[k] === false) {
		process.env[`LNDASH_NO_${envify(k)}`] = true;
	} else {
		process.env[`LNDASH_${envify(k)}`] = args[k];
	}
});

require('./www');
