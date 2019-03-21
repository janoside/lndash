# LND Admin

Admin web interface for [LND](https://github.com/lightningnetwork/lnd), via gRPC. Built with Node.js, express, bootstrap-v4, coreui.

Live demo: https://lnd-admin.chaintools.io

# Features

* Browse and search the public lightning network
* View invoices, payments
* Create and pay invoices
* Open and close channels
* Configure multiple LND nodes and switch between them


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


# Donate

To support continued development of this tool and/or to support the hosting of the live demo site:

* [Bitcoin](bitcoin:3NPGpNyLLmVKCEcuipBs7G4KpQJoJXjDGe): 3NPGpNyLLmVKCEcuipBs7G4KpQJoJXjDGe

