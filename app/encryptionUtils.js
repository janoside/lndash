// ref: https://attacomsian.com/blog/nodejs-encrypt-decrypt-data

const crypto = require("crypto");


const ivByteCount = 16;

const algorithm = 'aes-256-ctr';
const keyCache = {};

const sha256 = (data) => {
	return crypto.createHash("sha256").update(data).digest("hex");
};

const keyFromPasswordAndSalt = (password, pbkdf2SaltString) => {
	let pwdHash = sha256(password);

	if (!keyCache[pwdHash]) {
		const pbkdf2Salt = Buffer.from(pbkdf2SaltString, "hex");
		const key = crypto.pbkdf2Sync(password, pbkdf2Salt, 1000, 16, "sha256").toString("hex");

		keyCache[pwdHash] = key;
	}

	return keyCache[pwdHash];
};

const encryptor = (encryptionPassword, pbkdf2SaltString) => {
	return {
		encrypt: (plaintext, password=encryptionPassword) => {
			const key = keyFromPasswordAndSalt(password, pbkdf2SaltString);
			
			const iv = crypto.randomBytes(ivByteCount);
			const cipher = crypto.createCipheriv(algorithm, key, iv);

			const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

			return Buffer.concat([iv, encrypted]);
		},

		decrypt: (ciphertext, password=encryptionPassword) => {
			const key = keyFromPasswordAndSalt(password, pbkdf2SaltString);

			const iv = Buffer.alloc(ivByteCount);
			ciphertext.copy(iv, 0, 0, ivByteCount);

			const decipher = crypto.createDecipheriv(algorithm, key, iv);

			const ciphertextData = Buffer.alloc(ciphertext.length - ivByteCount);
			ciphertext.copy(ciphertextData, 0, ivByteCount, ciphertext.length);

			const decrpyted = Buffer.concat([decipher.update(ciphertextData), decipher.final()]);

			return decrpyted;
		}
	};
}


module.exports = {
	encryptor: encryptor,
};