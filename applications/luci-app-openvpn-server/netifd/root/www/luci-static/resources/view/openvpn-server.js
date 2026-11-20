'use strict';
'require view';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require ui';

const instance = 'ovpnserver';
const rule = 'ovpnsrv_in';
const getStatus = rpc.declare({ object: 'network.interface.ovpnserver', method: 'status', expect: {}, reject: true });

const addonPath = '/etc/openvpn-addon.conf';
const saveAddon = rpc.declare({
	object: 'luci.openvpn-server', method: 'saveAddon', params: ['previous', 'content'], reject: true
});

function showError(err) {
	ui.addNotification(null, E('p', {}, [err.message]), 'error');
}

function readAddon() {
	return fs.read(addonPath).catch(err => {
		if (err.name === 'NotFoundError') return '';
		throw err;
	});
}

function validPush(value) {
	return !/[\x00-\x1f\x7f'"\\,]|--/.test(value);
}

const EditablePushList = form.Value.extend({
	renderWidget(sectionId, optionIndex, cfgvalue) {
		const root = E('div', { id: this.cbid(sectionId), style: 'display:grid; gap:.65rem; width:100%' });
		const disabled = (this.readonly ?? this.map.readonly) ? '' : null;
		const changed = () => root.dispatchEvent(new CustomEvent('widget-change', { bubbles: true }));

		function makeRow(value, adding) {
			const title = adding ? _('Add client setting') : _('Client Settings');
			const field = E('input', {
				type: 'text', class: 'cbi-input-text', value, disabled,
				'aria-label': title, placeholder: adding ? title : null,
				style: 'flex:1 1 auto; min-width:0; width:100%'
			});
			const row = E('div', { style: 'display:flex; align-items:center; gap:.65rem' }, [field]);
			const button = E('button', {
				type: 'button', disabled, style: 'flex:none; min-width:3rem', 'aria-label': adding ? _('Add') : _('Remove'),
				class: 'cbi-button ' + (adding ? 'cbi-button-add' : 'cbi-button-negative')
			}, adding ? '+' : '×');
			field.addEventListener('input', () => {
				field.classList.toggle('cbi-input-invalid', !validPush(field.value.trim()));
				changed();
			});
			button.addEventListener('click', () => {
				if (adding) {
					const text = field.value.trim();
					if (!text || !validPush(text)) { field.focus(); return; }
					root.insertBefore(makeRow(text, false), row);
					field.value = '';
					field.focus();
				}
				else {
					row.remove();
				}
				changed();
			});
			field.addEventListener('keydown', ev => {
				if (ev.key !== 'Enter') return;
				ev.preventDefault();
				if (adding) button.click();
			});
			row.appendChild(button);
			return row;
		}

		for (const value of L.toArray(cfgvalue))
			root.appendChild(makeRow(value, false));
		root.appendChild(makeRow('', true));
		return root;
	},

	formvalue(sectionId) {
		const root = this.map.findElement('id', this.cbid(sectionId));
		// Include a draft in the add row when the user clicks Save directly.
		return root ? Array.from(root.querySelectorAll('input'), input => input.value.trim()).filter(Boolean) : null;
	},

	isValid(sectionId) {
		return this.formvalue(sectionId)?.every(validPush) ?? true;
	},

	getValidationError() {
		return _('Enter a single unquoted OpenVPN push option.');
	}
});

async function runHelper(path, args) {
	const result = await fs.exec(path, args);
	if (result.code !== 0)
		throw new Error(_('The operation failed. Check the server address and certificates.'));
	return result.stdout || '';
}

return view.extend({
	load() { return Promise.all([uci.load('network'), uci.load('firewall')]); },

	render() {
		const m = new form.Map('network', _('OpenVPN Server'), _('An easy config OpenVPN Server Web-UI'));
		m.chain('firewall');
		const state = E('strong', { role: 'status' });
		const status = m.section(form.TypedSection);
		status.render = () => E('div', { class: 'cbi-section' }, [E('p', {}, [E('em', {}, [state])])]);
		async function refresh() {
			let label, running = false;
			try {
				const live = await getStatus();
				running = live.up;
				label = running ? _('Running') : live.pending ? _('Starting…') : _('Stopped');
			}
			catch (err) {
				label = uci.get('network', instance, 'disabled') === '1' ? _('Disabled') : _('Status unavailable');
			}
			state.classList.toggle('error', !running);
			state.textContent = _('OpenVPN Server') + ' ' + label;
		}

		const section = m.section(form.NamedSection, instance, 'interface');
		section.addremove = false;
		section.tab('basic', _('Base Setting'));
		section.tab('code', _('Special Code'));
		const enabled = section.taboption('basic', form.Flag, 'disabled', _('Enable'));
		enabled.enabled = '0';
		enabled.disabled = '1';
		enabled.default = '1';
		enabled.rmempty = false;

		const protocol = section.taboption('basic', form.ListValue, 'ovpnproto', _('Protocol'));
		for (const [value, label] of [['udp4','UDP / IPv4'],['udp6','UDP / IPv6'],['tcp4-server','TCP / IPv4'],['tcp6-server','TCP / IPv6']])
			protocol.value(value, label);
		protocol.rmempty = false;

		const port = section.taboption('basic', form.Value, 'port', _('Port'));
		port.datatype = 'port';
		port.rmempty = false;

		const endpoint = section.taboption('basic', form.Value, 'ddns', _('WAN DDNS or IP'));
		endpoint.datatype = 'host(0)';
		endpoint.placeholder = 'vpn.example.com';

		const subnet = section.taboption('basic', form.Value, 'server', _('Client Network'), _('VPN Client Network IP with subnet'));
		subnet.datatype = 'tuple(ip4addr("nomask"),ip4addr("nomask"))';
		subnet.placeholder = '10.8.0.0 255.255.255.0';
		subnet.rmempty = false;

		section.taboption('basic', EditablePushList, 'push', _('Client Settings'),
			_('Enter one option per row, for example route 192.168.10.0 255.255.255.0 or dhcp-option DNS 192.168.10.1.'));
		const download = section.taboption('basic', form.Button, '_download', _('OpenVPN Client config file'),
			_('Apply the public address and port before downloading the client profile.'));
		download.inputstyle = 'reload';
		download.inputtitle = _('Download .ovpn file');
		download.onclick = async function() {
			try {
				await runHelper('/etc/openvpn/renewcert.sh');
				const profile = await runHelper('/etc/openvpn/genovpn.sh');
				const url = URL.createObjectURL(new Blob([profile], { type: 'application/x-openvpn-profile' }));
				const a = E('a', { href: url, download: 'air6-client.ovpn' });
				document.body.appendChild(a);
				a.click();
				a.remove();
				setTimeout(() => URL.revokeObjectURL(url), 1000);
			}
			catch (err) { showError(err); }
		};

		const renew = section.taboption('basic', form.Button, '_rotate', _('Renew OpenVPN certificate files'));
		renew.inputstyle = 'reload';
		renew.inputtitle = _('Renew');
		renew.onclick = async () => {
			if (!window.confirm(_('Replace the CA, server and client certificates? Connected clients will disconnect. Download and import a new .ovpn file on each client.')))
				return;
			try {
				await runHelper('/etc/openvpn/renewcert.sh', ['--rotate']);
				ui.addNotification(null, E('p', {}, _('Certificates replaced. Download the new client profile.')), 'info');
			}
			catch (err) { showError(err); }
		};

		const addon = section.taboption('code', form.TextValue, '_addon', _('(!)Special Code you know that add in to client .ovpn file'));
		addon.rows = 13;
		addon.monospace = true;
		addon.wrap = false;
		addon.load = readAddon;
		// This field is file-backed. Write it after the other fields have passed validation.
		addon.parse = () => {};

		const parse = m.parse.bind(m);
		m.parse = async function() {
			await parse();
			if (uci.get('network', instance, 'proto') !== 'openvpn' || uci.get('firewall', rule, '.type') !== 'rule')
				throw new Error(_('The OpenVPN server interface or firewall rule is missing.'));
			const active = uci.get('network', instance, 'disabled') === '0';
			if (active) await runHelper('/etc/openvpn/renewcert.sh');
			const proto = uci.get('network', instance, 'ovpnproto');
			uci.set('firewall', rule, 'enabled', active ? '1' : '0');
			uci.set('firewall', rule, 'proto', proto.startsWith('tcp') ? 'tcp' : 'udp');
			uci.set('firewall', rule, 'family', proto.includes('6') ? 'ipv6' : 'ipv4');
			uci.set('firewall', rule, 'dest_port', uci.get('network', instance, 'port'));

			const previous = addon.cfgvalue(instance);
			const content = addon.formvalue(instance).replace(/\r\n?/g, '\n');
			if (content !== previous.replace(/\r\n?/g, '\n')) {
				const result = await saveAddon(previous, content);
				if (result.error === 'changed')
					throw new Error(_('The client options changed. Reload the page to load the latest copy.'));
				if (result.error)
					throw new Error(_('Unable to save the client options.'));
				addon.cfgvalue(instance, content);
			}
		};
		poll.add(refresh, 5);
		return m.render().then(async node => { await refresh(); return node; });
	}
});
