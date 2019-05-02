import XLSX from 'xlsx';
import fs from "fs";
import path from "path";

const dir = __dirname + '/output';
if(!fs.existsSync(dir)){
  fs.mkdirSync(dir);
}

const outputFile = path.join(__dirname, "/output/txs-report.xlsx");

export default class XlsxReporter {
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

        this.workbook = XLSX.utils.book_new();
    }

    appendFailedResults(data, sheetName = "Reverted Transactions") {
        const options = {
            // header: ["id", "txHash", "timestamp", "walletID", "issues"],
            origin: -1  // append to bottom of worksheet
        };

        const sheet = XLSX.utils.json_to_sheet(data, options);
        XLSX.utils.book_append_sheet(this.workbook, sheet, sheetName);

        XLSX.writeFile(this.workbook, outputFile);
    }

}