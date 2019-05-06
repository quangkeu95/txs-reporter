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
import ora from 'ora';

const outputFile = path.join(__dirname, "reports/output/txs-report.xlsx");

class MainExecutor {
    constructor() {
        this.etherscanEndpoint = new endpoints.EtherscanEndpoint();
        this.sqlitePersist = new persist.SqlitePersist();
        this.excelReporter = new ExcelReporter();
    }

    async cleanDb(persist, mode) {
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
            throw new Error(err);
        }
    }

    async exportData(reporter, data) {
        const exportData = data.map(item => {
            return {
                txHash: item.txHash,
                timestamp: common.timestampToDatetime(item.timestamp),
                walletId: item.walletId,
                issues: item.issues
            }
        });
    
        try {
            await reporter.appendFailedResults(exportData);
            log(`Export finish! Output file path: ${outputFile}`);
        } catch (err) {
            console.log(err);
            throw new Error(err);
        }
    }

    async saveResults(persist, results) {
        try {
            await persist.insertMultipleTransactions(results);
        } catch (err) {
            console.log(err);
            throw new Error(err);
        }
    }

    async run() {
        try {
            if (process.env.CLEAN_DB === 'all' || process.env.CLEAN_DB === "lastBlock") {
                const result = await this.cleanDb(this.sqlitePersist, process.env.CLEAN_DB);
                if (result === true) {
                    log("Clean DB successfully");
                }
                return;
            }
        
            if (process.env.EXPORT === 'true') {
                // Export data
                const allResults = await this.sqlitePersist.getAllTransactions();
                await this.exportData(excelReporter, allResults);
                return;
            }

            const latestBlockNumber = await this.etherscanEndpoint.getLatestBlockNumber();
            const lastBlockNumber = await this.sqlitePersist.getLastBlock();

            let startBlockNumber = lastBlockNumber;
            if (lastBlockNumber === 0 || lastBlockNumber === null) {
                startBlockNumber = latestBlockNumber - 6000;
            }

            const allTxs = await this.etherscanEndpoint.getAllTransactionsToKyber(startBlockNumber, latestBlockNumber);
            
            const spinner = ora('Filter error transactions').start();
            const errorTxs = this.etherscanEndpoint.filterErrorTransactions(allTxs);
            spinner.succeed(`Filter error transactions: ${errorTxs.length}`);

            const results = await this.etherscanEndpoint.analyzeTxList(errorTxs);

            const tradeWithHintIssues = results.filter(item => {
                if (item) return true;
                return false;
            });

            spinner.succeed(`Filter error tradeWithHint transactions: ${tradeWithHintIssues.length}`);

            if (tradeWithHintIssues.length > 0) {
                await this.saveResults(this.sqlitePersist, tradeWithHintIssues);
            }
    
            // Save last block number
            this.sqlitePersist.updateLastBlock(latestBlockNumber);
    
            // Export data
            const allResults = await this.sqlitePersist.getAllTransactions();
        
            this.exportData(this.excelReporter, allResults);
        } catch (err) {
            console.log(err);
        }
    }
}

async function main() {
    const mainExecutor = new MainExecutor();
    mainExecutor.run();
}

main();
