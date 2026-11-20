#!/bin/sh
# Create this server's CA and first client only if there is no existing PKI.
set -eu
umask 077
base=/etc/openvpn-server
mkdir -p "$base"
exec 9>"$base/.pki.lock"
flock -x 9
if [ -d "$base/pki" ]; then
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
mv "$EASYRSA_PKI" "$base/pki"
