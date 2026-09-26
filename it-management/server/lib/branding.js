// Names shown across the app and the look of the sign-in page. Stored in the settings table.
const { setting } = require('./util');

const LOGIN_PRESETS = {
  default: 'Soft blue',
  navy: 'Midnight navy',
  ocean: 'Ocean teal',
  forest: 'Forest green',
  sunset: 'Sunset orange',
  graphite: 'Graphite',
};

const DEFAULTS = {
  system_name: 'IT Management System',
  dashboard_title: 'Dashboard',
  dashboard_subtitle: 'What IT equipment we have, where it is, who uses it, and which network & ISP it runs on.',
  login_message: 'Sign in to manage IT assets, inventory and the network.',
};

function branding() {
  const bg = setting('login_bg');
  const logo = setting('company_logo');
  const version = setting('branding_version', '1');
  return {
    company_name: setting('company_name', 'My Company'),
    system_name: setting('system_name') || DEFAULTS.system_name,
    dashboard_title: setting('dashboard_title') || DEFAULTS.dashboard_title,
    dashboard_subtitle: setting('dashboard_subtitle') ?? DEFAULTS.dashboard_subtitle,
    login_message: setting('login_message') ?? DEFAULTS.login_message,
    login_bg_preset: LOGIN_PRESETS[setting('login_bg_preset')] ? setting('login_bg_preset') : 'default',
    login_bg_url: bg ? `/api/public/login-background?v=${version}` : null,
    logo_url: logo ? `/api/public/logo?v=${version}` : null,
    presets: LOGIN_PRESETS,
  };
}

module.exports = { branding, LOGIN_PRESETS, DEFAULTS };
