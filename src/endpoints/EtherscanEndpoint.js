import Web3 from "web3";
import _ from "lodash";
import axios from "axios";
import * as constants from "../constants";
import abiDecoder from "abi-decoder";
import * as converter from "../utils/converter";
import ora from 'ora';
import async from 'async';

export default class EtherscanEndpoint {
    constructor() {
        // Init

        this.networkAddress = constants.KYBER_NETWORK_PROXY_CONTRACT_ADDRESS;

        this.web3 = new Web3(new Web3.providers.HttpProvider(constants.INFURA_ENDPOINT, constants.CONNECTION_TIMEOUT));
        this.networkContract = new this.web3.eth.Contract(constants.KYBER_NETWORK_CONTRACT_ABI, constants.KYBER_NETWORK_PROXY_CONTRACT_ADDRESS);
        this.erc20Contract = new this.web3.eth.Contract(constants.ERC20_CONTRACT_ABI);

        this.addAbiDecoder();
    }

    getLatestBlockNumber() {
        const url = `https://api.etherscan.io/api?module=proxy&action=eth_blockNumber&apikey=${constants.ETHERSCAN_API_KEY}`;
        const spinner = ora(`Get lastest block number`).start();
        return new Promise((resolve, reject) => {
            axios.get(url).then(response => {
                if (response.status === 200) {
                    const latestBlockNumber = converter.hexToNumber(response.data.result);
                    spinner.succeed(`Lastest block number: ${latestBlockNumber}`);
                    resolve(latestBlockNumber);
                } else {
                    spinner.fail();
                    reject(null);
                }
            }).catch(err => {
                spinner.fail('Error get latest block number');
                console.log(err);
                reject(err);
            });
        });
    }

    getAllTransactionsToKyber(startBlockNumber, endBlockNumber, limit = 3) {
        const step = 500;

        const rangeBlock = _.range(startBlockNumber, endBlockNumber, step);

        const urls = rangeBlock.map(startBlock => {
            let endBlock = startBlock + 500;
            if (startBlock + step >= endBlockNumber) {
                endBlock = endBlockNumber;
            } else {
                endBlock = endBlock - 1;
            }
            return `http://api.etherscan.io/api?module=account&action=txlist&address=${this.networkAddress}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${constants.ETHERSCAN_API_KEY}`;
        })

        const spinner = ora(`Fetching transactions in range of block: ${startBlockNumber} - ${endBlockNumber}`).start();
        
        return new Promise((resolve, reject) => {
            async.mapLimit(urls, limit, (url, callback) => {
                axios.get(url).then(response => {
                    if (response.status === 200) {
                        callback(null, response.data.result);
                    } else {
                        callback('error fetching', null);
                    }
                }).catch(err => {
                    callback(err, null);
                });
            }, (err, results) => {
                if (err) {
                    spinner.fail('Error fetching transactions');
                    console.log(err);
                    reject(err);
                }
                const txs = _.flatten(results);
                spinner.info(`Range of block: ${startBlockNumber} - ${endBlockNumber}`);
                spinner.succeed(`Transactions: ${txs.length}`);
                resolve(txs);
            });
        });
    }

    wrapperGetGasCap(blockno) {
        const data = this.networkContract.methods.maxGasPrice().encodeABI();
        // const hexBlockNo = converter.toHex(blockno);
        // const url = `https://api.etherscan.io/api?module=proxy&action=eth_call&to=${this.networkAddress}&data=${data}&tag=${hexBlockNo}&apikey=${constants.ETHERSCAN_API_KEY}`;

        return new Promise((resolve, reject) => {
            this.web3.eth.call({
                to: this.networkAddress,
                data
            }, blockno).then(response => {
                if (response) {
                    const gasCap = this.web3.eth.abi.decodeParameters(['uint256'], response);
                    resolve(gasCap[0]);
                } else {
                    reject(null);
                }
            }).catch(err => {
                console.log(err);
                reject(err);
            });
        });
    }

    getAllowanceAtSpecificBlock(sourceToken, owner, blockno) {
        const tokenContract = this.erc20Contract;
        tokenContract.address = sourceToken;

        const data = tokenContract.methods.allowance(owner, this.networkAddress).encodeABI();
        // const hexBlockNo = converter.toHex(blockno);
        // const url = `https://api.etherscan.io/api?module=proxy&action=eth_call&to=${sourceToken}&data=${data}&tag=${hexBlockNo}&apikey=${constants.ETHERSCAN_API_KEY}`;

        return new Promise((resolve, reject) => {
            this.web3.eth.call({
                to: sourceToken,
                data
            }, blockno).then(response => {
                if (response) {
                    const allowance = this.web3.eth.abi.decodeParameters(['uint256'], response);
                    resolve(allowance[0]);
                } else {
                    reject(null);
                }
            }).catch(err => {
                console.log(err);
                reject(err);
            })
        });
    }

