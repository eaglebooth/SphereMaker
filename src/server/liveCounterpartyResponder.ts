process.env.COUNTERPARTY_RESPONDER = 'true';
process.env.COUNTERPARTY_LOOP = 'true';

await import('./liveCounterparty');

export {};
