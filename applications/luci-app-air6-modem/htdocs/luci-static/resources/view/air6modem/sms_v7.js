'use strict';
'require view';
'require rpc';
'require ui';
'require air6modem.common_v4 as common';

const listSms = rpc.declare({ object: 'luci.air6modem', method: 'list_sms', expect: {} });
const getSmsc = rpc.declare({ object: 'luci.air6modem', method: 'get_smsc', expect: {} });
const sendSms = rpc.declare({ object: 'luci.air6modem', method: 'send_sms', params: [ 'number', 'text' ] });
const deleteSms = rpc.declare({ object: 'luci.air6modem', method: 'delete_sms', params: [ 'index' ] });
const setSmsc = rpc.declare({ object: 'luci.air6modem', method: 'set_smsc', params: [ 'number' ] });

/* atcid 用 UCS2 返回：每 4 个十六进制字符一个码位 */
function decodeUcs2(hex) {
	if (!hex) return '';
	if (!/^[0-9A-Fa-f]+$/.test(hex) || hex.length < 4) return hex;
	let out = '';
	for (let i = 0; i + 4 <= hex.length; i += 4)
		out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
	return out;
}

function stateText(state) {
	const map = {
		'REC UNREAD': _('未读'), 'REC READ': _('已读'),
		'STO SENT': _('已发送'), 'STO UNSENT': _('待发送'),
		'ALL': _('全部')
	};
	return map[String(state || '').toUpperCase()] || state || '-';
}

