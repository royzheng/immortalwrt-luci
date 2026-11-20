// SPDX-License-Identifier: Apache-2.0
#define _GNU_SOURCE
#include <fcntl.h>
#include <linux/fs.h>
#include <stdio.h>
#include <sys/syscall.h>
#include <unistd.h>

/* BusyBox mv cannot atomically replace a populated PKI directory. */
int main(int argc, char **argv)
{
	if (argc != 3)
		return 2;
	if (syscall(SYS_renameat2, AT_FDCWD, argv[1], AT_FDCWD, argv[2], RENAME_EXCHANGE)) {
		perror("exchange PKI directories");
		return 1;
	}
	return 0;
}
