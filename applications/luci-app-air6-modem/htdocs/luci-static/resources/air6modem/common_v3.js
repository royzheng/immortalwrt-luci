'use strict';
'require baseclass';
'require ui';
'require air6modem.i18n as i18n';

/* Only scoped business layout. Theme supplies typography, controls and colors. */
const CSS_LAYOUT = `
.a6-page {min-width:0}
.a6-page .a6-card>.cbi-section-node {padding:.8em}
.a6-page .a6-card {min-width:0}
.a6-page .a6-head,.a6-page .a6-actions,.a6-page .a6-mode-row,.a6-page .a6-quick,.a6-page .a6-band-state,.a6-page .a6-msg-head {display:flex;flex-wrap:wrap;gap:.6em;align-items:center}
.a6-page .a6-head {justify-content:space-between}
.a6-page .a6-grid,.a6-page .a6-tiles,.a6-page .m5-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12em),1fr));gap:1em}
.a6-page .a6-grid-wide {display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:1em}
.a6-page .a6-grid-wide>* {min-width:0}
.a6-page .a6-strip {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12em),1fr));gap:1em;align-items:center}
.a6-page .a6-strip-main {grid-column:1 / -1;display:flex;gap:1em;align-items:center}
.a6-page .a6-strip small,.a6-page .a6-tile small,.a6-page .m5-metric small {display:block}
.a6-page .a6-kv {display:grid;grid-template-columns:auto minmax(0,1fr);gap:.5em 1em}
.a6-page .a6-kv dd {margin:0;text-align:right;overflow-wrap:anywhere}
.a6-page .a6-raw,.a6-page .m5-raw,.a6-page .a6-log {max-height:24em;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
.a6-page .a6-value,.a6-page .a6-bandline,.a6-page .a6-pills {display:flex;flex-wrap:wrap;gap:.5em;align-items:baseline}
.a6-page .a6-pill-group {display:grid;grid-template-columns:3em minmax(0,1fr);gap:.5em;margin:.5em 0}
.a6-page .a6-pill {display:inline-block;padding:.2em .4em;border:1px solid currentColor}
.a6-page .a6-pill-ext {border-style:dashed}
.a6-page .a6-pill-cur {font-weight:bold;text-decoration:underline}
.a6-page .a6-neighbour {display:flex;flex-wrap:wrap;gap:1em}
.a6-page .a6-ring {position:relative;width:7em;height:7em;flex:none}
.a6-page .a6-ring svg {width:100%;height:100%;transform:rotate(-90deg)}
.a6-page .a6-ring-track,.a6-page .a6-ring-fill {fill:none;stroke:currentColor;stroke-width:8}
.a6-page .a6-ring-track {opacity:.15}
.a6-page .a6-ring-face {position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.a6-page .a6-bars {display:grid;gap:.5em;margin-top:1em}
.a6-page .a6-bar-row {display:grid;grid-template-columns:3em minmax(0,1fr) 7em;gap:.5em;align-items:center}
.a6-page .a6-bar-track {height:.5em;border:1px solid currentColor}
.a6-page .a6-bar-fill {height:100%;width:0;background:currentColor}
.a6-page .a6-form-row,.a6-page .m5-form {display:grid;grid-template-columns:7em minmax(0,1fr);gap:.6em;align-items:center}
.a6-page .a6-form-row input,.a6-page .a6-form-row textarea {max-width:100%;min-width:0}
.a6-page .a6-term {display:flex;flex-wrap:wrap;gap:.6em}
.a6-page .a6-term input {flex:1;min-width:10em}
.a6-page .a6-msg-body {white-space:pre-wrap;overflow-wrap:anywhere}
.a6-page .a6-msg {margin-bottom:1em}
.a6-page .a6-table-wrap {overflow-x:auto}
.a6-page .cbi-tabmenu {display:flex;flex-wrap:wrap}
@media(max-width:700px){.a6-page .a6-grid,.a6-page .a6-grid-wide,.a6-page .a6-form-row,.a6-page .m5-form{grid-template-columns:minmax(0,1fr)}}
`;
const CSS_COMPONENTS = '';

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
	style() { return E('style', {}, CSS_LAYOUT + CSS_COMPONENTS); },
	/* 旧页面还在调用 extraStyle()，保留空实现避免报错。 */
	extraStyle() { return E('style', {}, ''); },

	callError(title, err) {
		ui.addNotification(title, E('p', {}, err?.message || String(err)), 'error');
	},
	resultText(result) {
		return result?.output || result?.error || _('No response');
	},
	/* 旧页面用的两个构造器，换成新外观 */
	panel(title, body) {
		return E('section', { 'class': 'cbi-section m5-panel' }, [ E('h3', {}, title), body ]);
	},
	metric(label, value, id) {
		return E('div', { 'class': 'm5-metric' }, [
			E('small', {}, label),
			E('strong', id ? { id } : {}, value || '-')
		]);
	},

	/* 新组件 */
	card(title, body, cls) {
		return E('section', { 'class': 'cbi-section a6-card' + (cls ? ' ' + cls : '') },
			title ? [ E('h3', {}, title), E('div', { 'class': 'cbi-section-node' }, body) ] : [ E('div', { 'class': 'cbi-section-node' }, body) ]);
	},
	tile(label, value, unit, id) {
		return E('div', { 'class': 'a6-tile' }, [
			E('small', {}, label),
			E('div', { 'class': 'a6-value' }, [
				E('b', id ? { id } : {}, value == null || value === '' ? '-' : value),
				unit ? E('span', { 'class': 'a6-unit' }, unit) : ''
			])
		]);
	},
	badge(rat) {
		let text = String(rat || '').toUpperCase(), cls = 'a6-badge-mut';
		if (text.indexOf('5G') >= 0 || text.indexOf('NR') >= 0)
			cls = 'a6-badge-5g';
		else if (text.indexOf('LTE') >= 0 || text.indexOf('4G') >= 0)
			cls = 'a6-badge-lte';
		else if (!text || text === 'UNKNOWN')
			cls = 'a6-badge-off';
		let label = cls === 'a6-badge-5g' ? '5G' : cls === 'a6-badge-lte' ? '4G' : _('无服务');
		return E('span', { 'class': 'a6-badge ' + cls }, label);
	},
	kv(pairs) {
		let body = [];
		for (let i = 0; i < pairs.length; i++) {
			body.push(E('dt', {}, pairs[i][0]));
			let value = pairs[i][1];
			body.push(E('dd', {}, (value == null || value === '') ? '-' : value));
		}
		return E('dl', { 'class': 'a6-kv' }, body);
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
		if (s === 'LTE') return 'LTE（4G）';
		if (s === 'NR5G' || s === 'NR') return '5G NR';
		return s || '-';
	},

	/* RSRP -> 0..100，用于圆环 */
	signalPercent(rsrp) {
		let v = num(rsrp);
		if (v == null) return 0;
		return Math.max(0, Math.min(100, Math.round((v + 140) / 90 * 100)));
	},
	signalQuality(rsrp) {
		let v = num(rsrp);
		if (v == null) return { cls: '', text: _('未知') };
		if (v >= -85) return { cls: 'a6-quality-good', text: _('优') };
		if (v >= -100) return { cls: 'a6-quality-mid', text: _('良') };
		return { cls: 'a6-quality-poor', text: _('弱') };
	},
	valueQuality(value, good, mid) {
		let v = num(value);
		if (v == null) return '';
		return v >= good ? 'a6-quality-good' : v >= mid ? 'a6-quality-mid' : 'a6-quality-poor';
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
