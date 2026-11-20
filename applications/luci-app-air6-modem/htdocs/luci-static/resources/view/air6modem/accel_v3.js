'use strict';
'require view';
'require rpc';
'require poll';
'require air6modem.common_v4 as common';

/* 加速统计：HNAT PPE 绑定计数 + 各接口流量。 */

const callStats = rpc.declare({
	object: 'luci.air6modem',
	method: 'get_accel_stats',
	expect: { '': {} }
});

let lastSample = null;

function fmtBytes(value) {
	let n = +value || 0;
	let units = [ 'B', 'KiB', 'MiB', 'GiB', 'TiB' ];
	let i = 0;
	while (n >= 1024 && i < units.length - 1) {
		n /= 1024;
		i++;
	}
	return (i ? n.toFixed(1) : n) + ' ' + units[i];
}

function fmtCount(value) {
	let n = +value || 0;
	return n.toLocaleString('en-US');
}

function rates(interfaces) {
	let now = Date.now() / 1000;
	let out = {};
	for (let it of interfaces)
		out[it.name] = { rx: +it.rx_bytes || 0, tx: +it.tx_bytes || 0 };

	let delta = {};
	if (lastSample && now > lastSample.time) {
		let dt = now - lastSample.time;
		for (let name in out) {
			let prev = lastSample.map[name];
			delta[name] = prev ? {
				rx: Math.max(0, (out[name].rx - prev.rx) / dt),
				tx: Math.max(0, (out[name].tx - prev.tx) / dt)
			} : { rx: 0, tx: 0 };
		}
	}
	lastSample = { time: now, map: out };
	return delta;
}

function update(root, data) {
	let hnat = data?.hnat || {};
	let interfaces = data?.interfaces || [];
	let delta = rates(interfaces);

	let set = (id, text, cls) => {
		let el = root.querySelector('#' + id);
		if (el) {
			el.textContent = text;
			if (cls != null)
				el.className = cls;
		}
	};

	if (hnat.available) {
		set('a6-hnat-state', '已加载', 'a6-ok');
		set('a6-ppe0', fmtCount(hnat.ppe0_bind));
		set('a6-ppe1', fmtCount(hnat.ppe1_bind));
		set('a6-injected', fmtCount(hnat.injected));
		set('a6-fallback', fmtCount(hnat.fallback));
	}
	else {
		set('a6-hnat-state', '未加载', 'a6-bad');
		set('a6-ppe0', '-');
		set('a6-ppe1', '-');
		set('a6-injected', '-');
		set('a6-fallback', '-');
	}

	let body = root.querySelector('#a6-iface-body');
	if (!body)
		return;
	body.replaceChildren();

	for (let it of interfaces.sort((a, b) => a.name.localeCompare(b.name))) {
		let d = delta[it.name] || { rx: 0, tx: 0 };
		body.appendChild(E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, E('strong', {}, [it.name])),
			E('td', { 'class': 'td' }, fmtBytes(d.rx) + '/s'),
			E('td', { 'class': 'td' }, fmtBytes(d.tx) + '/s'),
			E('td', { 'class': 'td' }, fmtBytes(it.rx_bytes)),
			E('td', { 'class': 'td' }, fmtBytes(it.tx_bytes)),
			E('td', { 'class': 'td' }, fmtCount((+it.rx_errors || 0) + (+it.tx_errors || 0)) +
				' / ' + fmtCount((+it.rx_dropped || 0) + (+it.tx_dropped || 0)))
		]));
	}
}

return view.extend({
	load() {
		return callStats();
	},

	render(data) {
		let headings = [_('接口'), _('接收速率'), _('发送速率'), _('接收总量'), _('发送总量'), _('错误 / 丢包')];
		const traffic = common.table(headings, [], _('接口流量'));
		traffic.querySelector('tbody').id = 'a6-iface-body';
		let root = E('div', { 'class': 'cbi-map a6-page', id: 'a6-accel' }, [
			E('h2', {}, _('加速统计')), common.navigation('accel'),
			common.section(_('加速状态'), common.statusTable([
				['HNAT', E('span', { id: 'a6-hnat-state' })], [_('PPE0 绑定条目'), E('span', { id: 'a6-ppe0' })],
				[_('PPE1 绑定条目'), E('span', { id: 'a6-ppe1' })], [_('CPU→Wi-Fi 注入'), E('span', { id: 'a6-injected' })],
				[_('注入回退'), E('span', { id: 'a6-fallback' })]
			]), _('本轮固件默认软件转发，以兼容多 WAN、VPN 与代理策略；HNAT 模块加载不等于流量正在硬件加速。')),
			common.section(_('接口流量'), traffic),
			E('div', { id: 'a6-stats-error', role: 'status' })
		]);

		update(root, data);

		poll.add(() => callStats().then(d => { update(root, d); root.querySelector('#a6-stats-error').textContent = ''; }).catch(e => { root.querySelector('#a6-stats-error').textContent = _('统计读取失败：') + (e.message || e); }), 3);

		return root;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
