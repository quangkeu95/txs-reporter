import BigNumber from "bignumber.js";

export function compareTwoNumber(num1, num2) {
    const num1Big = new BigNumber(num1.toString());
    const num2Big = new BigNumber(num2.toString());
    return num1Big.comparedTo(num2Big);
}

export function maskNumber() {
    const initNumber = new BigNumber(2);
    return "0x" + (initNumber.pow(255).toString(16));
}

export function toHex(number){
    const bigNumber = new BigNumber(number);
    return "0x" + bigNumber.toString(16);
}

export function hexToNumber(hex) {
    return new BigNumber(hex).toNumber();
}

export function hexToString(hex) {
    return new BigNumber(hex).toString();
}

export function sumOfTwoNumber(num1, num2){
    const num1Big = new BigNumber(num1.toString());
    const num2Big = new BigNumber(num2.toString());
    const sum = num1Big.plus(num2Big);  
    return sum.toString();
}