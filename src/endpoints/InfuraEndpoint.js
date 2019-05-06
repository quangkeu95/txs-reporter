import Web3 from "web3";
import _ from "lodash";
import * as constants from "../constants";
import abiDecoder from "abi-decoder";
import * as converter from "../utils/converter";
const async = require("async");

export default class InfuraEndpoint {
    constructor() {
        // Init
        this.initContract();
    }

    initContract() {
        this.networkAddress = constants.KYBER_NETWORK_PROXY_CONTRACT_ADDRESS;

        this.rpc = new Web3(new Web3.providers.HttpProvider(constants.INFURA_ENDPOINT, constants.CONNECTION_TIMEOUT));
        this.networkContract = new this.rpc.eth.Contract(constants.KYBER_NETWORK_CONTRACT_ABI, this.networkAddress);
        this.erc20Contract = new this.rpc.eth.Contract(constants.ERC20_CONTRACT_ABI);
    }

    async getLatestBlockNumber() {
        try {
            return await this.rpc.eth.getBlockNumber();
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    async getBlock(blockNumber, returnTransactionObj = false) {
        try {
            return await this.rpc.eth.getBlock(blockNumber, returnTransactionObj);
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    async getTx(txHash) {
        try {
            const result = await this.rpc.eth.getTransaction(txHash);
            if (result != null) {
                return result;
            } else {
                return null;
            }
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    async getAllTransactionsInBlock(blockNumber) {
        try {
            const block = await this.rpc.eth.getBlock(blockNumber, true);
            if (block.transactions) {
                return block.transactions;
            };
            return null;
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    getAllTransactionsInRange(startBlockNumber, endBlockNumber, limit = 100) {
        const rangeBlock = _.range(startBlockNumber, endBlockNumber);

        return new Promise((resolve, reject) => {
            async.mapLimit(rangeBlock, limit, (blockNumber, callback) => {
                this.getAllTransactionsInBlock(blockNumber).then(response => {
                    callback(null, response);
                }, err => {
                    callback(err, null);
                });
            }, (err, results) => {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                resolve(_.flatten(results));
            });
        });
    }
    
    getAllTransactionsToKyber(startBlockNumber, endBlockNumber) {
        return new Promise((resolve, reject) => {
            this.getAllTransactionsInRange(startBlockNumber, endBlockNumber).then(response => {
                const allTxsToKyber = response.filter(item => {
                    if (item && item.to) {
                        return item.to === constants.KYBER_NETWORK_PROXY_CONTRACT_ADDRESS;
                    }
                    return false;
                });
                resolve(allTxsToKyber);
            }, err => {
                console.log(err);
                reject(err);
            });
        });
    }

    async getAllTransactionsInRangeWithBatch(startBlockNumber, endBlockNumber) {
        // Error when range is >= 1000
        const batch = this.rpc.eth.BatchRequest();
        try {
            for (let i = startBlockNumber; i <= endBlockNumber; i++) {
                batch.add(this.rpc.eth.getBlock.request(i, true, (err, result) => {}));
            }
            const result = await batch.execute();
            return result.response;
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    async getTransactionReceipt(txHash) {
        try {
            const txReceipt = await this.rpc.eth.getTransactionReceipt(txHash);
            return txReceipt;
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    async getRevertedTransactions(txs) {
        const queue = [];
        try {
            txs.forEach(tx => {
                queue.push(this.getTransactionReceipt(tx.hash));
            });
            const result = await Promise.all(queue);
            const revertedTxs = result.filter(item => {
                if (item) {
                    return item.status === false;
                }
            });
            return revertedTxs;
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    async getAllowanceAtSpecificBlock(sourceToken, owner, blockno) {
        const tokenContract = this.erc20Contract;
        tokenContract.address = sourceToken;

        try {
            const data = tokenContract.methods.allowance(owner, this.networkAddress).encodeABI();
            const result = await this.rpc.eth.call({
                to: sourceToken,
                data: data
            }, blockno);

            const allowance = this.rpc.eth.abi.decodeParameters(['uint256'], result);
            return allowance[0];
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    async getTokenBalanceAtSpecificBlock(address, ownerAddr, blockno) {
        const tokenContract = this.erc20Contract;
        tokenContract.address = address;

        try {
            const data = tokenContract.methods.balanceOf(ownerAddr).encodeABI();
            const result = await this.rpc.eth.call({
                to: address,
                data: data
            }, blockno);
            const balance = this.rpc.eth.abi.decodeParameters(['uint256'], result);
            return balance[0];
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    async getMaxCapAtSpecificBlock(address, blockno) {
        try {
            const data = this.networkContract.methods.getUserCapInWei(address).encodeABI();
            const result = await this.rpc.eth.call({
                to: this.networkAddress,
                data: data
            }, blockno);
            const cap = this.rpc.eth.abi.decodeParameters(['uint256'], result);
            return cap[0];
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    async getRateAtSpecificBlock(source, dest, srcAmount, blockno) {
        //special handle for official reserve
        const mask = converter.maskNumber();
        let srcAmountEnableFistBit = converter.sumOfTwoNumber(srcAmount,  mask);
        srcAmountEnableFistBit = converter.toHex(srcAmountEnableFistBit);

        try {
            const data = this.networkContract.methods.getExpectedRate(source, dest, srcAmountEnableFistBit).encodeABI();
            const result = await this.rpc.eth.call({
                to: this.networkAddress,
                data: data
            }, blockno);
            if (result === "0x") {
                return {
                    expectedPrice: "0",
                    slippagePrice: "0"
                }
            }

            const rates = this.rpc.eth.abi.decodeParameters([{
                type: 'uint256',
                name: 'expectedPrice'
            }, {
                type: 'uint256',
                name: 'slippagePrice'
            }], result);
            return rates;
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    async wrapperGetGasCap(blockno) {
        try {
            const data = await this.networkContract.methods.maxGasPrice().encodeABI();
            const result = await this.rpc.eth.call({
                to: this.networkAddress,
                data: data
            }, blockno);
            const gasCap = this.rpc.eth.abi.decodeParameters(['uint256'], result);
            return (gasCap[0]);
        } catch (err) {
            console.log(err);
            return {
                isError: true,
                error: err
            }
        }
    }

    exactTradeData(data) {
        return new Promise((resolve, reject) => {
            try {
                //get trade abi from 
                const tradeAbi = this.getAbiByName("tradeWithHint", constants.KYBER_NETWORK_CONTRACT_ABI);
                //  console.log(tradeAbi)
                if (!tradeAbi) resolve(null);
                abiDecoder.addABI(tradeAbi)
                //  console.log(abiDecoder)
                const decoded = abiDecoder.decodeMethod(data);
                    //  console.log(decoded)
                if (decoded) {
                    resolve(decoded.params);
                } else {
                    resolve(null);
                }
            } catch (e) {
                reject(e)
            }
        });
    }

    getAbiByName(name, abi) {
        for (var value of abi) {
            if (value.name === name) {
                return [value]
            }
        }
        return false
    }

    getListReserve() {
        return Promise.resolve([constants.RESERVES]);
    }

    wrapperGetReasons(reserve, input, blockno) {
        return new Promise((resolve) => {
            resolve("Cannot get rate at the moment!");
        });
    }

    
}