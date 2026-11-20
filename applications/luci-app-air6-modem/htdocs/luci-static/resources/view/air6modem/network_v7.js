'use strict';
'require view';
'require rpc';
'require ui';
'require air6modem.common_v4 as common';
'require air6modem.mode as mode';

const getNetwork = rpc.declare({ object: 'luci.air6modem', method: 'get_network', expect: {} });
const setRadio = rpc.declare({ object: 'luci.air6modem', method: 'set_radio', params: [ 'enabled' ] });
const ifup = rpc.declare({ object: 'luci.air6modem', method: 'ifup' });
const ifdown = rpc.declare({ object: 'luci.air6modem', method: 'ifdown' });

function parse(data) {
	let status = {};
	try { status = JSON.parse(data?.status || '{}'); } catch (e) {}
	let config = data?.config || '';
	let value = key => {
		let m = config.match(new RegExp(`network\\.[A-Za-z0-9_]+\\.${key}='([^']*)'`));
		return m ? m[1] : '-';
	};
	return {
		status,
		config,
		value,
		up: typeof status.up === 'boolean' ? status.up : null,
		pending: status.pending === true,
		radio: /\bMIPC_NW_RADIO_STATE_ON\b/.test(data?.radio) ? true
			: /\bMIPC_NW_RADIO_STATE_OFF\b/.test(data?.radio) ? false : null,
		iface: status.l3_device || '-',
		address: status['ipv4-address']?.[0]?.address || '-',
		gateway: status.route?.find(r => r.mask == 0)?.nexthop || '-',
		dns: (status['dns-server'] || []).join(' / ') || '-',
		uptime: +status.uptime || 0,
		proto: status.proto || '-',
		apn: data?.apn || status.data?.nw_apn || value('apn')
	};
}

function ipType(value) {
	return ({ '1': 'IPv4', '2': 'IPv6', '3': 'IPv4v6' })[value] || (value && value !== '-' ? value : '-');
}

function connectionText(n) {
	if (n.pending) return _('连接中…');
	if (n.up == null) return _('未读取到');
	return n.up ? _('已连接') : _('未连接');
}

function stateView(data, n) {
	return common.statusTable([
		[ _('连接状态'), connectionText(n) ], [ _('数据接口'), n.iface ],
		[ 'IPv4', n.address ], [ _('网关'), n.gateway ], [ 'DNS', n.dns ],
		[ _('在线时长'), n.up ? common.formatUptime(n.uptime) : '–' ], [ _('协议'), n.proto ],
		[ 'APN', n.apn ], [ _('IP 类型'), ipType(n.value('iptype')) ],
		[ _('认证方式'), n.value('auth') === '-' ? _('无') : n.value('auth') ], [ 'MTU', n.value('mtu') ],
		[ _('当前接入制式'), common.ratText(data.rat) ]
	]);
}

function engineering(data) {
	return [data?.status, data?.config].map(value => common.raw(value || '–'));
}

return view.extend({
	async load() {
		// Both mode and radio queries use the same modem control channel.
		const data = await getNetwork();
		return [data, await mode.read()];
	},

	render([data, preferred]) {
		let n = parse(data), busy = false;
		const state = E('div', { id: 'a6-net-state' }, stateView(data, n));
		const raw = E('div', { id: 'a6-net-eng' }, engineering(data));
		const output = common.raw(_('（尚未执行操作）'), 'a6-net-result');
		const link = E('strong', { id: 'a6-link-state', role: 'status' });
		const radio = E('strong', { id: 'a6-radio-state', role: 'status' });

		function button(label, action, key, target) {
			return E('button', { type: 'button', 'class': 'cbi-button', click: () => run(action, key, target) }, label);
		}
		const up = button(_('连接'), ifup, 'up', true);
		const down = button(_('断开连接'), ifdown, 'up', false);
		const on = button(_('开启射频'), () => setRadio(true), 'radio', true);
		const off = button(_('关闭射频'), () => setRadio(false), 'radio', false);
		const refresh = button(_('刷新状态'));
		function update() {
			link.textContent = connectionText(n);
			radio.textContent = n.radio == null ? _('未读取到') : n.radio ? _('射频已开启') : _('射频已关闭');
			up.textContent = n.up === true ? _('重新拨号') : _('连接');
			up.disabled = busy || n.pending || n.radio === false;
			down.disabled = busy || (n.up === false && !n.pending);
			on.disabled = busy || n.radio === true;
			off.disabled = busy || n.radio === false;
			refresh.disabled = busy;
		}
		async function readState() {
			const fresh = await getNetwork();
			n = parse(fresh);
			state.replaceChildren(stateView(fresh, n));
			raw.replaceChildren(...engineering(fresh));
			update();
		}
		async function run(action, key, target) {
			if (busy) return;
			busy = true;
			update();
			try {
				if (action) {
					const r = await action();
					if (r?.code !== 0 || /fail|error/i.test(r?.output || ''))
						throw new Error(common.resultText(r));
					output.textContent = r.output || _('操作已提交');
				}
				await readState();
				if (action && (n[key] !== target || (key === 'up' && n.pending))) {
					await new Promise(resolve => setTimeout(resolve, 1500));
					await readState();
					if (n[key] !== target || (key === 'up' && n.pending))
						output.textContent = _('操作已提交，请稍后刷新状态。');
				}
			}
			catch (e) {
				output.textContent = e.message || String(e);
				common.callError(_('连接操作'), e);
				if (action) {
					try { await readState(); }
					catch (_) { n = parse({}); }
				}
				else n = parse({});
				if (n.up == null && n.radio == null) {
					state.replaceChildren(stateView({}, n));
					raw.replaceChildren();
				}
			}
			finally { busy = false; update(); }
		}
		update();
		const settings = [
			_('修改 APN、IP 类型、认证、MTU 和重试次数：'), ' ',
			E('a', { href: L.url('admin', 'network', 'network') }, _('网络 → 接口'))
		];
		return E('div', { 'class': 'cbi-map a6-page' }, [
			E('h2', {}, _('拨号与网络')), common.navigation('network'),
			common.section(_('连接状态'), state, settings),
			common.section(_('连接操作'), [
				common.field(_('蜂窝连接'), common.actions([link, up, down])),
				common.field(_('射频'), common.actions([radio, on, off]),
					null, _('关闭射频会立即断开蜂窝连接。')),
				common.field(_('状态读取'), common.actions([refresh]))
			]),
			common.section(_('首选网络制式'), mode.control(preferred)),
			common.section(_('操作结果'), output),
			common.section(_('工程信息'), E('details', {}, [
				E('summary', {}, _('查看接口状态与配置原文')),
				raw
			]))
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