    getTokenBalanceAtSpecificBlock(address, ownerAddr, blockno) {
        const tokenContract = this.erc20Contract;
        tokenContract.address = address;

        const data = tokenContract.methods.balanceOf(ownerAddr).encodeABI();
        // const hexBlockNo = converter.toHex(blockno);
        // const url = `https://api.etherscan.io/api?module=proxy&action=eth_call&to=${address}&data=${data}&tag=${hexBlockNo}&apikey=${constants.ETHERSCAN_API_KEY}`;

        return new Promise((resolve, reject) => {
            this.web3.eth.call({
                to: address,
                data
            }, blockno).then(response => {
                if (response) {
                    const balance = this.web3.eth.abi.decodeParameters(['uint256'], response);
                    resolve(balance[0]);
                } else {
                    reject(null);
                }
            }).catch(err => {
                console.log(err);
                reject(err);
            })
        });
    }

    getMaxCapAtSpecificBlock(address, blockno) {
        const data = this.networkContract.methods.getUserCapInWei(address).encodeABI();
        // const hexBlockNo = converter.toHex(blockno);
        // const url = `https://api.etherscan.io/api?module=proxy&action=eth_call&to=${this.networkAddress}&data=${data}&tag=${hexBlockNo}&apikey=${constants.ETHERSCAN_API_KEY}`;

        return new Promise((resolve, reject) => {
            this.web3.eth.call({
                to: this.networkAddress,
                data
            }, blockno).then(response => {
                if (response) {
                    const cap = this.web3.eth.abi.decodeParameters(['uint256'], response);
                    resolve(cap[0]);
                } else {
                    reject(null);
                }
            }).catch(err => {
                console.log(err);
                reject(err);
            })
        });
    }

    getRateAtSpecificBlock(source, dest, srcAmount, blockno, method, hint) {
        let data;
        const permHint = this.web3.utils.utf8ToHex(constants.PERM_HINT);
        if (method === "tradeWithHint" && hint === permHint) {

            //special handle for official reserve
            const mask = converter.maskNumber();
            let srcAmountEnableFistBit = converter.sumOfTwoNumber(srcAmount,  mask);
            srcAmountEnableFistBit = converter.toHex(srcAmountEnableFistBit);

            data = this.networkContract.methods.getExpectedRate(source, dest, srcAmountEnableFistBit).encodeABI();
        } else if (method === "trade") {
            data = this.networkContract.methods.getExpectedRate(source, dest, converter.toHex(srcAmount)).encodeABI();
        }

        // const hexBlockNo = converter.toHex(blockno);
        // const url = `https://api.etherscan.io/api?module=proxy&action=eth_call&to=${this.networkAddress}&data=${data}&tag=${hexBlockNo}&apikey=${constants.ETHERSCAN_API_KEY}`;

        return new Promise((resolve, reject) => {
            this.web3.eth.call({
                to: this.networkAddress,
                data
            }, blockno).then(result => {
                if (result) {
                    if (result === "0x") {
                        resolve({
                            expectedPrice: "0",
                            slippagePrice: "0"
                        });
                    } else {
                        const rates = this.web3.eth.abi.decodeParameters([{
                            type: 'uint256',
                            name: 'expectedPrice'
                        }, {
                            type: 'uint256',
                            name: 'slippagePrice'
                        }], result);
                        resolve(rates);
                    }
                } else {
                    reject(null);
                }
            }).catch(err => {
                console.log(err);
                reject(err);
            });
        });
    }

    addAbiDecoder() {
        const tradeAbi = this.getAbiByName("trade", constants.KYBER_NETWORK_CONTRACT_ABI);
        const tradeWithHintAbi = this.getAbiByName("tradeWithHint", constants.KYBER_NETWORK_CONTRACT_ABI);

        abiDecoder.addABI(tradeAbi);
        abiDecoder.addABI(tradeWithHintAbi);
    }

