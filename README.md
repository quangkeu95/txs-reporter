# txs-reporter

## Introduction
This project is used to analyze reverted transactions in a range of blocks, produce reports in Excel format (.xlsx).

At initialization, the last block number is 0, so the range we are going to fetch are `(lastestBlockNumber - BLOCK_RANGE, lastestBlockNumber)`.
`BLOCK_RANGE` can be modified in `constants.js` file.

## Usage
To install dependencies, run:
```
npm install
```

To run analyze with default block range (7000 blocks) and get reports:
```
npm run start
```

To run analyze from last block, which is saved in DB, to latest block:
```
npm run start-from-last-block
```

To clean only the configure table, which holds the last block number:
```
npm run clean-last-block
```

To clean all the DB:
```
npm run clean-db
```

To get transaction records from DB and export (Make sure your transaction table has some records):
```
npm run export
```

## Storage
SQLite3 is used in this project. There are just 2 tables: **configure** and **transactions**.
- Configure table contains the last block number we run the analysis.
- Transactions table contains records which were error transactions and the reason why they were reverted.