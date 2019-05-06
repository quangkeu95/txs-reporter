const sqlite3 = require('sqlite3').verbose();

import fs from "fs";
import path from "path";
import _ from "lodash";
import log from "../../log";

const dir = __dirname + '/stores'
if(!fs.existsSync(dir)){
  fs.mkdirSync(dir);
}

const dbFile = path.join(__dirname, '/stores/sqlite3.db');

export default class SqlitePersist {
    constructor() {
        // Init
        this.initStore();
    }

    initStore() {
        // if (fs.existsSync(dbFile)) {
        //     this.db = new sqlite3.Database(dbFile);
        // } else {
            this.db = new sqlite3.Database(dbFile);
            this.db.serialize(() => {
                this.initConfigureTable();
                this.initTransactionTable();
            });
        // }
    }

    initTransactionTable() {
        this.db.run("CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, txHash TEXT UNIQUE, timestamp INT, walletId TEXT, issues TEXT)");
        log("Init Transaction table");
    }

    async initConfigureTable() {
        this.db.run("CREATE TABLE IF NOT EXISTS configure (id INTEGER PRIMARY KEY, lastBlock INTEGER)");
        log("Init Configure table");

        try {
            const lastBlock = await this.getLastBlock();
            if (lastBlock === null) {
                const stmt = this.db.prepare("INSERT INTO configure VALUES (?,?)");
                stmt.run(1, 0);
                stmt.finalize();
            }
        } catch (err) {
            console.log(err);
            throw new Error(err);
        }
    }


    async insertTransaction(tx) {
        const { hash, timeStamp, walletID, issues } = tx;

        try {
            const stmt = this.db.prepare("REPLACE INTO transactions(txHash, timestamp, walletId, issues) VALUES (?,?,?,?)");
            let issueString = Object.keys(issues).map(key => item.issues[key]).join(', ');
            stmt.run(hash, timeStamp, walletID, issueString);
            stmt.finalize();

            return tx;
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    async insertMultipleTransactions(listTxs) {
        const placeholders = listTxs.map(item => '(?,?,?,?)').join(',');
        const sql = `REPLACE INTO transactions(txHash, timestamp, walletId, issues) VALUES ${placeholders}`;

        try {
            const params = listTxs.map(item => {
                let issueString = Object.keys(item.issues).map(key => item.issues[key]).join(', ');

                return [
                    item.hash, item.timeStamp, item.walletID, issueString
                ];
            });
            const flattenParams = _.flatten(params);
            this.db.run(sql, flattenParams, (err, row) => {
                if (err) {
                    console.log(err);
                    return err;
                }
            });
            console.log(`Transaction report results inserted: ${listTxs.length}`);
            return listTxs;
        } catch (err) {
            console.log(err);
            return err;
        }
    }

    getAllTransactions() {
        const sql = "SELECT * from transactions";
        return new Promise((resolve, reject) => {
            this.db.all(sql, (err, rows) => {
                if (err) {
                    console.log(err);
                    reject(err.message);
                } else {
                    if (rows.length > 0) {
                        resolve(rows);
                    } else {
                        resolve(null);
                    }
                }
            })
        })
    }

    deleteAllTxRecords() {
        const sql = "DELETE FROM transactions";
        return new Promise((resolve, reject) => {
            this.db.all(sql, (err, rows) => {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                console.log(`Clean "transactions" table`);
                resolve(true);
            });
        });
    }

    getLastBlock() {
        const sql = "SELECT lastBlock FROM configure WHERE id = ?";
        return new Promise((resolve, reject) => {
            this.db.get(sql, [1], (err, row) => {
                if (err) {
                    console.log(err);
                    reject(err.message);
                } else {
                    if (row) {
                        resolve(row.lastBlock);
                    } else {
                        resolve(null);
                    }
                }
            });
        });
    }


    updateLastBlock(blockNumber) {
        const sql = "UPDATE configure SET lastBlock = ? WHERE id = ?";
        return new Promise((resolve, reject) => {
            this.db.run(sql, [blockNumber, 1], (err, row) => {
                if (err) {
                    console.log(err);
                    reject(err.message);
                } else {
                    console.log(`Update configure table successfully, lastBlock: ${blockNumber}`);
                    resolve(blockNumber);
                }
            });
        });
    }

    deleteLastBlockRecord() {
        const sql = "DELETE FROM configure";
        return new Promise((resolve, reject) => {
            this.db.all(sql, (err, rows) => {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                console.log(`Clean "configure" table`);
                resolve(true);
            })
        });
        
    }
}
