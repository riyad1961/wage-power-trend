import { writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outputUrl = new URL('../latest-market-data.json', import.meta.url);
const temporaryUrl = new URL('../latest-market-data.tmp.json', import.meta.url);

async function getJson(url){
    const response = await fetch(url, {
        headers: { 'User-Agent': 'wage-power-trend-data-updater/1.0' }
    });

    if(!response.ok){
        throw new Error(`${url} returned ${response.status}`);
    }

    return response.json();
}

function marketPoint(payload){
    const meta = payload.chart?.result?.[0]?.meta;
    const value = Number(meta?.regularMarketPrice);
    const timestamp = Number(meta?.regularMarketTime);

    if(!Number.isFinite(value) || !Number.isFinite(timestamp)){
        throw new Error('Market response is missing a price or timestamp');
    }

    return {
        value,
        date: new Date(timestamp * 1000).toISOString().slice(0, 10)
    };
}

const [goldPayload, nasdaqPayload, exchangePayload] = await Promise.all([
    getJson('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?range=5d&interval=1d'),
    getJson('https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?range=5d&interval=1d'),
    getJson('https://boi.org.il/PublicApi/GetExchangeRates')
]);

const usd = exchangePayload.exchangeRates?.find(item => item.key === 'USD');
if(!usd || !Number.isFinite(Number(usd.currentExchangeRate))){
    throw new Error('Bank of Israel response is missing the USD rate');
}

const snapshot = {
    updatedAt: new Date().toISOString(),
    gold: marketPoint(goldPayload),
    nasdaq: marketPoint(nasdaqPayload),
    usdIls: {
        value: Number(usd.currentExchangeRate),
        date: new Date(usd.lastUpdate).toISOString().slice(0, 10)
    }
};

await writeFile(temporaryUrl, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
await rename(temporaryUrl, outputUrl);
console.log(`Updated ${fileURLToPath(outputUrl)} at ${snapshot.updatedAt}`);
