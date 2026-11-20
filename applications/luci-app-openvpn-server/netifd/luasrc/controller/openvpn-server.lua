module("luci.controller.openvpn-server", package.seeall)

function index()
	entry({"admin", "vpn"}, firstchild(), "VPN", 45).dependent = false
	local page = entry({"admin", "vpn", "openvpn-server"}, view("openvpn-server"), _("OpenVPN Server"), 80)
	page.dependent = false
	page.acl_depends = { "luci-app-openvpn-server" }
end
