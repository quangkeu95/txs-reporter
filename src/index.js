import Web3 from "web3";
import _ from "lodash";
import * as constants from "./constants";
import log from "./log";
import path from "path";

import * as endpoints from "./endpoints";
import * as persist from "./persist";
import * as converter from "./utils/converter";
import * as common from "./utils/common";
import { ExcelReporter } from "./reports";

const outputFile = path.join(__dirname, "reports/output/txs-report.xlsx");

async function debug (ethereum, input) {
    const networkIssues = {};
    const { blockNumber, status, gas, gasPrice, gasUsed, source, sourceAmount, dest, destAmount, from, value, reserves, minConversionRate } = input;
    try {
        const gasCap = ethereum.wrapperGetGasCap(blockNumber);

        if(!status || status == "0x0"){
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

        const rates = await ethereum.getRateAtSpecificBlock(source, dest, sourceAmount, blockNumber);
        if (converter.compareTwoNumber(rates.expectedPrice, 0) === 0) {
            const reasons = ethereum.wrapperGetReasons(reserves[0], input, blockNumber);
            networkIssues["rateError"] = reasons;
        } else {
            if (converter.compareTwoNumber(minConversionRate, rates.expectedPrice) === 1) {
                networkIssues["rateZero"] = "Your min rate is too high!";
            }
        }

        console.log("_________________________");
        console.log(networkIssues);
        return networkIssues;
    } catch (err) {
        console.log(err);
        return err;
    }
}

async function analyzeError(ethereum, tx) {
    try {
        if (!tx.input) {
            return null;
        }
        const exactData = await ethereum.exactTradeData(tx.input);
        if (exactData === null) {
            // Only filter transaction which has tradeWithHint method, otherwise return 
            return null;
        }
        const source = exactData[0].value;
        const sourceAmount = exactData[1].value;
        const dest = exactData[2].value;
        const destAddress = exactData[3].value;
        const maxDestAmount = exactData[4].value;
        const minConversionRate = exactData[5].value;
        const walletID = exactData[6].value;

        const reserves = await ethereum.getListReserve();
        const receipt = await ethereum.getTransactionReceipt(tx.hash);

        const { gasUsed, status } = receipt;
        // Only analyze error transactions
        if (status === true) {
            return null;
        }

        // Get block
        const block = await ethereum.getBlock(tx.blockNumber);
        const { timestamp } = block;

        const input = {
            ...tx,
            source, sourceAmount, dest, destAddress, maxDestAmount, minConversionRate, walletID, reserves, gasUsed, status, timestamp
        }

        const issues = await debug(ethereum, input);
        return {
            ...input,
            issues
        };
    } catch (err) {
        console.log(err);
    }
}

async function saveResults(persist, results) {
    try {
        await persist.insertMultipleTransactions(results);
    } catch (err) {
        console.log(err);
        return err;
    }
}

async function cleanDb(persist, mode) {
    try {
        if (mode === 'all') {
            await persist.deleteLastBlockRecord();
            await persist.deleteAllTxRecords();
        } else if (mode === 'lastBlock') {
            await persist.deleteLastBlockRecord();
        }
        return true;
    } catch (err) {
        console.log(err);
        return err;
    }
}

async function exportData(reporter, data) {
    const exportData = data.map(item => {
        return {
            txHash: item.txHash,
            timestamp: common.timestampToDatetime(item.timestamp),
            walletId: item.walletId,
            issues: item.issues
        }
    });

    await reporter.appendFailedResults(exportData);
    log(`Export finish! Output file path: ${outputFile}`);
}

async function main(){
    const infuraEndpoint = new endpoints.InfuraEndpoint();
    const sqlitePersist = new persist.SqlitePersist();
    const excelReporter = new ExcelReporter();

    if (process.env.CLEAN_DB === 'all' || process.env.CLEAN_DB === "lastBlock") {
        const result = cleanDb(sqlitePersist, process.env.CLEAN_DB);
        if (result === true) {
            log("Clean DB successfully");
        }
        return;
    }

    if (process.env.EXPORT === 'true') {
        // Export data
        const allResults = await sqlitePersist.getAllTransactions();
        await exportData(excelReporter, allResults);
        return;
    }

    try {
        const lastBlockNumber = await sqlitePersist.getLastBlock();
        const latestBlockNumber = await infuraEndpoint.getLatestBlockNumber();

        let startBlockNumber = lastBlockNumber;
        if (lastBlockNumber === 0 || lastBlockNumber === null) {
            startBlockNumber = latestBlockNumber - 1000;
        }
        
        log(`Get transactions in block range: ${startBlockNumber} - ${latestBlockNumber}`);
        const allTxs = await infuraEndpoint.getAllTransactionsInRange(startBlockNumber , latestBlockNumber);
        log(`All transactions: ${allTxs.length} txs`);

        // const allTxsToKyberWallet = allTxs.filter(item => {
        //     if (item && item.to) {
        //         return item.to === constants.KYBER_NETWORK_PROXY_CONTRACT_ADDRESS;
        //     }
        //     return false;
        // });
        // log(`Filter transactions to KyberNetwork Proxy: ${allTxsToKyberWallet.length} txs`);

        const queue = [];
        allTxs.forEach(item => {
            queue.push(analyzeError(infuraEndpoint, item));
        });
        const results = await Promise.all(queue);
        const filteredResults = results.filter(item => {
            if (item) {
                return true;
            }
            return false;
        });

        log(`Error transactions: ${filteredResults.length}`);

        // Save results to db
        if (filteredResults.length > 0) {
            await saveResults(sqlitePersist, filteredResults);
        }

        // Save last block number
        sqlitePersist.updateLastBlock(latestBlockNumber);

        // Export data
        const allResults = await sqlitePersist.getAllTransactions();
    
        exportData(excelReporter, allResults);
        
    } catch (err) {
        console.log(err);
    }
}

main();
