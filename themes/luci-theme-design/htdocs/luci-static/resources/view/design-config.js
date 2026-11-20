'use strict';
'require view';
'require form';

return view.extend({
	render() {
		const m = new form.Map('design', _('Design Theme Settings'));
		const s = m.section(form.TypedSection, 'global');
		s.anonymous = true;
		s.addremove = false;

		const mode = s.option(form.ListValue, 'mode', _('Color scheme'));
		mode.value('normal', _('Follow system'));
		mode.value('light', _('Light'));
		mode.value('dark', _('Dark'));
		mode.default = 'normal';
		mode.rmempty = false;

		const nav = s.option(form.Flag, 'navbar', _('Show navigation bar'));
		nav.enabled = 'display';
		nav.disabled = 'close';
		nav.default = nav.enabled;
		nav.rmempty = false;

		const proxy = s.option(form.ListValue, 'navbar_proxy', _('Navigation bar proxy shortcut'),
			_('The shortcut appears when the selected service is installed.'));
		proxy.depends('navbar', 'display');
		proxy.retain = true;
		proxy.value('auto', _('Automatic'));
		proxy.value('none', _('None'));
		proxy.value('shadowsocksr', 'ShadowSocksR');
		proxy.value('homeproxy', 'HomeProxy');
		proxy.value('openclash', 'OpenClash');
		proxy.default = 'auto';
		proxy.rmempty = false;
		return m.render();
	}
});
