#!/bin/sh
# Normal starts and exports reuse existing credentials. Rotation is explicit.
set -eu
case "$#:${1-}" in 0:|1:--rotate) ;; *) exit 2;; esac
umask 077
base=/etc/openvpn-server
mkdir -p "$base"
exec 9>"$base/.pki.lock"
flock -x 9
if [ -d "$base/pki" ] && [ "${1-}" != --rotate ]; then
	for file in ca.crt issued/server.crt private/server.key issued/client1.crt private/client1.key; do
		[ -s "$base/pki/$file" ] || { echo 'Existing PKI is incomplete' >&2; exit 1; }
	done
	exit 0
fi
work="$(mktemp -d "$base/.new-pki.XXXXXX")"
trap 'rm -rf "$work"' EXIT
export EASYRSA_PKI="$work/pki" EASYRSA_BATCH=1 EASYRSA_ALGO=ec EASYRSA_CURVE=prime256v1
easyrsa init-pki
EASYRSA_REQ_CN='AIR6 OpenVPN CA' easyrsa build-ca nopass
easyrsa build-server-full server nopass
easyrsa build-client-full client1 nopass
# Generation and verification finish before publishing any new credentials.
openssl verify -CAfile "$EASYRSA_PKI/ca.crt" -purpose sslserver "$EASYRSA_PKI/issued/server.crt"
openssl verify -CAfile "$EASYRSA_PKI/ca.crt" -purpose sslclient "$EASYRSA_PKI/issued/client1.crt"
# Check the committed interface state before publishing a rotation.
restart=0
if [ "${1-}" = --rotate ]; then
	if status="$(ubus call network.interface.ovpnserver status 2>/dev/null)"; then
		if [ "$(jsonfilter -s "$status" -e @.up)" = true ] ||
		   [ "$(jsonfilter -s "$status" -e @.pending)" = true ]; then
			restart=1
		fi
	elif [ "$(uci -q get network.ovpnserver.disabled)" != 1 ]; then
		echo 'Could not determine OpenVPN interface state' >&2
		exit 1
	fi
fi
if [ -d "$base/pki" ]; then
	/usr/libexec/openvpn-pki-exchange "$EASYRSA_PKI" "$base/pki"
else
	mv "$EASYRSA_PKI" "$base/pki"
fi

if [ "$restart" = 1 ] && ! ubus call network.interface.ovpnserver restart; then
	if [ -d "$EASYRSA_PKI" ] && ! /usr/libexec/openvpn-pki-exchange "$EASYRSA_PKI" "$base/pki"; then
		trap - EXIT
		echo "Previous PKI retained in $EASYRSA_PKI" >&2
	fi
	exit 1
fi
