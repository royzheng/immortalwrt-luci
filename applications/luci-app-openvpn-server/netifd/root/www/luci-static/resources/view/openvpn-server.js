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

async function editAddon() {
	const previous = await fs.read(addonPath).catch(err => {
		if (err.name === 'NotFoundError') return '';
		throw err;
	});
	const editor = new ui.Textarea(previous, { rows: 12, monospace: true });
	ui.showModal(_('Special Code'), [
		E('p', {}, _('(!)Special Code you know that add in to client .ovpn file')),
		editor.render(),
		E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
			' ',
			E('button', { 'class': 'btn cbi-button-save', 'click': ui.createHandlerFn(null, async () => {
				const value = editor.getValue().replace(/\r\n?/g, '\n');
				try {
					const result = await saveAddon(previous, value);
					if (result.error === 'changed')
						throw new Error(_('The client options changed. Reopen the editor to load the latest copy.'));
					if (result.error)
						throw new Error(_('Unable to save the client options.'));
					ui.hideModal();
				}
				catch (err) { showError(err); }
			}) }, _('Save'))
		])
	]);
}

async function runHelper(path, args) {
	const result = await fs.exec(path, args);
	if (result.code !== 0)
		throw new Error(_('The operation failed. Check the server address and certificates.'));
	return result.stdout || '';
}

return view.extend({
	load() { return Promise.all([uci.load('network'), uci.load('firewall')]); },

	render() {
		const m = new form.Map('network', _('OpenVPN Server'));
		m.chain('firewall');
		const section = m.section(form.NamedSection, instance, 'interface');
		section.addremove = false;
		const state = E('span', { role: 'status' });
		const status = section.option(form.DummyValue, '_status', _('Status'));
		status.renderWidget = () => state;
		async function refresh() {
			try {
				const live = await getStatus();
				state.textContent = live.up ? _('Running') : live.pending ? _('Starting…') : _('Stopped');
			}
			catch (err) {
				state.textContent = uci.get('network', instance, 'disabled') === '1' ? _('Disabled') : _('Status unavailable');
			}
		}
		const enabled = section.option(form.Flag, 'disabled', _('Enable OpenVPN server'));
		enabled.enabled = '0';
		enabled.disabled = '1';
		enabled.default = '1';
		enabled.rmempty = false;

		const protocol = section.option(form.ListValue, 'ovpnproto', _('Protocol'));
		for (const [value, label] of [['udp4','UDP / IPv4'],['udp6','UDP / IPv6'],['tcp4-server','TCP / IPv4'],['tcp6-server','TCP / IPv6']])
			protocol.value(value, label);
		protocol.rmempty = false;

		const port = section.option(form.Value, 'port', _('Port'));
		port.datatype = 'port';
		port.rmempty = false;

		const endpoint = section.option(form.Value, 'ddns', _('WAN DDNS or IP'));
		endpoint.datatype = 'host(0)';
		endpoint.placeholder = 'vpn.example.com';

		const subnet = section.option(form.Value, 'server', _('Client Network'));
		subnet.datatype = 'tuple(ip4addr("nomask"),ip4addr("nomask"))';
		subnet.placeholder = '10.8.0.0 255.255.255.0';
		subnet.rmempty = false;

		const push = section.option(form.DynamicList, 'push', _('Client Settings'),
			_('Enter one option per row, for example route 192.168.10.0 255.255.255.0 or dhcp-option DNS 192.168.10.1.'));
		push.validate = (sid, value) => /[\x00-\x1f\x7f'"\\,]|--/.test(value)
			? _('Enter a single unquoted OpenVPN push option.') : true;

		const options = section.option(form.Button, '_addon', _('Special Code'));
		options.inputtitle = _('Edit client options');
		options.onclick = () => editAddon().catch(showError);

		const renew = section.option(form.Button, '_rotate', _('Renew OpenVPN certificate files'));
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

		const download = section.option(form.Button, '_download', _('OpenVPN Client config file'),
			_('Apply the public address and port before downloading the client profile.'));
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
		};
		poll.add(refresh, 5);
		return m.render().then(async node => { await refresh(); return node; });
	}
});
