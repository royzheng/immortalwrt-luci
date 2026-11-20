'use strict';
'require baseclass';
'require ui';
'require air6modem.i18n_v2 as i18n';

function num(value) {
	let n = parseFloat(value);
	return Number.isFinite(n) ? n : null;
}

i18n.install();

return baseclass.extend({
	navigation(active) {
		const items = [['overview', _('概览')], ['bands', _('频段')], ['accel', _('加速统计')],
			['network', _('网络')], ['sms', _('短信')], ['terminal', _('AT 终端')]];
		return E('ul', { 'class': 'cbi-tabmenu', 'aria-label': _('5G 模组导航') }, items.map(([key, title]) =>
			E('li', { 'class': key === active ? 'cbi-tab' : 'cbi-tab-disabled' },
				E('a', { href: L.url('admin', 'air6modem', key), 'aria-current': key === active ? 'page' : null }, title))));
	},
	actions(items) {
		return E('div', { 'class': 'control-group', style: 'display: flex; align-items: center' }, items);
	},
	wideInput(id, value, options) {
		const widget = new ui.Textfield(value, options).render();
		const input = widget.querySelector('input');
		input.id = id;
		input.style.width = '100%';
		input.style.maxWidth = '100%';
		return widget;
	},
	callError(title, err) {
		ui.addTimeLimitedNotification(title, E('p', {}, [err?.message || String(err)]), 6500, 'error');
	},
	resultText(result) {
		return result?.output || result?.error || _('No response');
	},
	section(title, body, description) {
		const children = [ E('h3', {}, title) ];
		if (description) children.push(E('div', { 'class': 'cbi-section-descr' }, description));
		if (body) {
			const node = E('div', { 'class': 'cbi-section-node' }, body);
			if (node.lastElementChild?.querySelector(':scope > .cbi-value-field > .control-group'))
				node.style.paddingBlockEnd = '1rem';
			children.push(node);
		}
		return E('section', { 'class': 'cbi-section' }, children);
	},
	field(title, content, id, description) {
		const field = E('div', { 'class': 'cbi-value-field' }, Array.isArray(content) ? content : [content]);
		if (description) field.appendChild(E('div', { 'class': 'cbi-value-description' }, description));
		const actionRow = field.firstElementChild?.classList.contains('control-group');
		return E('div', { 'class': 'cbi-value', style: actionRow ? 'align-items: baseline' : null }, [
			id ? E('label', { 'class': 'cbi-value-title', 'for': id }, title) : E('div', { 'class': 'cbi-value-title' }, title),
			field
		]);
	},
	diagnosticText(value) {
		return E('pre', { style: 'white-space: pre-wrap; overflow-wrap: anywhere' }, [value]);
	},
	raw(value, id) {
		return E('pre', { id, 'class': 'command-output', style: 'overflow: auto; max-height: 32em' }, [value]);
	},
	statusTable(pairs) {
		return E('table', { 'class': 'table' }, E('tbody', {}, pairs.map(([label, value]) =>
			E('tr', { 'class': 'tr' }, [
				E('th', { 'class': 'td left', scope: 'row' }, [label]),
				E('td', { 'class': 'td left' }, [value == null || value === '' ? '–' : value])
			]))));
	},
	table(headings, rows, label) {
		return E('div', { 'class': 'cbi-tblsection', style: 'overflow-x: auto' }, E('table', { 'class': 'table', 'aria-label': label }, [
			E('thead', {}, E('tr', { 'class': 'tr table-titles' }, headings.map(h => E('th', { 'class': 'th', scope: 'col' }, h)))),
			E('tbody', {}, rows.map(row => E('tr', { 'class': 'tr' }, row.map(cell => E('td', { 'class': 'td' }, Array.isArray(cell) ? cell : [cell])))))
		]));
	},

	/* 运营商代码 -> 友好名称（覆盖常见的国内/日本段） */
	operatorName(code) {
		const map = {
			'46000': '中国移动', '46002': '中国移动', '46004': '中国移动', '46007': '中国移动', '46008': '中国移动',
			'46001': '中国联通', '46006': '中国联通', '46009': '中国联通',
			'46003': '中国电信', '46005': '中国电信', '46011': '中国电信',
			'46015': '中国广电', '46020': '中国铁通',
			'44010': 'NTT docomo', '44020': 'SoftBank', '44011': 'Rakuten', '44100': '日本测试网'
		};
		return map[String(code || '')] || '';
	},
	/* 采集器里的英文状态串 -> 中文 */
	registrationText(value) {
		const map = {
			'registered (home)': _('已注册（本地）'),
			'registered (roaming)': _('已注册（漫游）'),
			'searching': _('正在搜网…'),
			'registration denied': _('注册被拒'),
			'not registered': _('未注册')
		};
		return map[String(value || '')] || (value || '-');
	},
	radioText(value) {
		let s = String(value || '');
		if (s.indexOf('STATE_ON') >= 0) return _('射频已开启');
		if (s.indexOf('STATE_OFF') >= 0) return _('射频已关闭');
		return s || '-';
	},
	simText(value) {
		let s = String(value || '');
		if (s.indexOf('READY') >= 0) return _('就绪');
		if (s.indexOf('ABSENT') >= 0) return _('未检测到卡');
		if (s.indexOf('PIN') >= 0) return _('需要 PIN');
		if (s.indexOf('BLOCK') >= 0 || s.indexOf('LOCK') >= 0) return _('已锁定');
		return s || '-';
	},
	ratText(value) {
		let s = String(value || '');
		if (/RAT Mode Value:|Current:/i.test(s)) return _('未知');
		if (s === 'LTE') return 'LTE（4G）';
		if (s === 'NR5G' || s === 'NR') return '5G NR';
		return s || '-';
	},

	signalQuality(rsrp) {
		let v = num(rsrp);
		if (v == null) return _('未知');
		if (v >= -85) return _('优');
		if (v >= -100) return _('良');
		return _('弱');
	},
	formatUptime(seconds) {
		let s = Math.max(0, parseInt(seconds, 10) || 0);
		let d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
		if (d) return _('%d 天 %d 小时').format(d, h);
		if (h) return _('%d 小时 %d 分').format(h, m);
		return _('%d 分').format(m);
	},
	formatRate(bytesPerSecond) {
		let mbps = Math.max(0, bytesPerSecond || 0) * 8 / 1000000;
		return mbps >= 100 ? `${Math.round(mbps)} Mbps` : `${mbps.toFixed(1)} Mbps`;
	}
});
