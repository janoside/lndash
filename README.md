# LND Admin

[![npm version][npm-ver-img]][npm-ver-url] [![NPM downloads][npm-dl-img]][npm-dl-url]

Admin web interface for [LND](https://github.com/lightningnetwork/lnd), via gRPC. Built with Node.js, express, bootstrap-v4.

![](docs/screenshots/dashboard.png)

Live demo: https://lnd-admin.chaintools.io

# Features

* UI for connecting to LND - requires host/port/admin.macaroon/tls.cert, which can be supplied in various ways, including using LND Connect strings
* Browse and search the public lightning network
* View invoices, payments, and forwarded payments
* Create and pay invoices
* Open channels (close=TODO)
* Connect to multiple LND nodes and switch between them
* Simple/intuitive sorting filtering for most data
* Tools for sign/very, query route, generate LND Connect strings
* Responsive design (but UI is data/table heavy, so works best on large screens)


# Getting started

## Instructions

0. [Install LND](https://github.com/lightningnetwork/lnd/blob/master/docs/INSTALL.md)
1. `git clone git@github.com:janoside/lnd-admin.git`
2. `cd lnd-admin; npm install`
3. Configure via environment variables or `.env` file. See [configuration](#configuration).
4. `npm start`
5. Open [http://127.0.0.1:3004/](http://127.0.0.1:3004/)

### Configuration

Configuration options may be passed as environment variables or by creating a `.env` file in the root directory. See [.env-sample](.env-sample) for a list of the options and details for formatting `.env`.


# Credits

Thanks to inspiration from [LND](https://github.com/lightningnetwork/lnd), [Joule](https://lightningjoule.com/), [RTL](https://github.com/ShahanaFarooqui/RTL), [zap desktop](https://github.com/LN-Zap/zap-desktop), [lndash](https://github.com/djmelik/lndash), and [lnd-explorer](https://github.com/altangent/lnd-explorer).

# Donate

To support continued development of this tool and/or to support the hosting of the live demo site:

* [Bitcoin](bitcoin:3NPGpNyLLmVKCEcuipBs7G4KpQJoJXjDGe): 3NPGpNyLLmVKCEcuipBs7G4KpQJoJXjDGe



[npm-ver-img]: https://img.shields.io/npm/v/lnd-admin.svg?style=flat
[npm-ver-url]: https://www.npmjs.com/package/lnd-admin
[npm-dl-img]: http://img.shields.io/npm/dm/lnd-admin.svg?style=flat
[npm-dl-url]: https://npmcharts.com/compare/lnd-admin?minimal=true