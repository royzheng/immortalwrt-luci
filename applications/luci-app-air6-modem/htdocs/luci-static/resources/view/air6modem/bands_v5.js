'use strict';
'require view';
'require rpc';
'require poll';
'require air6modem.common_v4 as common';
'require air6modem.mode as mode';

const callStatus = rpc.declare({ object: 'luci.air6modem', method: 'get_status', expect: {} });
const callBands = rpc.declare({ object: 'luci.air6modem', method: 'get_band_set', expect: {} });
const callCells = rpc.declare({ object: 'luci.air6modem', method: 'get_cells', params: ['engineering'], expect: {} });

const carriers = {
	M: ['mobile', _('中国移动')], U: ['unicom', _('中国联通')],
	T: ['telecom', _('中国电信')], B: ['broadnet', _('中国广电')]
};

// Mainland spectrum licences and documented network sharing. See task 0006 for sources.
// Missing associations also cover overlapping ranges without evidence for this specific band.
const bands = {
	LTE: { prefix: 'B', factory: [1, 8, 41, 42],
		full: [1, 3, 5, 7, 8, 20, 28, 38, 40, 41, 42, 43],
		carriers: { 1: 'UT', 3: 'MUT', 5: 'T', 8: 'MU', 38: 'M', 40: 'MU', 41: 'M' } },
	NR: { prefix: 'n', factory: [3, 28, 77, 79],
		full: [1, 3, 5, 7, 8, 20, 28, 38, 40, 41, 77, 78, 79],
		carriers: { 1: 'UT', 3: 'UT', 5: 'T', 8: 'U', 28: 'BM', 41: 'MB', 78: 'UTB', 79: 'MB' } }
};

// Examples are labelled by deployment, not by exclusive ownership of spectrum.
const overseas = {
	B7: _('澳大利亚'), B20: _('奥地利'), B28: _('澳大利亚'),
	B42: _('英国（历史部署）'), B43: _('英国（历史部署）'),
	n38: _('波兰'), n40: _('沙特阿拉伯'), n77: _('日本')
};

function regionMark(band) {
	const region = overseas[band];
	return region
		? E('span', {}, [E('span', { 'aria-hidden': 'true' }, '🌐'), ' ', region])
		: E('abbr', { title: _('暂无运营商标注'), 'aria-label': _('暂无运营商标注') }, '—');
}

function icon(key) {
	const [file, name] = carriers[key];
	return E('img', {
		src: L.resource('air6modem/carriers/' + file + '.png'), alt: name, title: name,
		width: 24, height: 24, 'data-carrier': key
	});
}

function bandTable(kind, target, current) {
	const group = bands[kind];
	const rows = group.full.map(n => {
		const name = group.prefix + n;
		const keys = group.carriers[n] || '';
		const active = name.toLowerCase() === String(current || '').toLowerCase();
		let state = _('未知');
		if (active) state = _('当前');
		else if (target === 'EU25' || group.factory.includes(n)) state = _('可用');
		else if (target === 'FACTORY') state = _('未启用');
		const marks = keys ? Array.from(keys).flatMap((k, i) => i ? [' ', icon(k)] : [icon(k)]) : regionMark(name);
		return [marks, E(active ? 'strong' : 'span', { title: group.factory.includes(n) ? _('原厂频段') : _('扩展频段') }, name),
			active ? E('strong', {}, state) : state];
	});
	return common.table([_('运营商 / 地区'), kind, _('模组状态')], rows, kind);
}

function signed(value, limit) {
	let n = parseInt(value, 10);
	if (isNaN(n) || n > limit)
		return null;
	return -n;
}

function scaled(value, limit, factor) {
	let n = parseInt(value, 10);
	if (isNaN(n) || n > limit)
		return null;
	return (n * factor).toFixed(1);
}

/* AT+ECELL returns the serving cell followed by neighbour entries, each 15
 * comma separated fields (rat, cellid, tac, mcc, mnc, pci, rsrp, rsrq, ...,
 * sinr, ..., arfcn). The response carries the entry count first. */
function parseNeighbours(text) {
	let line = String(text || '').split(/\r?\n/).find(l => l.indexOf('+ECELL:') === 0);
	if (!line)
		return [];
	let tokens = line.replace(/^\+ECELL:\s*/, '').split(',').map(t => t.trim().replace(/^"|"$/g, ''));
	let entries = [];
	for (let i = 1; i + 15 <= tokens.length; i += 15)
		entries.push(tokens.slice(i, i + 15));
	return entries.slice(1).map(e => ({
		pci: e[5],
		rsrp: signed(e[6], 140),
		rsrq: scaled(e[7], 254, -0.1),
		sinr: scaled(e[11], 254, 0.1),
		arfcn: e[14]
	}));
}

function neighbours(result) {
	const response = result?.serving;
	if (result?.initializing) return _('等待模组就绪…');
	if (!response || response.code || !/^\+ECELL:/m.test(response.output || ''))
		return _('邻区读取失败');
	const list = parseNeighbours(response.output);
	if (!list.length) return _('暂无邻区测量数据');
	return common.table(['PCI', 'ARFCN', 'RSRP (dBm)', 'RSRQ (dB)', 'SINR (dB)'],
		list.map(n => [n.pci, n.arfcn, n.rsrp, n.rsrq, n.sinr].map(v => v ?? '–')), _('邻区测量'));
}

return view.extend({
	load() { return Promise.all([callStatus(), mode.read()]); },

	render([status, preferred]) {
		let target = null;
		const current = E('span');
		const heading = E('span', {}, _('读取中…'));
		const tables = E('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 21rem), 1fr)); gap: 1rem; align-items: start' });
		const cells = E('div', { id: 'a6-neighbours' }, _('读取中…'));
		const paint = () => {
			current.textContent = common.ratText(status?.rat);
			tables.replaceChildren(...Object.keys(bands).map(kind => bandTable(kind, target, status?.band)));
		};
		callBands().catch(() => ({})).then(result => {
			target = result?.target;
			heading.textContent = target === 'EU25' ? _('EU25 扩展频段') : target === 'FACTORY' ? _('原厂集合') : target || _('未知');
			paint();
		});
		callCells(false).then(r => cells.replaceChildren(neighbours(r))).catch(() => { cells.textContent = _('邻区读取失败'); });
		paint();
		poll.add(() => callStatus().then(next => {
			if (next?.band !== status?.band || next?.rat !== status?.rat) {
				status = next;
				paint();
			}
		}).catch(() => { status = {}; paint(); }), 10);

		return E('div', { 'class': 'cbi-map a6-page' }, [
			E('h2', {}, _('频段')), common.navigation('bands'),
			common.section(_('网络模式'), [
				...mode.control(preferred), common.field(_('当前接入制式'), current)
			]),
			common.section(_('频段集合'), [
				common.field(_('模组报告'), heading),
				E('details', { 'class': 'cbi-section-descr', id: 'a6-legend' }, [
					E('summary', {}, _('图标说明')),
					...Object.keys(carriers).flatMap(k => [E('span', {}, [icon(k), ' ', carriers[k][1]]), '　']),
					E('span', {}, ['🌐 ', _('海外部署示例')]), '　', E('span', {}, ['— ', _('暂无运营商标注')])
				]),
				tables
			], _('图标表示中国大陆已核实的频率许可、共享或地区部署。实际覆盖因地区而异。n3 已有地区重耕验证，n78 的广电标识仅指 3.3 GHz 室内共享。')),
			common.section(_('邻区测量'), cells, _('来自 AT+ECELL 的邻区列表；服务小区见概览。'))
		]);
	},
	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
