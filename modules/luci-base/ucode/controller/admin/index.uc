// Copyright 2022 Jo-Philipp Wich <jo@mein.io>
// Licensed to the public under the Apache License 2.0.

import { dictionary } from 'luci.translations';

const ubus_types = [
	null,
	'array',
	'object',
	'string',
	null, // INT64
	'number',
	null, // INT16,
	'boolean',
	'double'
];


function ubus_reply(id, data, code, errmsg) {
	const reply = { jsonrpc: '2.0', id };

	if (errmsg)
		reply.error = { code, message: errmsg };
	else if (type(code) == 'object')
		reply.result = code;
	else if (data != null)
		reply.result = [ code, data ];
	else
		reply.result = [ code ];

	return reply;
}

function ubus_access(sid, obj, fun) {
	return (ubus.call('session', 'access', {
		ubus_rpc_session: sid,
		scope: 'ubus',
		object: obj,
		function: fun
	})?.access == true);
}

function ubus_request(req) {
	if (type(req?.method) != 'string' || req?.jsonrpc != '2.0' || req?.id == null)
		return ubus_reply(null, null, -32600, 'Invalid request');

	if (req.method == 'call') {
		if (type(req?.params) != 'array' || length(req.params) < 3)
			return ubus_reply(null, null, -32600, 'Invalid parameters');

		let sid = req.params[0],
		    obj = req.params[1],
		    fun = req.params[2],
		    arg = req.params[3] ?? {};

		if (type(arg) != 'object' || exists(arg, 'ubus_rpc_session'))
			return ubus_reply(req.id, null, -32602, 'Invalid parameters');

		if (sid == '00000000000000000000000000000000' && ctx.authsession)
			sid = ctx.authsession;

		if (!ubus_access(sid, obj, fun))
			return ubus_reply(req.id, null, -32002, 'Access denied');

		arg.ubus_rpc_session = sid;


		// clear error
		ubus.error();

		const res = ubus.call(obj, fun, arg);

		return ubus_reply(req.id, res, ubus.error(true) ?? 0);
	}

	if (req.method == 'list') {
		if (req?.params == null || (type(req.params) == 'array' && length(req.params) == 0)) {
			return ubus_reply(req.id, null, ubus.list());
		}
		else if (type(req.params) == 'array') {
			const rv = {};

			for (let param in req.params) {
				if (type(param) != 'string')
					return ubus_reply(req.id, null, -32602, 'Invalid parameters');

				for (let m, p in ubus.list(param)?.[0]) {
					for (let pn, pt in p) {
						rv[param] ??= {};
						rv[param][m] ??= {};
						rv[param][m][pn] = ubus_types[pt] ?? 'unknown';
					}
				}
			}

			return ubus_reply(req.id, null, rv);
		}
		else {
			return ubus_reply(req.id, null, -32602, 'Invalid parameters')
		}
	}

	return ubus_reply(req.id, null, -32601, 'Method not found')
}


return {
	action_ubus: function() {
		let request;

		try { request = json(http.content()); }
		catch { request = null; }

		http.prepare_content('application/json; charset=UTF-8');

		if (type(request) == 'object')
			http.write_json(ubus_request(request));
		else if (type(request) == 'array')
			http.write_json(map(request, ubus_request));
		else
			http.write_json(ubus_reply(null, null, -32700, 'Parse error'))
	},

	action_translations: function(reqlang) {
		const catalog = dictionary(reqlang ?? dispatcher.lang, true);
		const etag = '"' + catalog.version + '"';
		const immutable = http.formvalue('v') == catalog.version;

		http.header('Cache-Control', immutable ? 'private, max-age=31536000, immutable' : 'private, no-cache');
		http.header('ETag', etag);
		http.prepare_content('application/javascript; charset=UTF-8');

		const validators = split(http.getenv('HTTP_IF_NONE_MATCH') ?? http.getenv('headers')?.['if-none-match'] ?? '', ',');
		for (let value in validators) {
			const tag = trim(value);
			if (tag == '*' || tag == etag || tag == 'W/' + etag) {
				const method = http.getenv('REQUEST_METHOD');
				if (method == 'GET' || method == 'HEAD')
					http.status(304, 'Not Modified');
				else
					http.status(412, 'Precondition Failed');
				return;
			}
		}

		http.write(catalog.body);
	},

	action_logout: function() {
		const url = dispatcher.build_url();

		if (ctx.authsession) {
			ubus.call('session', 'destroy', { ubus_rpc_session: ctx.authsession });

			if (http.getenv('HTTPS') == 'on')
				http.header('Set-Cookie', `sysauth_https=; expires=Thu, 01 Jan 1970 01:00:00 GMT; path=${url}`);
			else
				http.header('Set-Cookie', `sysauth_http=; expires=Thu, 01 Jan 1970 01:00:00 GMT; path=${url}`);
		}

		http.redirect(url);
	},

	action_menu: function() {
		const session = dispatcher.is_authenticated({ methods: [ 'cookie:sysauth_https', 'cookie:sysauth_http' ] });
		const menu = dispatcher.menu_json(session?.acls ?? {}) ?? {};

		http.prepare_content('application/json; charset=UTF-8');
		http.write_json(menu);
	}
};
