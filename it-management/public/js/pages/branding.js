// Editable names (company, system, dashboard title) shared by the dashboard and Settings → Appearance.
import { api, state, openModal, formHtml, readForm, toast, esc, resolveImage } from '../core.js';

// Push new names into the running app without a reload.
export async function applyBranding(b) {
  b = { ...b, logo_url: await resolveImage(b.logo_url) };
  Object.assign(state.company, {
    name: b.company_name, system_name: b.system_name, dashboard_title: b.dashboard_title,
    dashboard_subtitle: b.dashboard_subtitle, logo: b.logo_url,
  });
  document.querySelectorAll('[data-brand-company]').forEach((n) => { n.textContent = b.company_name; });
  document.querySelectorAll('[data-brand-system]').forEach((n) => { n.textContent = b.system_name; });
  const logo = document.querySelector('.sidebar .brand-logo');
  if (logo) logo.innerHTML = b.logo_url ? `<img src="${esc(b.logo_url)}" alt="">` : 'IT';
}

export function editNamesModal() {
  const c = state.company;
  openModal({
    title: 'Edit names',
    body: `<p class="muted" style="margin-top:0">These appear in the sidebar, the dashboard, the sign-in page and the browser tab.</p>${formHtml([
      { name: 'company_name', label: 'Company name', required: true, value: c.name, attrs: 'maxlength="80"' },
      { name: 'system_name', label: 'System name', required: true, value: c.system_name, attrs: 'maxlength="60"', help: 'Shown under the company name, e.g. “IT Management System”' },
      { name: 'dashboard_title', label: 'Dashboard title', required: true, value: c.dashboard_title, attrs: 'maxlength="60"' },
      { name: 'dashboard_subtitle', label: 'Dashboard description', type: 'textarea', rows: 2, value: c.dashboard_subtitle, attrs: 'maxlength="200"', span: 2 },
    ])}`,
    onSubmit: async (form) => {
      const b = await api.put('/settings/branding', readForm(form));
      await applyBranding(b);
      toast('Names updated');
      window.dispatchEvent(new Event('itms:refresh'));
    },
  });
}
