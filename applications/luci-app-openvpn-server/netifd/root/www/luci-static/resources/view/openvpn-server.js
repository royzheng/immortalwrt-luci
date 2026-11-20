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

async function runHelper(path) {
	const result = await fs.exec(path);
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
			catch (e) { ui.addNotification(null, E('p', {}, [e.message]), 'error'); }
		};

		const parse = m.parse.bind(m);
		m.parse = async function() {
			await parse();
			if (uci.get('network', instance, 'proto') !== 'openvpn' || uci.get('firewall', rule) !== 'rule')
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
