import _ from "lodash";
import log from "./log";
import path from "path";
import ora from "ora";
import Table from "cli-table";
import fs from "fs";

import * as constants from "./constants";
import * as endpoints from "./endpoints";
import * as persist from "./persist";
import * as common from "./utils/common";
import * as reporter from "./reports";


const excelOutputFile = path.join(__dirname, "reports/output/txs-report.xlsx");
const txtOutputFile = path.join(__dirname, "reports/output/txs-report.txt");
const dbFile = path.join(__dirname, "persist/sqlite/stores/sqlite3.db");

class MainExecutor {
    constructor() {
        this.etherscanEndpoint = new endpoints.EtherscanEndpoint();
        this.sqlitePersist = new persist.SqlitePersist();
        this.excelReporter = new reporter.ExcelReporter();
        this.txtReporter = new reporter.TxtReporter();
    }

    async cleanDb(persist, mode) {
        try {
            if (mode === 'all') {
                if (fs.existsSync(dbFile)) {
                    fs.unlink(dbFile, (err) => {
                        if (err) {
                            console.log("Remove DB file error");
                            console.log(err);
                        }
                    })
                }
                // await persist.deleteLastBlockRecord();
                // await persist.deleteAllTxRecords();
            } else if (mode === 'lastBlock') {
                await persist.deleteLastBlockRecord();
            }
            return true;
        } catch (err) {
            console.log(err);
            throw new Error(err);
        }
    }

    async exportData(reporter, data, outputFile) {
        const exportData = data.map(item => {
            return {
                txHash: item.txHash,
                timestamp: common.timestampToDatetime(item.timestamp),
                walletId: item.walletId,
                method: item.method,
                issues: item.issues
            }
        });
    
        try {
            await reporter.appendResults(exportData);
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

    logResults(data) {
        const table = new Table({
            head: ['Tx Hash', 'Timestamp', 'Wallet ID', 'Method', 'Issues'],
        });

        const rows = data.map(item => {
            let issueString = Object.keys(item.issues).map(key => item.issues[key]).join(', ');
            return [item.hash, common.timestampToDatetime(item.timeStamp), item.walletId, item.method, issueString];
        });

        table.push(...rows);
        
        log("Results: ");
        console.log(table.toString());
    }

    async analyzeSingleTx(txHash) {
        const tx = await this.etherscanEndpoint.getSingleTransactionToKyber(txHash);
        
        const results = await this.etherscanEndpoint.analyzeTxList([tx]);
        this.logResults(results);
    }

    async run() {
        try {
            if (process.env.ANALYZE === "true") {
                if (process.argv.slice(2).length > 0) {
                    const txHash = process.argv[2];
                    this.analyzeSingleTx(txHash);
                    return;
                }
            }

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
            if (lastBlockNumber === 0 || lastBlockNumber === null || process.env.FROM_LAST_BLOCK !== 'true') {
                startBlockNumber = latestBlockNumber - constants.BLOCK_RANGE;
            }

            const allTxs = await this.etherscanEndpoint.getAllTransactionsToKyber(startBlockNumber, latestBlockNumber);
            
            const spinner = ora('Filter error transactions').start();
            const errorTxs = this.etherscanEndpoint.filterErrorTransactions(allTxs);

            const results = await this.etherscanEndpoint.analyzeTxList(errorTxs);

            const tradeIssues = results.filter(item => {
                if (item) return true;
                return false;
            });

            spinner.succeed(`Filter trade error transactions: ${tradeIssues.length}`);

            this.logResults(tradeIssues);

            if (tradeIssues.length > 0) {
                await this.saveResults(this.sqlitePersist, tradeIssues);
            }
    
            // Save last block number
            this.sqlitePersist.updateLastBlock(latestBlockNumber);
    
            // Export data
            const allResults = await this.sqlitePersist.getAllTransactions();

            // Columns: txHash, timestamp, walletId, issues
            this.exportData(this.excelReporter, allResults, excelOutputFile);
            this.exportData(this.txtReporter, allResults, txtOutputFile);
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
