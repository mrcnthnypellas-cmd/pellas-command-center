// Test-only (node -r): spawned test servers trust the test suite's throwaway license signing key.
if (process.env.ITMS_TEST_LICENSE_PUB) require('../server/lib/licenseKey').publicKeyHex = process.env.ITMS_TEST_LICENSE_PUB;
