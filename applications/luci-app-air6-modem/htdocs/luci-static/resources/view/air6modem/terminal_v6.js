'use strict';
'require view';
'require rpc';
'require ui';
'require air6modem.common_v3 as common';

const runAt = rpc.declare({ object: 'luci.air6modem', method: 'run_at', params: [ 'command' ] });

const QUICK = [
	[ 'AT+CPIN?', _('SIM 状态') ],
	[ 'AT+CSQ', _('信号强度') ],
	[ 'AT+CESQ', _('信号质量') ],
	[ 'AT+CEREG?', _('注册状态') ],
	[ 'AT+COPS?', _('运营商') ],
	[ 'AT+CGSN', _('IMEI') ],
	[ 'AT+CCID', _('ICCID') ],
	[ 'AT+QTEMP', _('温度') ],
	[ 'AT+ECELL', _('小区信息') ]
];


function nowText() {
	let d = new Date();
	let p = n => (n < 10 ? '0' : '') + n;
	return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

return view.extend({
	log(lines) {
		let box = document.getElementById('a6-at-log');
		if (!box) return;
		let frag = document.createDocumentFragment();
		for (let line of lines) {
			if (!line.text) { frag.appendChild(document.createTextNode('\n')); continue; }
			let span = E('span', { 'class': line.cls || '' }, line.text);
			frag.appendChild(span);
			frag.appendChild(document.createTextNode('\n'));
		}
		box.appendChild(frag);
		while (box.childNodes.length > 1000) box.removeChild(box.firstChild);
		box.scrollTop = box.scrollHeight;
	},

	run(command) {
		if (!command || this.busy) return Promise.resolve();
		this.busy = true;
		this.log([{ text: `[${nowText()}] `, cls: 'a6-log-time' }, { text: `> ${command}`, cls: 'a6-log-cmd' }]);
		return runAt(command).then(r => {
			this.log([{ text: common.resultText(r) }]);
		}).catch(e => {
			this.log([{ text: String(e?.message || e) }]);
			common.callError(_('AT 终端'), e);
		}).finally(() => { this.busy = false; });
	},

	handleRun() {
		let input = document.getElementById('a6-at-command');
		let command = (input?.value || '').trim();
		return this.run(command);
	},

	handleQuick(ev) {
		let command = ev.currentTarget.getAttribute('data-cmd');
		let input = document.getElementById('a6-at-command');
		if (input) input.value = command;
		return this.run(command);
	},

	render() {
		return E('div', { 'class': 'a6-page' }, [
			common.style(),

			E('div', { 'class': 'a6-head' }, [
				E('h2', { 'class': 'a6-title' }, [ _('AT 终端') ])
			]),
			common.navigation('terminal'),

			E('div', { 'class': 'alert-message warning' }, [
				E('span', {}, '⚠'),
				E('span', {}, _('AT 命令会直接改模组状态，可能中断注册、通话或数据业务。仅支持 AT 指令字符，不接受 shell 语法。'))
			]),

			common.card(_('发送命令'), E('div', {}, [
				E('div', { 'class': 'a6-term' }, [
					E('input', {
						id: 'a6-at-command', value: 'AT+CESQ', maxlength: 512,
						placeholder: 'AT+...', 'class': 'cbi-input-text', 'aria-label': _('AT 命令'),
						keydown: ev => { if (ev.key === 'Enter') this.handleRun(); }
					}),
					E('button', { 'class': 'cbi-button cbi-button-action', click: ui.createHandlerFn(this, 'handleRun') }, _('执行'))
				]),
				E('div', { 'class': 'a6-quick' }, QUICK.map(item => E('button', {
					'class': 'cbi-button', 'data-cmd': item[0],
					click: ui.createHandlerFn(this, 'handleQuick')
				}, item[1])))
			])),

			common.card(_('输出'), E('pre', { id: 'a6-at-log', 'class': 'a6-log' }, _('就绪，输入命令或点上面的快捷按钮。')))
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
