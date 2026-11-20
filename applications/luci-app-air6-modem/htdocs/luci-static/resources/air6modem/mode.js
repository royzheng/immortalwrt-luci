'use strict';
'require baseclass';
'require rpc';
'require ui';
'require air6modem.common_v4 as common';

const getRat = rpc.declare({ object: 'luci.air6modem', method: 'get_rat', expect: {} });
const setRat = rpc.declare({ object: 'luci.air6modem', method: 'set_rat', params: [ 'mode' ] });

const choices = {
	21: _('3G / 4G / 5G 自动'),
	19: _('4G / 5G 自动'),
	15: _('仅 5G'),
	3: _('仅 4G')
};

function read() {
	return getRat().then(r => Number.isInteger(r?.mode) ? r.mode : null).catch(() => null);
}

return baseclass.extend({
	read,
	control(initial) {
		let current = initial, busy = false;
		const label = E('span', { id: 'a6-confirmed-mode', 'aria-live': 'polite' });
		const select = E('select', { id: 'a6-mode', 'class': 'cbi-input-select', change: update }, [
			E('option', { value: '' }, _('请选择')),
			...[21, 19, 15, 3].map(n => E('option', { value: n }, choices[n]))
		]);
		const apply = E('button', { type: 'button', 'class': 'cbi-button cbi-button-apply', click: changeMode }, _('应用制式'));
		const reload = E('button', { type: 'button', 'class': 'cbi-button', click: reloadMode }, _('重新读取'));

		function update() {
			label.textContent = choices[current] || (current == null ? _('未读取到') : _('模组模式 %s').format(current));
			select.disabled = reload.disabled = busy;
			apply.disabled = busy || !select.value || +select.value === current;
		}

		function sync(value) {
			current = value;
			select.value = choices[current] ? String(current) : '';
			update();
		}

		async function reloadMode() {
			if (busy) return;
			busy = true;
			update();
			try { sync(await read()); }
			finally { busy = false; update(); }
		}

		async function changeMode() {
			if (apply.disabled) return;
			const requested = +select.value;
			busy = true;
			update();
			try {
				let r;
				try { r = await setRat(requested); }
				finally { sync(await read()); }
				if (r?.code !== 0 || /fail|error/i.test(r?.output || ''))
					throw new Error(common.resultText(r));
				if (current !== requested)
					throw new Error(_('尚未确认所选模式，请重新读取。'));
				ui.addTimeLimitedNotification(null, E('p', {}, _('网络模式已切换，正在重新搜网…')), 3500, 'info');
			}
			catch (err) {
				common.callError(_('网络模式'), err);
			}
			finally { busy = false; update(); }
		}

		sync(initial);
		return [
			common.field(_('当前模式'), [label, ' ', reload]),
			common.field(_('切换到'), [select, ' ', apply], 'a6-mode', _('切换后模组会重新搜网，数据会短暂中断。'))
		];
	}
});