/* +CMGL: <idx>,"<stat>","<sender>","<alpha>","<time>" \r\n <UCS2 hex> */
function parseMessages(raw) {
	const re = /\+CMGL:\s*(\d+),"([^"]*)","([^"]*)","[^"]*","([^"]*)"\s*\r?\n([0-9A-Fa-f]+)/g;
	const records = [];
	let m;
	while ((m = re.exec(raw || '')) !== null) {
		let hex = m[5];
		let part8 = hex.match(/^050003([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})/i);
		let part16 = hex.match(/^060804([0-9A-F]{4})([0-9A-F]{2})([0-9A-F]{2})/i);
		let part = part16 || part8;
		let rec = {
			index: +m[1], state: m[2], sender: m[3], time: m[4],
			text: '', ref: '', total: 1, part: 1
		};
		if (part) {
			rec.ref = part[1].toUpperCase();
			rec.total = parseInt(part[2], 16);
			rec.part = parseInt(part[3], 16);
			hex = hex.slice(part16 ? 14 : 12);
		}
		rec.text = decodeUcs2(hex);
		records.push(rec);
	}
	return records;
}

/* 把同一条长短信的多个分片拼起来 */
function groupMessages(records) {
	const groups = {};
	for (let rec of records) {
		let key = rec.ref ? `${rec.sender}|${rec.time}|${rec.ref}` : `idx:${rec.index}`;
		(groups[key] = groups[key] || []).push(rec);
	}
	return Object.values(groups).map(parts => {
		parts.sort((a, b) => a.part - b.part);
		let first = parts[0];
		return {
			indexes: parts.map(p => p.index).join(', '),
			state: first.state,
			sender: first.sender,
			time: first.time,
			text: parts.map(p => p.text).join(''),
			incomplete: first.total > parts.length ? `${parts.length}/${first.total}` : ''
		};
	}).sort((a, b) => +b.indexes.split(',')[0] - +a.indexes.split(',')[0]);
}


function messageList(data) {
	let messages = groupMessages(parseMessages(data?.output || ''));
	if (!messages.length)
		return E('p', { 'class': 'cbi-section-descr' }, _('暂无短信（或当前 SIM 没有存储的消息）'));

	return common.table([_('序号'), _('发送方'), _('状态'), _('时间'), _('内容')], messages.map(msg => [
		msg.indexes, msg.sender || _('未知号码'), stateText(msg.state), msg.time,
		E('div', {}, [msg.text, msg.incomplete ? ' (' + _('不完整 %s').format(msg.incomplete) + ')' : ''])
	]), _('收件箱'));
}

function smscOf(result) {
	let m = common.resultText(result).match(/\+CSCA:\s*"([^"]+)"/);
	return m ? m[1] : '';
}

return view.extend({
	load() {
		return listSms().then(list => getSmsc().then(smsc => [ list, smsc ]));
	},

	refresh() {
		return listSms().then(list => {
			let box = document.getElementById('a6-sms-list');
			if (box) box.replaceChildren(messageList(list));
		});
	},

	showResult(r) {
		let out = document.getElementById('a6-sms-result');
		if (out) out.textContent = common.resultText(r);
	},

	handleRefresh() {
		return this.refresh().then(() => ui.addTimeLimitedNotification(null, E('p', {}, _('短信已刷新')), 3500, 'info'));
	},

	handleSend() {
		let number = document.getElementById('a6-sms-number').value.trim();
		let text = document.getElementById('a6-sms-text').value;
		return sendSms(number, text).then(r => {
			this.showResult(r);
			if (r.code) throw new Error(common.resultText(r));
			ui.addTimeLimitedNotification(null, E('p', {}, _('短信已提交给模组')), 3500, 'info');
		}).catch(e => common.callError(_('发送短信'), e));
	},

	handleDelete() {
		let index = +document.getElementById('a6-sms-index').value;
		return deleteSms(index).then(r => { this.showResult(r); return this.refresh(); })
			.catch(e => common.callError(_('删除短信'), e));
	},

	handleSetSmsc() {
		let number = document.getElementById('a6-smsc').value.trim();
		return setSmsc(number).then(r => this.showResult(r))
			.catch(e => common.callError(_('设置短信中心'), e));
	},

	render(result) {
		let list = result[0] || {}, smsc = result[1] || {};

		const number = common.wideInput('a6-sms-number', '', { placeholder: '+8613800138000' });
		number.querySelector('input').type = 'tel';
		const body = new ui.Textarea('', { rows: 2, wrap: true, placeholder: _('最多 160 个 GSM/ASCII 字符') }).render();
		const textarea = body.querySelector('textarea');
		textarea.id = 'a6-sms-text';
		textarea.maxLength = 160;
		textarea.style.minHeight = '0';
		const action = (title, handler, primary) => E('button', {
			'class': primary ? 'cbi-button cbi-button-action' : 'cbi-button', click: ui.createHandlerFn(this, handler)
		}, title);
		return E('div', { 'class': 'cbi-map a6-page' }, [
			E('h2', {}, _('短信')), common.navigation('sms'),
			common.section(_('收件箱'), [
				E('div', { id: 'a6-sms-list' }, messageList(list)),
				common.field(_('操作'), common.actions([action(_('刷新'), 'handleRefresh')]))
			]),
			common.section(_('发送短信'), [
				common.field(_('接收号码'), number, 'a6-sms-number'),
				common.field(_('内容'), body, 'a6-sms-text', _('通过厂商 libqlril 的短信接口提交；中文短信暂不支持，请用 ASCII。')),
				common.field(_('操作'), common.actions([action(_('发送'), 'handleSend', true)]))
			]),
			common.section(_('删除与短信中心'), [
				common.field(_('消息序号'), common.actions([
					E('input', { 'class': 'cbi-input-text', id: 'a6-sms-index', type: 'number', min: 0 }),
					action(_('删除'), 'handleDelete')
				]), 'a6-sms-index'),
				common.field(_('短信中心'), common.actions([
					E('input', { 'class': 'cbi-input-text', id: 'a6-smsc', value: smscOf(smsc) }),
					action(_('设置'), 'handleSetSmsc')
				]), 'a6-smsc')
			]),
			common.section(_('操作结果'), common.raw(_('（尚未执行操作）'), 'a6-sms-result'))
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});

