const log = (message) => {
    const date = new Date();
    const currentTime = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}` 
    console.log(`[${currentTime}]  ${message}`);
}

export default log;