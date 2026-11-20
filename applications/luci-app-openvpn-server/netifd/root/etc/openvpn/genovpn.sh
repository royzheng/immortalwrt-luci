#!/bin/sh
# Only the client identity is exported. Stream it directly to the authenticated request.
set -eu
pki=/etc/openvpn-server/pki
remote="$(uci -q get network.ovpnserver.ddns)"
port="$(uci -q get network.ovpnserver.port)"
case "$remote" in ''|*[!a-zA-Z0-9.:_-]*) exit 1;; esac
case "$port" in ''|*[!0-9]*) exit 1;; esac
[ "$port" -gt 0 ] && [ "$port" -le 65535 ] || exit 1
proto="$(uci -q get network.ovpnserver.ovpnproto)"
case "$proto" in
	udp4|udp6) ;;
	tcp4-server) proto=tcp4-client;;
	tcp6-server) proto=tcp6-client;;
	*) exit 1;;
esac
for file in ca.crt issued/client1.crt private/client1.key; do [ -s "$pki/$file" ] || exit 1; done
cat <<-CONFIG
	client
	dev tun
	proto $proto
	remote $remote $port
	remote-cert-tls server
	nobind
	persist-key
	persist-tun
	<ca>
CONFIG
cat "$pki/ca.crt"
printf '%s\n' '</ca>' '<cert>'
sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' "$pki/issued/client1.crt"
printf '%s\n' '</cert>' '<key>'
cat "$pki/private/client1.key"
printf '%s\n' '</key>'
if [ -f /etc/openvpn-addon.conf ]; then cat /etc/openvpn-addon.conf; fi
