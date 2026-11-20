# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for OpenVPN Server
LUCI_DEPENDS:=+luci-compat +openvpn-openssl +openvpn-easy-rsa +kmod-tun

PKG_NAME:=luci-app-openvpn-server
PKG_VERSION:=3.0
PKG_RELEASE:=4
PKG_CONFIG_DEPENDS+=CONFIG_TARGET_mediatek_mt6990_DEVICE_softbank_air6

# AIR6 uses the netifd OpenVPN backend. Other targets retain the legacy UI.
ifeq ($(CONFIG_TARGET_mediatek_mt6990_DEVICE_softbank_air6),y)
  LUCI_PKGARCH:=
  define Build/Prepare/luci-app-openvpn-server
	rm -rf $(PKG_BUILD_DIR)/luasrc/model $(PKG_BUILD_DIR)/luasrc/view
	rm -f $(PKG_BUILD_DIR)/root/etc/config/openvpn $(PKG_BUILD_DIR)/root/etc/easy-rsa/vars-server
	$(CP) ./netifd/pki-exchange.c $(PKG_BUILD_DIR)/
	$(CP) ./netifd/root/. $(PKG_BUILD_DIR)/root/
	$(CP) ./netifd/luasrc/. $(PKG_BUILD_DIR)/luasrc/
  endef
  define Build/OpenVPNExchange
	$(INSTALL_DIR) $(PKG_BUILD_DIR)/root/usr/libexec
	$(TARGET_CC) $(TARGET_CPPFLAGS) $(TARGET_CFLAGS) $(TARGET_LDFLAGS) -o $(PKG_BUILD_DIR)/root/usr/libexec/openvpn-pki-exchange $(PKG_BUILD_DIR)/pki-exchange.c
  endef
  Hooks/Compile/Post += Build/OpenVPNExchange
endif

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
