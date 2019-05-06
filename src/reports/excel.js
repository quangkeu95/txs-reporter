import Excel from 'exceljs';
import fs from "fs";
import path from "path";

const dir = __dirname + '/output';
if(!fs.existsSync(dir)){
  fs.mkdirSync(dir);
}

const outputFile = path.join(__dirname, "/output/txs-report.xlsx");

export default class ExcelReporter {
    constructor() {
        // Init
        this.initWorkbook();
    }

    initWorkbook() {
        const existed = fs.existsSync(outputFile);

        if (!existed) {
            fs.writeFile(outputFile, '', err => {
                if (err) {
                    console.log(err);
                    throw err;
                }
                console.log(`Init output file: ${path.basename(outputFile)}`);
            });
        }

        this.workbook = new Excel.Workbook();
    }

    async appendResults(data, sheetName = "Reverted Transactions") {
        const sheet = this.workbook.addWorksheet(sheetName);

        sheet.columns = [
            { header: "Tx Hash", key: 'txHash', width: 60 },
            { header: "Timestamp", key: 'timestamp', width: 20 },
            { header: "Wallet ID", key: 'walletId', width: 40 },
            { header: "Issues", key: 'issues', width: 120 }
        ];

        sheet.addRows(data);

        await this.workbook.xlsx.writeFile(outputFile);
    }
}