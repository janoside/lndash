# LNDash

(Lightning Network Dashboard)

[![npm version][npm-ver-img]][npm-ver-url] [![NPM downloads][npm-dl-img]][npm-dl-url]

Admin web interface for [LND](https://github.com/lightningnetwork/lnd), via gRPC. Built with Node.js, express, bootstrap-v5.

![](docs/screenshots/dashboard.png)

Live demo: https://lndash.btc21.org

# Features

* UI for connecting to `LND` - requires host/port/admin.macaroon/tls.cert, which can be supplied in various ways, including using `LND Connect` strings
* Browse and search the public lightning network
* View invoices, payments, and forwarded payments
* Create and pay invoices
* Open and close channels
* Connect to multiple `LND` nodes and switch between them
* Simple/intuitive sorting filtering for most data
* Tools for sign/verify, query route, generate `LND Connect` strings
* Star (favorite) nodes and channels
* Responsive design (but UI is data/table heavy, so works best on large screens)


# Getting started

### 1. Install/Run LND

* [Install LND](https://github.com/lightningnetwork/lnd/blob/master/docs/INSTALL.md)


### 2. A. Install LNDash (from source)

* `git clone https://github.com/janoside/lndash.git`
* `cd lndash; npm install`
* `npm start`
* Open [http://127.0.0.1:3004/](http://127.0.0.1:3004/)

### 2. B. Install LNDash as global NPM package

* `npm install -g ln-dash`
* `LNDASH_PORT=3005 ln-dash`
* Open [http://127.0.0.1:3005/](http://127.0.0.1:3005/)

### 3. Setup LNDash via UI

Once started, LNDash's UI will guide you to set an admin password and then to connect to any LND nodes you're running. Your hashed password and your LND credentials (encrypted with your password), will be stored in the file `~/.lndash/credentials.json`. If you restart the app after setup, you'll need to "unlock" with your same admin password (in order to decrypt LND credentials). Deleting this file at any time and restarting will prompt you to go through the setup process again.


# Credits

Thanks to inspiration from [LND](https://github.com/lightningnetwork/lnd), [Joule](https://lightningjoule.com/), [RTL](https://github.com/ShahanaFarooqui/RTL), [zap desktop](https://github.com/LN-Zap/zap-desktop), [lndash](https://github.com/djmelik/lndash), and [lnd-explorer](https://github.com/altangent/lnd-explorer).

# Donate

* [https://donate.btc21.org](https://donate.btc21.org)



[npm-ver-img]: https://img.shields.io/npm/v/lndash.svg?style=flat
[npm-ver-url]: https://www.npmjs.com/package/lndash
[npm-dl-img]: http://img.shields.io/npm/dm/lndash.svg?style=flat
[npm-dl-url]: https://npmcharts.com/compare/lndash?minimal=true
