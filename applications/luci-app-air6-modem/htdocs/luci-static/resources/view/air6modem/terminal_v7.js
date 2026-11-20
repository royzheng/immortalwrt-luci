'use strict';
'require view';
'require rpc';
'require ui';
'require air6modem.common_v4 as common';

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
		if (!box) {
			const container = document.getElementById('a6-at-output');
			if (!container) return;
			box = common.raw('', 'a6-at-log');
			box.setAttribute('role', 'log');
			container.appendChild(box);
			document.getElementById('a6-at-ready')?.closest('.cbi-section-descr')?.remove();
		}
		let frag = document.createDocumentFragment();
		for (let line of lines) {
			if (!line.text) { frag.appendChild(document.createTextNode('\n')); continue; }
			let span = E('span', { 'class': line.cls || '' }, [line.text]);
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
		const output = E('div', { id: 'a6-at-output' });
		const ready = E('span', { id: 'a6-at-ready' }, _('就绪，输入命令或点上面的快捷按钮。'));
		const command = common.wideInput('a6-at-command', 'AT+CESQ', { placeholder: 'AT+...', maxlength: 512 });
		command.style.width = '100%';
		const input = command.querySelector('input');
		input.setAttribute('aria-describedby', 'a6-at-warning');
		input.addEventListener('keydown', ev => { if (ev.key === 'Enter') this.handleRun(); });
		const warning = E('span', { id: 'a6-at-warning', 'class': 'error' },
			_('部分 AT 命令会更改模组状态，可能中断注册、通话或数据业务。仅支持 AT 指令。'));
		return E('div', { 'class': 'cbi-map a6-page' }, [
			E('h2', {}, _('AT 终端')), common.navigation('terminal'),
			common.section(_('发送命令'), [
				common.field(_('AT 命令'), common.actions([
					command, E('button', { 'class': 'cbi-button cbi-button-action', click: ui.createHandlerFn(this, 'handleRun') }, _('执行'))
				]), 'a6-at-command', warning),
				common.field(_('快捷命令'), common.actions(QUICK.map(item => E('button', {
					'class': 'cbi-button', 'data-cmd': item[0], title: item[0],
					click: ui.createHandlerFn(this, 'handleQuick')
				}, item[1]))))
			]),
			common.section(_('输出'), output, ready)
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
