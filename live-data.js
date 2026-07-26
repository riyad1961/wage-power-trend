const latestDataIndex = chart.data.labels.length - 1;

const cbsPriceSeries = {
    Housing: 40010,
    Milk: 120240,
    Electricity: 120590,
    'Fruit & Veg': 120040
};

const marketSeries = {
    Gold: { snapshotKey: 'gold', valueAt2020: 1895.1 },
    NASDAQ: { snapshotKey: 'nasdaq', valueAt2020: 12888.28 }
};

function addCacheBuster(url){
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}_=${Date.now()}`;
}

async function fetchJson(url){
    const response = await fetch(addCacheBuster(url), { cache:'no-store' });
    if(!response.ok) throw new Error(`Data request failed (${response.status})`);
    return response.json();
}

function setLatestValue(label, value){
    const dataset = chart.data.datasets.find(item => item.label === label);
    if(!dataset || !Number.isFinite(value)) throw new Error(`Invalid ${label} value`);
    dataset.data[latestDataIndex] = Math.round(value * 10) / 10;
}

function valueByBase(observation){
    const values = new Map();
    if(observation.currBase){
        values.set(observation.currBase.baseDesc, Number(observation.currBase.value));
    }
    (observation.prevBase || []).forEach(base => {
        values.set(base.baseDesc, Number(base.value));
    });
    return values;
}

function comparableRatio(latest, baseline){
    const latestValues = valueByBase(latest);
    const baselineValues = valueByBase(baseline);
    const commonBase = [...latestValues.keys()].find(base => baselineValues.has(base));
    if(!commonBase) throw new Error('CBS observations have no common index base');
    return latestValues.get(commonBase) / baselineValues.get(commonBase);
}

async function refreshCbsPrice(label, seriesId){
    const payload = await fetchJson(
        `https://api.cbs.gov.il/index/data/price?id=${seriesId}` +
        '&format=json&download=false&startPeriod=01-2020&coef=true&lang=en'
    );
    const observations = payload.month?.[0]?.date || [];
    const latest = observations[0];
    const baseline = observations.find(item => item.year === 2020 && item.month === 12) ||
        observations.find(item => item.year === 2020);
    if(!latest || !baseline) throw new Error(`Missing CBS ${label} observations`);

    const dataset = chart.data.datasets.find(item => item.label === label);
    setLatestValue(label, dataset.data[3] * comparableRatio(latest, baseline));
    return `${latest.monthDesc} ${latest.year}`;
}

async function refreshWages(){
    const payload = await fetchJson(
        'https://apis.cbs.gov.il/series/data/list?id=613067' +
        '&format=json&download=false&startPeriod=01-2020&lang=en&addNull=false&pagesize=1000'
    );
    const observations = payload.DataSet?.Series?.[0]?.obs || [];
    const latest = observations[0];
    const baseline = observations.find(item => item.TimePeriod === '2020-12') ||
        [...observations].reverse().find(item => item.TimePeriod.startsWith('2020-'));
    if(!latest || !baseline) throw new Error('Missing CBS wage observations');

    const dataset = chart.data.datasets.find(item => item.label === 'Wages');
    setLatestValue('Wages', dataset.data[3] * Number(latest.Value) / Number(baseline.Value));
    return latest.TimePeriod;
}

function refreshExchangeRate(snapshot){
    const currentRate = Number(snapshot.usdIls?.value);
    if(!Number.isFinite(currentRate)) throw new Error('Missing USD/ILS rate');

    const dataset = chart.data.datasets.find(item => item.label === 'USD/ILS');
    setLatestValue('USD/ILS', dataset.data[3] * currentRate / 3.442);
    return snapshot.usdIls.date;
}

function refreshMarket(label, config, snapshot){
    const marketValue = snapshot[config.snapshotKey];
    const currentValue = Number(marketValue?.value);
    const dataset = chart.data.datasets.find(item => item.label === label);
    setLatestValue(label, dataset.data[3] * currentValue / config.valueAt2020);
    return marketValue.date;
}

async function refreshLatestData(){
    const marketSnapshot = fetchJson('latest-market-data.json');
    const requests = [
        ['Wages', refreshWages()],
        ['USD/ILS', marketSnapshot.then(refreshExchangeRate)],
        ...Object.entries(cbsPriceSeries).map(([label, id]) => [label, refreshCbsPrice(label, id)]),
        ...Object.entries(marketSeries).map(([label, config]) => [label, marketSnapshot.then(snapshot => refreshMarket(label, config, snapshot))])
    ];
    const results = await Promise.allSettled(requests.map(([, request]) => request));
    const updated = [];

    results.forEach((result, index) => {
        const label = requests[index][0];
        if(result.status === 'fulfilled'){
            updated.push(label);
        }else{
            console.warn(`Could not refresh ${label}:`, result.reason);
        }
    });

    const updateDay = new Intl.DateTimeFormat('en-GB', {
        weekday:'short',
        day:'numeric',
        month:'short',
        year:'numeric'
    }).format(new Date());

    window.chartUpdateLabel = updated.length
        ? `Updated ${updateDay}`
        : 'Update unavailable';
    chart.update();
}

refreshLatestData();









