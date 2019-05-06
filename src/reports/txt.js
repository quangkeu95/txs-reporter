import fs from "fs";
import path from "path";

const dir = __dirname + '/output';
if(!fs.existsSync(dir)){
  fs.mkdirSync(dir);
}

const outputFile = path.join(__dirname, "/output/txs-report.txt");

export default class TxtReporter {
    constructor() {

    }

    appendResults(data) {
        const writeStream = fs.createWriteStream(outputFile);

        data.forEach(item => {
            writeStream.write([
               item.txHash, item.timestamp, item.walletId, item.issues 
            ].join(', ') + '\n');
        });

        writeStream.on('error', err => {
            console.log("Write to file error!");
            console.log(err);
        });

        writeStream.on('finish', () => {
            console.log("Write to file successfully");
        });

        writeStream.end();
    }
}