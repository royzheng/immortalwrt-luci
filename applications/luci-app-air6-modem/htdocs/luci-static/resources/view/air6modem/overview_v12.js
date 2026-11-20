'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require air6modem.common_v4 as common';

const callStatus = rpc.declare({ object: 'luci.air6modem', method: 'get_status', expect: {} });
const callCells = rpc.declare({ object: 'luci.air6modem', method: 'get_cells', params: ['engineering'], expect: {} });
const callDevices = rpc.declare({ object: 'luci-rpc', method: 'getNetworkDevices', expect: { '': {} } });
const ifup = rpc.declare({ object: 'luci.air6modem', method: 'ifup' });
const ifdown = rpc.declare({ object: 'luci.air6modem', method: 'ifdown' });

let lastSample = null;
let trafficDevice = null;

function netValue(n, key) {
	let a = n?.[key];
	return Array.isArray(a) ? a.map(x => x.address ? `${x.address}/${x.mask}` : String(x)).join(' ') : '';
}

function bar(id) {
	return E('div', {}, [
		E('progress', { id: id + '-bar', max: 100, value: 0, 'aria-hidden': 'true' }),
		' ', E('span', { id: id + '-val' }, '0.0 Mbps')
	]);
}

function barPercent(bps) {
	let mbps = Math.max(0, bps || 0) * 8 / 1000000;
	return Math.min(100, Math.log1p(mbps) / Math.log1p(1000) * 100);
}

function updateTraffic(devices) {
	let stat = devices?.[trafficDevice]?.stats;
	let now = Date.now() / 1000, rx = +stat?.rx_bytes, tx = +stat?.tx_bytes;
	if (!Number.isFinite(rx) || !Number.isFinite(tx)) return;
	let down = 0, up = 0;
	if (lastSample && now > lastSample.time) {
		down = Math.max(0, (rx - lastSample.rx) / (now - lastSample.time));
		up = Math.max(0, (tx - lastSample.tx) / (now - lastSample.time));
	}
	lastSample = { time: now, rx, tx };
	for (let item of [ [ 'a6-down', down ], [ 'a6-up', up ] ]) {
		let fill = document.getElementById(`${item[0]}-bar`);
		let val = document.getElementById(`${item[0]}-val`);
		if (fill) fill.value = barPercent(item[1]);
		if (val) val.textContent = common.formatRate(item[1]);
	}
}

function setText(id, value) {
	let el = document.getElementById(id);
	if (el) el.textContent = (value == null || value === '') ? '-' : '' + value;
}

function signalOf(data, key) {
	let m = String(data.cesq || '').match(new RegExp(`${key}=(-?[0-9.]+)`));
	return m ? m[1] : '';
}

function dnsList(network) {
	return (network?.['dns-server'] || []).slice(0, 2).join(' / ');
}

function gateway(network) {
	let route = (network?.route || []).find(r => r.target == '0.0.0.0');
	return route?.nexthop || '';
}

function applyStatus(data) {
	if (!data) return;

	let m = String(data.signal || '').match(/RSRP=(-?[0-9.]+)/);
	let rsrp = m ? m[1] : signalOf(data, 'RSRP');
	setText('a6-summary-rsrp', rsrp ? rsrp + ' dBm · ' + common.signalQuality(rsrp) : '–');
	setText('a6-op', common.operatorName(data.operator) || data.operator || (data.initializing ? _('等待模组就绪…') : '–'));
	setText('a6-rat', common.ratText(data.rat));
	setText('a6-reg', common.registrationText(data.registration));
	setText('a6-live-note', data.available === false ? data.error : data.initializing ? _('等待模组就绪…')
		: _('实时刷新 · %s 秒前').format(data.cache_age ?? '-'));

	for (const [key, unit] of [['RSRQ', 'dB'], ['SINR', 'dB']]) {
		const value = signalOf(data, key);
		setText('a6-' + key.toLowerCase(), value ? value + ' ' + unit : '');
	}

	let n = data.network || {};
	setText('a6-conn', n.up == null ? '–' : n.up ? _('已连接') : _('未连接'));
	setText('a6-apn', data.apn || '-');
	setText('a6-ipv4', netValue(n, 'ipv4-address'));
	setText('a6-gw', gateway(n));
	setText('a6-dns', dnsList(n));
	setText('a6-uptime', n.up ? common.formatUptime(n.uptime) : '');
	setText('a6-iface', n.l3_device);

	setText('a6-band2', data.band);
	setText('a6-pci', data.pci);
	setText('a6-arfcn', data.arfcn);
	setText('a6-tac', data.tac);
	setText('a6-cellid', data.cellid);

	setText('a6-imei', data.imei);
	setText('a6-imsi', data.imsi);
	setText('a6-iccid', data.iccid);
	setText('a6-sim-state', common.simText(data.sim));
	setText('a6-temp', data.temperature ? `${data.temperature} °C` : '-');

	let next = n.l3_device || null;
	if (next !== trafficDevice) { trafficDevice = next; lastSample = null; }
}

