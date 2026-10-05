// Only invoked by the local public TLS test fixture. No actual provider Key.
import { GatewayCreditLedger } from '../dist/gateway-credit.js';
import { GatewayHostRehearsal } from '../dist/gateway-host.js';
import { GatewayNetworkBoundary } from '../dist/gateway-network.js';
import { creditHostDependencies } from '../dist/gateway-credit-owner.js';
import { bytesAt } from '../dist/files.js';
import { connect } from 'node:tls';
import { fileURLToPath } from 'node:url';
const [file, policyJson, cacheJson, launcher, portText, inputJson, crashPhase] = process.argv.slice(2);
const port = Number(portText); if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || !['none','response_validated','completion_committed'].includes(crashPhase)) throw Error('invalid fixture args');
const ledger = new GatewayCreditLedger(file, JSON.parse(policyJson), await creditHostDependencies(launcher, { now: () => Date.parse('2026-10-05T00:00:00Z') }), JSON.parse(cacheJson));
const ca = bytesAt(fileURLToPath(new URL('../fixtures/gateway-http-tls/cert.pem', import.meta.url)));
const boundary = new GatewayNetworkBoundary({ resolve: async () => [{ address: '8.8.8.8', family: 4, ttl_seconds: 60 }], connect: options => {
  const socket = connect({ ...options, host: '127.0.0.1', port, ca }); Object.defineProperty(socket, 'remoteAddress', { get: () => '8.8.8.8' }); return socket;
} });
const coordinator = new GatewayHostRehearsal({ ledger, boundary, phase: phase => { if (phase === crashPhase) process.exit(73); } });
try { const result = await coordinator.execute(JSON.parse(inputJson), 'host'); console.log(JSON.stringify({ state: 'completed', replay: result.replay, admission: result.billing_admission_ready })); }
catch (error) { console.log(JSON.stringify({ state: error.reason ?? 'fixture_failed' })); }
finally { await coordinator.close(); }
