# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for OpenVPN Server
LUCI_DEPENDS:=+luci-compat +openvpn-openssl +openvpn-easy-rsa +kmod-tun

PKG_NAME:=luci-app-openvpn-server
PKG_VERSION:=3.0
PKG_RELEASE:=2
PKG_CONFIG_DEPENDS+=CONFIG_TARGET_mediatek_mt6990_DEVICE_softbank_air6

# AIR6 uses the netifd OpenVPN backend. Other targets retain the legacy UI.
ifeq ($(CONFIG_TARGET_mediatek_mt6990_DEVICE_softbank_air6),y)
  define Build/Prepare/luci-app-openvpn-server
	rm -rf $(PKG_BUILD_DIR)/luasrc/model $(PKG_BUILD_DIR)/luasrc/view
	rm -f $(PKG_BUILD_DIR)/root/etc/config/openvpn $(PKG_BUILD_DIR)/root/etc/easy-rsa/vars-server
	$(CP) ./netifd/root/. $(PKG_BUILD_DIR)/root/
	$(CP) ./netifd/luasrc/. $(PKG_BUILD_DIR)/luasrc/
  endef
endif

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