function datum(id) {
	return E('span', { id }, '–');
}

return view.extend({
	load() { return callStatus(); },

	render(data) {
		const raw = E('div');
		let pending;
		const refreshCells = () => {
			if (!details.open) return Promise.resolve();
			if (!pending) {
				raw.textContent = _('读取中…');
				pending = callCells(true).then(c => {
					raw.replaceChildren(...[['AT+ECELL', c.serving], ['AT+EINFO?', c.engineering]].map(([command, r]) =>
						E('div', {}, [E('strong', {}, command), common.diagnosticText(common.resultText(r))])));
				}).catch(err => { raw.textContent = _('小区读取失败：') + err.message; })
					.finally(() => { pending = null; });
			}
			return pending;
		};
		const details = E('details', { toggle: refreshCells }, [
			E('summary', {}, _('查看 AT 原始返回')),
			E('div', {}, _('AT+ECELL 查询服务小区和邻区测量，AT+EINFO? 查询工程信息设置。')),
			raw
		]);

		const page = E('div', { 'class': 'cbi-map a6-page' }, [
			E('h2', {}, _('5G 模组概览')), common.navigation('overview'),
			common.section(_('模组状态'), common.statusTable([
				[ _('运营商'), datum('a6-op') ], [ _('注册状态'), datum('a6-reg') ],
				[ _('当前接入制式'), datum('a6-rat') ], [ _('信号强度') + ' (RSRP)', datum('a6-summary-rsrp') ],
				[ 'IPv4', datum('a6-ipv4') ], [ _('在线时长'), datum('a6-uptime') ],
				[ _('模组温度'), datum('a6-temp') ], [ 'APN', datum('a6-apn') ]
			])),
			common.section(_('信号与速率'), [
				common.statusTable([
					['RSRQ', datum('a6-rsrq')], ['SINR', datum('a6-sinr')],
					[_('下行'), bar('a6-down')], [_('上行'), bar('a6-up')]
				])
			]),
			common.section(_('拨号与网络'), [
				common.statusTable([
					[ _('连接状态'), datum('a6-conn') ], [ _('数据接口'), datum('a6-iface') ],
					[ _('网关'), datum('a6-gw') ], [ 'DNS', datum('a6-dns') ]
				]),
				common.field(_('连接操作'), common.actions([
					E('button', { 'class': 'cbi-button cbi-button-action', click: ui.createHandlerFn(this, 'handleReconnect') }, _('重新拨号')),
					E('button', { 'class': 'cbi-button', click: ui.createHandlerFn(this, async () => {
						applyStatus(await callStatus());
						await refreshCells();
						ui.addNotification(null, E('p', {}, _('状态已刷新')));
					}) }, _('刷新状态'))
				]), null, datum('a6-live-note'))
			]),
			common.section(_('小区信息'), common.statusTable([
				[ _('频段'), datum('a6-band2') ], [ 'PCI', datum('a6-pci') ], [ 'ARFCN', datum('a6-arfcn') ],
				[ 'TAC', datum('a6-tac') ], [ _('小区 ID'), datum('a6-cellid') ]
			])),
			common.section(_('模组与 SIM'), common.statusTable([
				[ 'IMEI', datum('a6-imei') ], [ 'IMSI', datum('a6-imsi') ], [ 'ICCID', datum('a6-iccid') ],
				[ _('SIM 状态'), datum('a6-sim-state') ]
			])),
			common.section(_('工程诊断'), null, details),
			E('div', { id: 'a6-poll-error', role: 'status' })
		]);

		trafficDevice = data.network?.l3_device || null;
		lastSample = null;
		poll.add(() => callStatus().then(d => {
			applyStatus(d);
			document.getElementById('a6-poll-error').textContent = '';
		}).catch(e => setText('a6-poll-error', _('状态读取失败：') + e.message)), 10);
		poll.add(() => callDevices().then(updateTraffic).catch(e => setText('a6-poll-error', _('流量读取失败：') + e.message)), 3);
		poll.add(refreshCells, 60);
		requestAnimationFrame(() => applyStatus(data));
		return page;
	},

	handleReconnect() {
		if (this.actionPending) return Promise.resolve();
		this.actionPending = true;
		return ifdown().then(() => ifup()).then(() => {
			ui.addNotification(null, E('p', {}, _('已重新拨号')), 'info');
			return callStatus().then(applyStatus);
		}).catch(e => common.callError(_('重新拨号'), e)).finally(() => { this.actionPending = false; });
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
