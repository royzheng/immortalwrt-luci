// SPDX-License-Identifier: Apache-2.0

import { mkdir, lstat, opendir, open, readlink, rename, unlink } from 'fs';
import { sha256, sha256_file } from 'digest';
import { load_catalog, change_catalog, close_catalog, get_translations, getuid } from 'luci.core';

const catalog_dir = '/usr/lib/lua/luci/i18n';
const cache_dir = '/tmp/luci-translations';
const empty = 'window.TR={};';

// Match the native catalogue loader's directory order, including duplicate keys.
// Hash the inputs themselves so an in-place edit with preserved timestamps is visible.
function input_digest(lang) {
	const dir = opendir(catalog_dir);
	if (!dir)
		return null;

	const suffix = '.' + lang + '.lmo';
	const hashes = [];
	for (let name = dir.read(); name != null; name = dir.read()) {
		if (substr(name, -length(suffix)) == suffix) {
			const digest = sha256_file(catalog_dir + '/' + name);
			if (digest != null)
				push(hashes, digest);
		}
	}
	dir.close();
	return length(hashes) ? sha256(join('', hashes)) : null;
}

function cache_path(lang) {
	mkdir(cache_dir, 0700);
	const st = lstat(cache_dir);
	return st?.type == 'directory' && st.uid == getuid() && !(st.mode & 0077)
		? cache_dir + '/' + lang : null;
}

function read_snapshot(path, inputs, with_body) {
	const fd = open(path, 'r');
	if (!fd)
		return null;

	let result;
	if (fd.read('line') == inputs + '\n') {
		const version = trim(fd.read('line') ?? '');
		if (match(version, /^[0-9a-f]{64}$/))
			result = { version, body: with_body ? fd.read('all') : null };
	}
	fd.close();
	return result;
}

function save_snapshot(path, inputs, version, body) {
	const tmp = path + '.' + readlink('/proc/self');
	const fd = open(tmp, 'w', 0600);
	if (!fd)
		return;

	const header = inputs + '\n' + version + '\n';
	const complete = fd.write(header) == length(header) && fd.write(body) == length(body);
	if (!(fd.close() && complete && rename(tmp, path)))
		unlink(tmp);
}

export function dictionary(lang, with_body) {
	const inputs = match(lang, /^[a-zA-Z0-9]+([-_][a-zA-Z0-9]+)*$/) ? input_digest(lang) : null;
	if (!inputs)
		return { version: sha256(empty), body: empty };

	const path = cache_path(lang);
	const cached = path ? read_snapshot(path, inputs, with_body) : null;
	if (cached)
		return cached;

	// A persistent interpreter may already have the previous generation mapped.
	close_catalog(lang);
	load_catalog(lang, catalog_dir);
	const body = render(() => {
		print('window.TR={');
		if (change_catalog(lang))
			get_translations((key, val) => printf('"%08x":%J,', key, val));
		print('};');
	});
	const version = sha256(body);
	// Don't associate a snapshot with inputs that changed during rendering.
	if (path && inputs == input_digest(lang))
		save_snapshot(path, inputs, version, body);

	return { version, body };
}

export function translations_url(dispatcher) {
	return dispatcher.build_url('admin/translations', dispatcher.lang) +
		'?v=' + dictionary(dispatcher.lang, false).version;
}
