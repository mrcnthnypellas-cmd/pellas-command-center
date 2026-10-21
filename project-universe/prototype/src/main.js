import { App } from './app.js';

const app = new App();
// Exposed for the Android back button (via evaluateJavascript) and automated tests.
window.PU = {
  app,
  handleBack: () => app.handleBack(),
  state: () => app.debugState(),
  screenOf: (id) => app.screenOf(id),
};
app.boot().catch((err) => console.error('George Universal Sunbox failed to start', err));
