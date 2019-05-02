
export function timestampToDatetime(timestamp) {
    const date = new Date(timestamp*1000);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    let hours = date.getHours();
    if (hours < 10) {
        hours = "0" + hours;
    }
    let minutes = date.getMinutes();
    if (minutes < 10) {
        minutes = "0" + minutes;
    }

    let seconds = date.getSeconds();
    if (seconds < 10) {
        seconds = "0" + seconds;
    }

    return `${month}-${day}-${year} ${hours}:${minutes}:${seconds}`;
}