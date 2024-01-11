const crypto = require("crypto");

function hash(password) {
	try {
		const salt = crypto.randomBytes(8).toString('hex');
		const derivedKey = (crypto.scryptSync(password, salt, 64)).toString('hex');
		return salt + ":" + derivedKey;
	} catch (e) {
		throw e;
	}
}

function verify(password, hash) {
	try {
		const [salt, key] = hash.split(":");
		const derivedKey = (crypto.scryptSync(password, salt, 64)).toString('hex');
		return key === derivedKey;
	} catch (e) {
		throw e;
	}
}


module.exports = {
	hash: hash,
	verify: verify
};