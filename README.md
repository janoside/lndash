# LND Admin

Admin web interface for LND from Lightning Labs. Built with Node.js, express, bootstrap-v4.

A live demo of the tool is available at https://lnd-admin.chaintools.io

# Features

* Network summary
* Browse nodes and channels, sorted by last update or capacity
* View node and channel details
* Search by node or channel
* Configure multiple LND nodes and switch between them

# Getting started

## Prerequisites

1. Install and run a full, archiving node - [instructions](https://bitcoin.org/en/full-node). Ensure that your node has full transaction indexing enabled (`txindex=1`) and the RPC server enabled (`server=1`).
2. Synchronize your node with the Bitcoin network.
3. [Install LND](https://github.com/lightningnetwork/lnd/blob/master/docs/INSTALL.md)

## Instructions

1. Clone this repo
2. `npm install`
3. Configure via environment variables or `.env` file. See [configuration](#configuration).
4. `npm start`
5. Open [http://127.0.0.1:3004/](http://127.0.0.1:3004/)


### Configuration

Configuration options may be passed as environment variables or by creating a `.env` file in the root directory. See [.env-sample](.env-sample) for a list of the options and details for formatting `.env`.


# Donate

To support continued development of this tool and/or to support the hosting of the live demo site:

* [Bitcoin](bitcoin:3NPGpNyLLmVKCEcuipBs7G4KpQJoJXjDGe): 3NPGpNyLLmVKCEcuipBs7G4KpQJoJXjDGe
* [Litecoin](litecoin:ME4pXiXuWfEi1ANBDo9irUJVcZBhsTx14i): ME4pXiXuWfEi1ANBDo9irUJVcZBhsTx14i

