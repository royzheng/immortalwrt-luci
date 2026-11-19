# AIR6 LuCI branch

Initial upstream commit: `ad75cde88e694b511100576bfbe0a280e5efe6ef`.

This branch imports `applications/luci-app-air6-modem` and `themes/luci-theme-design` from the owner's AIR6 source tree. The modem package intentionally uses `package.mk`: it builds native helpers and has a custom install recipe. Moving it into this feed does not imply replacing that recipe with `luci.mk`.

The Design theme is preserved as source; the recorded v7 firmware used Argon, so migration does not enable Design by default. The standalone CPE web application belongs to `royzheng/immortalwrt-packages:air6`, and board/kernel support belongs to `royzheng/immortalwrt:air6`.

The migrated application reflects the local source tree, including its previous UI changes, rather than silently restoring the older Debian tree's authorization UI. Full firmware compilation and device behavior remain to be validated after migration.

The AIR6 modem application installs a small first-boot script selecting Chinese and the Argon theme when installed. Upstream LuCI configuration, system RPC ACLs and static resources are retained instead of importing an old rootfs snapshot. The parent-owned personal license-init service is not part of this feed.
