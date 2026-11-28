// Turns the JSON row of fixtures.sql into fixtures.json for bench.mjs / check-pages.mjs.
let s = '';
process.stdin.on('data', (d) => (s += d)).on('end', () => {
	const [r] = JSON.parse(s);
	const f = {
		txRecent: r.recent[0].by, txHistory: r.old.by,
		txMiss: '00'.repeat(31) + 'aa', txMiss2: 'ff'.repeat(30) + '0011',
		outRecent: `${r.recent[0].tx}#${r.recent[0].idx}`, outRecent2: `${r.recent[1].tx}#${r.recent[1].idx}`,
		outHistory: `${r.old.tx}#${r.old.idx}`, outByron: `${r.byron.tx}#${r.byron.idx}`,
		addrNormal: r.recent[0].addr, addrBusy: r.busy.addr, stakeNormal: r.recent[0].stake, stakeBusy: r.busy.stake,
		scriptTop: r.scripts[0], scriptTop2: r.scripts[1], tokenA: r.tokens[1], tokenB: r.tokens[0]
	};
	console.log(JSON.stringify(f, null, 1));
});
