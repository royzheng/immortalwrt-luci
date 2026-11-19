'use strict';
'require view';
'require rpc';
'require ui';
'require air6modem.common_v3 as common';

/* 频段：网络模式 + 频段集合 */

const callStatus = rpc.declare({ object: 'luci.air6modem', method: 'get_status', expect: {} });
const runAt = rpc.declare({ object: 'luci.air6modem', method: 'run_at', params: [ 'command' ] });
const setRat = rpc.declare({ object: 'luci.air6modem', method: 'set_rat', params: [ 'mode' ] });
const callCells = rpc.declare({ object: 'luci.air6modem', method: 'get_cells', expect: {} });

const LTE_FACTORY = [ 1, 8, 41, 42 ];
const LTE_FULL = [ 1, 3, 5, 7, 8, 20, 28, 38, 40, 41, 42, 43 ];
const NR_FACTORY = [ 3, 28, 77, 79 ];
const NR_FULL = [ 1, 3, 5, 7, 8, 20, 28, 38, 40, 41, 77, 78, 79 ];

const RAT_MODES = [ [ 21, '自动' ], [ 19, '4G + 5G' ], [ 15, '仅 5G' ] ];

let licState = { target: '', license: '' };
let currentBand = '';

function pill(kind, band, on, extended, cur, onChange) {
	let cls = 'a6-pill' + (on ? ' a6-pill-on' : '') + (extended ? ' a6-pill-ext' : '') + (cur ? ' a6-pill-cur' : '');
	let node = E('span', {
		'class': cls,
		title: (kind == 'LTE' ? 'B' : 'n') + band + (extended ? _('（扩展频段）') : _('（原厂频段）'))
	}, (kind == 'LTE' ? 'B' : 'n') + band + (cur ? _(' · 当前') : on ? _(' · 可用') : _(' · 未启用')));
	return node;
}

function bandGroup(kind, full, factory, unlocked, cur, onChange) {
	let curNum = String(cur || '').toUpperCase().replace(/^B|^N/, '');
	return E('div', { 'class': 'a6-pill-group' }, [
		E('span', { 'class': 'a6-pill-label' }, kind),
		E('div', { 'class': 'a6-pills' }, full.map(b => pill(kind, b, !factory.includes(b) ? unlocked : true,
			factory.indexOf(b) < 0, String(b) == curNum, onChange)))
	]);
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
		rsrq: scaled(e[7], 255, -0.1),
		sinr: scaled(e[11], 255, 0.1),
		arfcn: e[14]
	}));
}

return view.extend({
	load() { return callStatus(); },

	render(data) {
		let page = E('div', { 'class': 'a6-page' }, [
			common.style(),
			E('div', { 'class': 'a6-head' }, [
				E('h2', { 'class': 'a6-title' }, [ _('频段与解锁') ])
			]),
			common.navigation('bands'),

			common.card(_('网络模式'), E('div', {}, [
				E('div', { 'class': 'a6-mode-row' }, RAT_MODES.map(m => E('button', {
					'class': 'cbi-button', 'data-mode': m[0],
					click: ui.createHandlerFn(this, 'handleRat', m[0])
				}, m[1]))),
				E('p', { 'class': 'a6-note' }, _('切换后模组会重新搜网，数据会短暂中断。'))
			])),

			common.card(_('频段集合'), E('div', {}, [
				E('div', { 'class': 'a6-band-state' }, [
					E('b', { id: 'a6-band-set' }, '…'),
					]),
				E('div', { id: 'a6-bands' }),
				E('p', { 'class': 'a6-note', id: 'a6-band-note' }, _('读取中…'))
			])),

			common.card(_('邻区测量'), E('div', {}, [
				E('div', { id: 'a6-neighbours' }, E('p', { 'class': 'a6-note' }, _('读取中…'))),
				E('p', { 'class': 'a6-note' }, _('来自 AT+ECELL 的邻区列表；服务小区见概览。'))
			]))
		]);

		currentBand = data.band || '';
		window.setTimeout(() => { this.refresh(); this.refreshNeighbours(); }, 0);
		return page;
	},

	refreshNeighbours() {
		let box = document.getElementById('a6-neighbours');
		if (!box)
			return;
		return callCells().then(c => {
			let list = parseNeighbours(c?.serving?.output);
			while (box.firstChild) box.removeChild(box.firstChild);
			if (!list.length) {
				box.appendChild(E('p', { 'class': 'a6-note' }, _('暂无邻区测量数据')));
				return;
			}
			list.forEach((n, i) => {
				box.appendChild(E('div', { 'class': 'a6-neighbour' }, [
					E('b', {}, _('邻区 %s').format(i + 1)),
					E('span', {}, 'PCI ' + (n.pci || '-')),
					E('span', {}, 'RSRP ' + (n.rsrp != null ? n.rsrp + ' dBm' : '-')),
					E('span', {}, 'RSRQ ' + (n.rsrq != null ? n.rsrq + ' dB' : '-')),
					E('span', {}, 'SINR ' + (n.sinr != null ? n.sinr + ' dB' : '-')),
					E('span', {}, 'ARFCN ' + (n.arfcn || '-'))
				]));
			});
		}).catch(() => {
			while (box.firstChild) box.removeChild(box.firstChild);
			box.appendChild(E('p', { 'class': 'a6-note' }, _('邻区读取失败')));
		});
	},

	handleRat(mode) {
		if (this.actionPending) return Promise.resolve();
		this.actionPending = true;
		return setRat(mode).then(r => {
			let ok = r && (r.code === 0 || /success/i.test(r.output || ''));
			ui.addNotification(null, E('p', {}, ok ? _('网络模式已切换，正在重新搜网…') : _('切换失败：') + common.resultText(r)),
				ok ? 'info' : 'danger');
			return this.refresh();
		}).catch(e => common.callError(_('网络模式'), e)).finally(() => { this.actionPending = false; });
	},

	refresh() {
		let node = document.getElementById('a6-band-set');
		return Promise.all([ callStatus(), runAt('AT+AIR6BAND?') ]).then(([ st, r ]) => {
			let text = r?.output || '';
			let tm = /TARGET=([A-Z0-9_]+)/.exec(text);
			let lm = /LICENSE=([A-Z]+)/.exec(text);
			licState.target = tm ? tm[1] : '';
			licState.license = lm ? lm[1] : '';
			currentBand = st?.band || currentBand;
			this.paintBands();
		}).catch(() => this.paintBands());
	},

	paintBands() {
		let unlocked = licState.target && licState.target !== 'FACTORY';
		let node = document.getElementById('a6-band-set');
		if (node) {
			node.textContent = unlocked ? _('EU25 扩展频段') : (licState.target ? _('原厂集合') : _('未知'));
			node.style.color = '';
		}
		let box = document.getElementById('a6-bands');
		if (!box) return;
		while (box.firstChild) box.removeChild(box.firstChild);
		box.appendChild(bandGroup('LTE', LTE_FULL, LTE_FACTORY, unlocked, currentBand, () => this.refresh()));
		box.appendChild(bandGroup('NR', NR_FULL, NR_FACTORY, unlocked, currentBand, () => this.refresh()));
		let note = document.getElementById('a6-band-note');
		if (note) note.textContent = unlocked
			? _('全频段集合（EU25）可用。')
			: _('当前为原厂频段集合；虚线边框为扩展频段，文字标明可用状态。');
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
