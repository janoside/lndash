const crypto = require("crypto");

async function hash(password) {
	return new Promise((resolve, reject) => {
		const salt = crypto.randomBytes(8).toString("hex");

		crypto.scrypt(password, salt, 64, (err, derivedKey) => {
			if (err) {
				reject(err);

			} else {
				resolve(salt + ":" + derivedKey.toString('hex'));
			}
		});
	})
}

async function verify(password, hash) {
	return new Promise((resolve, reject) => {
		const [salt, key] = hash.split(":");
		crypto.scrypt(password, salt, 64, (err, derivedKey) => {
			if (err) {
				reject(err);

			} else {
				resolve(key == derivedKey.toString('hex'));
			}
		});
	})
}


module.exports = {
	hash: hash,
	verify: verify
}