    exactTradeData(data) {
        return new Promise((resolve, reject) => {
            try {
                const decoded = abiDecoder.decodeMethod(data);
                if (decoded) {
                    resolve(decoded);
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

    filterErrorTransactions(txList) {
        const results = txList.filter(item => {
            return item.isError === '1';
        });
        return results;
    }

    analyzeTxList(txList, limit = 5) {
        const spinner = ora('Analyzing transactions').start();
        return new Promise((resolve, reject) => {
            async.mapLimit(txList, limit, (tx, callback) => {
                this.analyzeError(tx).then(result => {
                    callback(null, result);
                }).catch(err => {
                    console.log(err);
                    callback(err, null);
                })
            }, (err, results) => {
                if (err) {
                    spinner.fail('Error analyzing transactions');
                    console.log(err);
                    reject(err);
                } else {
                    spinner.succeed('Analyze transactions successfully');
                    resolve(_.flatten(results));
                }
            });
        });
    }

    async analyzeError(tx) {
        try {
            if (!tx.input) {
                return null;
            }

            let exactData;
            let method = "";
            const tradeData = await this.exactTradeData(tx.input);
            if (tradeData === null) {
                return null;
            } else {
                if (tradeData.name === "trade") {
                    method = "trade";
                } else if (tradeData.name === "tradeWithHint") {
                    method = "tradeWithHint";
                }
                exactData = tradeData.params;
            }
            
            const source = exactData[0].value;
            const sourceAmount = exactData[1].value;
            const dest = exactData[2].value;
            const destAddress = exactData[3].value;
            const maxDestAmount = exactData[4].value;
            const minConversionRate = exactData[5].value;
            const walletId = exactData[6].value;
            const hint = method === "tradeWithHint" ? exactData[7].value : null;
    
            const reserves = await this.getListReserve();
    
            const input = {
                ...tx,
                source, sourceAmount, dest, destAddress, maxDestAmount, minConversionRate, walletId, reserves, method
            }
            if (hint) {
                input.hint = hint;
            }
    
            const issues = await this.debug(this, input);
            return {
                ...input,
                issues
            };
        } catch (err) {
            console.log(err);
            throw new Error(err);
        }
    }

    async debug (ethereum, input) {
        const networkIssues = {};
        const { blockNumber, isError, gas, gasPrice, gasUsed, source, sourceAmount, dest, destAmount, from, value, reserves, minConversionRate, method, hint } = input;
        try {
            const gasCap = ethereum.wrapperGetGasCap(blockNumber);
    
            if(!isError || isError == "1"){
                if(gas != 0 && (gasUsed/gas >= 0.95)){
                    networkIssues["gas_used"] = "Your transaction is run out of gas";
                }
            }
            if (source !== constants.ETHER_ADDRESS) {
                if (converter.compareTwoNumber(gasPrice, gasCap) === 1) {
                    networkIssues["gas_price"] = "Gas price exceeded max limit";
                }
                const remainStr = await ethereum.getAllowanceAtSpecificBlock(source, from, blockNumber);
                if (converter.compareTwoNumber(remainStr, sourceAmount) === -1) {
                    networkIssues["allowance"] = "Failed because allowance is lower than srcAmount";
                }
                const balance = await ethereum.getTokenBalanceAtSpecificBlock(source, from, blockNumber);
                if (converter.compareTwoNumber(balance, sourceAmount) === -1) {
                    networkIssues["balance"] = "Failed because token balance is lower than srcAmount";
                }
            } else {
                if (converter.compareTwoNumber(value, sourceAmount) !== 0) {
                    networkIssues["ether_amount"] = "Failed because the user didn't send the exact amount of ether along";
                }
            }
    
            if (source === constants.ETHER_ADDRESS) {
                const userCap = await ethereum.getMaxCapAtSpecificBlock(from, blockNumber);
                if (converter.compareTwoNumber(sourceAmount, userCap) === 1) {
                    networkIssues["user_cap"] = "Failed because the source amount exceeded user cap";
                }
            }
        
            if (dest === constants.ETHER_ADDRESS) {
                // const userCap = await ethereum.getMaxCapAtSpecificBlock(from, blockNumber);
                // Missing destAmount;
                // if (destAmount > userCap) {
                //     networkIssues["user_cap"] = "Failed because the source amount exceeded user cap"
                // }
            }

            const rates = await ethereum.getRateAtSpecificBlock(source, dest, sourceAmount, blockNumber, method, hint);
            if (converter.compareTwoNumber(rates.expectedPrice, 0) === 0) {
                const reasons = await ethereum.wrapperGetReasons(reserves[0], input, blockNumber);
                networkIssues["rateError"] = reasons;
            } else {
                if (converter.compareTwoNumber(minConversionRate, rates.expectedPrice) === 1) {
                    networkIssues["rateZero"] = "Your min rate is too high!";
                }
            }
    
            // console.log("_________________________");
            // console.log(networkIssues);
            return networkIssues;
        } catch (err) {
            // console.log(err);
            throw new Error(err);
        }
    }
}